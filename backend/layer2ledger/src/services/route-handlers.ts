import type { Layer2LedgerAPIHandlerConfig } from "@openl2/config-loader";
import { logPerformance } from "@openl2/openl2-logger";
import {
	type MessagingContext,
	NODE_ASSET_ID_HEX,
	verifyDeposit,
	verifyGetDepositAddress,
	verifyTransferMessage,
	verifyWithdrawalBroadcasted,
	verifyWithdrawalConfirmed,
	verifyWithdrawalRequestMessage,
} from "@openl2/openl2-messaging";
import { isPubkeyValidChars } from "@openl2/pubkey-utils";
import { deriveAddressFromXpubSegwit } from "@openl2/pubkey-utils/btc";
import { and, eq, inArray, or } from "drizzle-orm";
import type Redis from "ioredis";
import {
	buildCommonResponse,
	type CommonResponse,
	type DepositConfirmedRequest,
	type DepositConfirmedResponse,
	ErrorCodes,
	type GetBalanceRequest,
	type GetBalanceResponse,
	type GetBalanceResponseBalance,
	type GetDepositAddressRequest,
	type GetDepositAddressResponse,
	type GetFeeRequest,
	type GetFeeResponse,
	type GetNodeInfoResponse,
	type GetTransactionRequest,
	type GetTransactionResponse,
	type GetTransactionsRequest,
	type GetTransactionsResponse,
	type GetWithdrawalRequestsRequest,
	type GetWithdrawalRequestsResponse,
	getErrorMessage,
	type Layer1BroadcastedWithdrawalTransactionStatus,
	type Layer1TransactionIdStatus,
	type Layer1WithdrawalConfirmedTransactionStatus,
	type Layer2LedgerRouteHandlers,
	type PushTransactionRequest,
	type RequestWithdrawalRequest,
	type TransactionGroup,
	type WithdrawalBroadcastedRequest,
	type WithdrawalBroadcastedResponse,
	type WithdrawalConfirmedRequest,
	type WithdrawalConfirmedResponse,
	type WithdrawalRequest,
} from "../api";
import type { Layer2LedgerDbClient } from "../db/client";
import {
	confirmedWithdrawals,
	depositAddresses,
	layer2AddressBalance,
	TransactionType,
	transactions,
	WithdrawalStatus,
	withdrawalRequests,
} from "../db/schema";
import { log } from "../logger";
import { mapTransactionRow } from "../mappers/transaction-mapper";
import {
	type AddressBalanceCacheOptions,
	getCachedAddressBalance,
	setCachedAddressBalance,
} from "../redis/address-balance-cache";
import type { DistributedLock } from "../redis/distributed-lock";
import {
	PENDING_TRANSACTIONS_LIST_KEY,
	PENDING_WITHDRAWALS_LIST_KEY,
} from "../redis/distributed-lock";
import {
	createRedisTransaction,
	type PendingTransaction,
	type PendingWithdrawal,
	type RedisWithdrawalRequest,
} from "../redis/models";
import { bloomMaybeContainsTransactionId } from "../redis/transaction-id-bloom";
import {
	buildLayer1TransactionId,
	buildLayer2WithdrawalId,
} from "../utils/keybuilders";

export interface RouteHandlerContext {
	db: Layer2LedgerDbClient;
	redis: Redis;
	lockManager: DistributedLock;
	settings: Layer2LedgerAPIHandlerConfig;
	messaging: MessagingContext;
	balanceCache: AddressBalanceCacheOptions;
}

/**
 * Bloom says absent → definitely not a duplicate (skip Postgres).
 * Bloom says maybe → confirm with a Postgres primary-key lookup.
 */
async function isDuplicateLayer2TransactionId(
	db: Layer2LedgerDbClient,
	redis: Redis,
	layer2TransactionId: string,
): Promise<boolean> {
	const maybePresent = await bloomMaybeContainsTransactionId(
		redis,
		layer2TransactionId,
	);
	if (!maybePresent) {
		return false;
	}
	const existing = await db
		.select({ id: transactions.layer2TransactionId })
		.from(transactions)
		.where(eq(transactions.layer2TransactionId, layer2TransactionId))
		.limit(1);
	return existing.length > 0;
}

/**
 * Read absolute balance from Redis cache, falling back to Postgres and warming
 * the cache on miss.
 */
async function getAddressBalance(
	db: Layer2LedgerDbClient,
	redis: Redis,
	address: string,
	balanceCache: AddressBalanceCacheOptions,
): Promise<number | undefined> {
	const cached = await getCachedAddressBalance(redis, address);
	if (cached !== null) {
		return cached;
	}
	const balanceRows = await db
		.select({ balance: layer2AddressBalance.balance })
		.from(layer2AddressBalance)
		.where(eq(layer2AddressBalance.address, address))
		.limit(1);
	const balance = balanceRows[0]?.balance;
	if (balance !== undefined) {
		await setCachedAddressBalance(redis, address, balance, balanceCache);
	}
	return balance;
}

class Layer2LedgerRouteHandlersImpl implements Layer2LedgerRouteHandlers {
	constructor(private readonly ctx: RouteHandlerContext) {}

	health(): CommonResponse {
		return buildCommonResponse(ErrorCodes.SUCCESS);
	}

	@logPerformance(log)
	async pushTransaction(
		body: PushTransactionRequest,
	): Promise<CommonResponse> {
		const { db, redis, lockManager, messaging } = this.ctx;
		if (!isPubkeyValidChars(body.source_address_public_key)) {
			return buildCommonResponse(ErrorCodes.INVALID_SOURCE_ADDRESS);
		}
		if (!isPubkeyValidChars(body.destination_address_public_key)) {
			return buildCommonResponse(ErrorCodes.INVALID_DESTINATION_ADDRESS);
		}
		if (body.amount <= 0) {
			return buildCommonResponse(ErrorCodes.INVALID_AMOUNT);
		}

		const validSignature = await verifyTransferMessage(
			messaging,
			body.source_address_public_key,
			body.destination_address_public_key,
			body.amount,
			body.fee,
			body.transaction_id,
			body.signature,
		);
		if (!validSignature) {
			return buildCommonResponse(ErrorCodes.INVALID_SIGNATURE);
		}

		const addressesToLock = [
			body.source_address_public_key,
			body.destination_address_public_key,
		].sort();
		const lockToken = await lockManager.acquireMultiLock(addressesToLock);
		if (!lockToken) {
			return buildCommonResponse(ErrorCodes.ADDRESS_LOCKED);
		}

		try {
			if (
				await isDuplicateLayer2TransactionId(db, redis, body.transaction_id)
			) {
				await lockManager.releaseMultiLock(addressesToLock, lockToken);
				return buildCommonResponse(ErrorCodes.CANNOT_DUPLICATE_TRANSACTION);
			}

			const balance = await getAddressBalance(
				db,
				redis,
				body.source_address_public_key,
				this.ctx.balanceCache,
			);
			if (balance === undefined || balance < body.amount) {
				await lockManager.releaseMultiLock(addressesToLock, lockToken);
				return buildCommonResponse(ErrorCodes.INSUFFICIENT_FUNDS);
			}

			const pending: PendingTransaction = {
				transaction: createRedisTransaction(
					body.amount,
					body.fee,
					body.source_address_public_key,
					body.destination_address_public_key,
					TransactionType.TRX_TRANSFER,
					body.transaction_id,
					body.signature,
				),
				lock_token: lockToken,
				addresses_locked: addressesToLock,
			};
			await redis.rpush(
				PENDING_TRANSACTIONS_LIST_KEY,
				JSON.stringify(pending),
			);
		} catch (error) {
			await lockManager.releaseMultiLock(addressesToLock, lockToken);
			return buildCommonResponse(ErrorCodes.UNKNOWN, String(error));
		}

		return buildCommonResponse(
			ErrorCodes.SUCCESS,
			"Confirmed, pending insertion into db",
		);
	}

	async getDepositAddress(
		body: GetDepositAddressRequest,
	): Promise<GetDepositAddressResponse> {
		const { db, messaging, settings } = this.ctx;
		if (!isPubkeyValidChars(body.layer2_address_pubkey)) {
			return {
				...buildCommonResponse(ErrorCodes.INVALID_SOURCE_ADDRESS),
				layer1_deposit_address: null,
			};
		}

		const validSignature = await verifyGetDepositAddress(
			messaging,
			body.layer2_address_pubkey,
			body.nonce,
			body.signature,
		);
		if (!validSignature) {
			return {
				...buildCommonResponse(ErrorCodes.INVALID_SIGNATURE),
				layer1_deposit_address: null,
			};
		}

		const inserted = await db
			.insert(depositAddresses)
			.values({
				layer2Address: body.layer2_address_pubkey,
				nonce: body.nonce,
				layer1Address: "",
				signature: body.signature,
				mpkIndex: -1,
			})
			.returning({ id: depositAddresses.id });

		const depositAddressId = inserted[0]?.id;
		if (!depositAddressId) {
			return {
				...buildCommonResponse(
					ErrorCodes.UNKNOWN,
					"Failed to generate layer1 address",
				),
				layer1_deposit_address: null,
			};
		}

		let layer1Address: string;
		try {
			layer1Address = deriveAddressFromXpubSegwit(
				settings.deposit_wallet_master_pubkey,
				0,
				depositAddressId,
				true,
			);
		} catch {
			return {
				...buildCommonResponse(
					ErrorCodes.UNKNOWN,
					"Failed to generate layer1 address",
				),
				layer1_deposit_address: null,
			};
		}

		await db
			.update(depositAddresses)
			.set({ layer1Address, mpkIndex: depositAddressId })
			.where(eq(depositAddresses.id, depositAddressId));

		return {
			...buildCommonResponse(ErrorCodes.SUCCESS),
			layer1_deposit_address: layer1Address,
		};
	}

	async depositConfirmed(
		body: DepositConfirmedRequest,
	): Promise<DepositConfirmedResponse> {
		const { db, redis, messaging, settings } = this.ctx;
		const results: Layer1TransactionIdStatus[] = [];
		for (const deposit of body.transactions) {
			const validSignature = await verifyDeposit(
				messaging,
				deposit.layer1_transaction_id,
				deposit.layer1_transaction_vout,
				deposit.layer1_address,
				deposit.amount,
				deposit.nonce,
				deposit.signature,
			);
			if (!validSignature) {
				results.push({
					layer1_transaction_id: deposit.layer1_transaction_id,
					layer1_transaction_vout: deposit.layer1_transaction_vout,
					error_code: ErrorCodes.INVALID_SIGNATURE,
					error_message: getErrorMessage(ErrorCodes.INVALID_SIGNATURE),
				});
				continue;
			}

			if (await isDuplicateLayer2TransactionId(db, redis, deposit.nonce)) {
				results.push({
					layer1_transaction_id: deposit.layer1_transaction_id,
					layer1_transaction_vout: deposit.layer1_transaction_vout,
					error_code: ErrorCodes.CANNOT_DUPLICATE_TRANSACTION,
					error_message: getErrorMessage(
						ErrorCodes.CANNOT_DUPLICATE_TRANSACTION,
					),
				});
				continue;
			}

			const depositRows = await db
				.select({ layer2Address: depositAddresses.layer2Address })
				.from(depositAddresses)
				.where(eq(depositAddresses.layer1Address, deposit.layer1_address))
				.limit(1);
			const layer2Address = depositRows[0]?.layer2Address;
			if (!layer2Address) {
				results.push({
					layer1_transaction_id: deposit.layer1_transaction_id,
					layer1_transaction_vout: deposit.layer1_transaction_vout,
					error_code: ErrorCodes.DEPOSIT_ADDRESS_NOT_FOUND,
					error_message: getErrorMessage(
						ErrorCodes.DEPOSIT_ADDRESS_NOT_FOUND,
					),
				});
				continue;
			}

			const pending: PendingTransaction = {
				transaction: createRedisTransaction(
					deposit.amount,
					0,
					settings.deposit_transaction_pubkey,
					layer2Address,
					TransactionType.TRX_DEPOSIT,
					deposit.nonce,
					deposit.signature,
					buildLayer1TransactionId(
						deposit.layer1_transaction_id,
						deposit.layer1_transaction_vout,
					),
				),
				lock_token: null,
				addresses_locked: [],
			};
			await redis.rpush(
				PENDING_TRANSACTIONS_LIST_KEY,
				JSON.stringify(pending),
			);
			results.push({
				layer1_transaction_id: deposit.layer1_transaction_id,
				layer1_transaction_vout: deposit.layer1_transaction_vout,
				error_code: ErrorCodes.SUCCESS,
				error_message: getErrorMessage(ErrorCodes.SUCCESS),
			});
		}

		return {
			...buildCommonResponse(ErrorCodes.SUCCESS),
			transactions: results,
		};
	}

	async requestWithdrawal(
		body: RequestWithdrawalRequest,
	): Promise<CommonResponse> {
		const { db, redis, lockManager, messaging } = this.ctx;
		if (!isPubkeyValidChars(body.source_address_public_key)) {
			return buildCommonResponse(ErrorCodes.INVALID_SOURCE_ADDRESS);
		}
		if (!body.layer1_withdrawal_address) {
			return buildCommonResponse(ErrorCodes.INVALID_DESTINATION_ADDRESS);
		}
		if (body.amount <= 0) {
			return buildCommonResponse(ErrorCodes.INVALID_AMOUNT);
		}

		const validSignature = await verifyWithdrawalRequestMessage(
			messaging,
			body.source_address_public_key,
			body.layer1_withdrawal_address,
			body.layer2_transaction_id,
			body.amount,
			body.signature,
		);
		if (!validSignature) {
			return buildCommonResponse(ErrorCodes.INVALID_SIGNATURE);
		}

		const addressesToLock = [body.source_address_public_key];
		const lockToken = await lockManager.acquireMultiLock(addressesToLock);
		if (!lockToken) {
			return buildCommonResponse(ErrorCodes.ADDRESS_LOCKED);
		}

		try {
			if (
				await isDuplicateLayer2TransactionId(
					db,
					redis,
					body.layer2_transaction_id,
				)
			) {
				await lockManager.releaseMultiLock(addressesToLock, lockToken);
				return buildCommonResponse(ErrorCodes.CANNOT_DUPLICATE_TRANSACTION);
			}

			const balance = await getAddressBalance(
				db,
				redis,
				body.source_address_public_key,
				this.ctx.balanceCache,
			);
			if (balance === undefined || balance < body.amount) {
				await lockManager.releaseMultiLock(addressesToLock, lockToken);
				return buildCommonResponse(ErrorCodes.INSUFFICIENT_FUNDS);
			}

			const layer2WithdrawalId = buildLayer2WithdrawalId(
				body.layer2_transaction_id,
			);
			const withdrawalRequest: RedisWithdrawalRequest = {
				layer1_address: body.layer1_withdrawal_address,
				layer1_transaction_id: null,
				status: WithdrawalStatus.WITHDRAWAL_STATUS_PENDING,
				amount: body.amount,
				layer2_withdrawal_id: layer2WithdrawalId,
				server_signature: null,
				layer2_transaction_id: body.layer2_transaction_id,
				withdrawal_requested_timestamp: Math.floor(Date.now() / 1000),
				withdrawal_requested_timestamp_str: new Date().toISOString(),
				batch_height: 0,
			};

			const pending: PendingWithdrawal = {
				transaction: createRedisTransaction(
					body.amount,
					0,
					body.source_address_public_key,
					"",
					TransactionType.TRX_WITHDRAWAL_INITIATED,
					body.layer2_transaction_id,
					body.signature,
					"",
					layer2WithdrawalId,
				),
				withdrawal_request: withdrawalRequest,
				lock_token: lockToken,
				addresses_locked: addressesToLock,
			};
			await redis.rpush(
				PENDING_WITHDRAWALS_LIST_KEY,
				JSON.stringify(pending),
			);
		} catch (error) {
			await lockManager.releaseMultiLock(addressesToLock, lockToken);
			return buildCommonResponse(ErrorCodes.UNKNOWN, String(error));
		}

		return buildCommonResponse(
			ErrorCodes.SUCCESS,
			"Withdrawal request created",
		);
	}

	async getWithdrawalRequests(
		_body: GetWithdrawalRequestsRequest,
	): Promise<GetWithdrawalRequestsResponse> {
		const { db } = this.ctx;
		const pending = await db
			.select()
			.from(withdrawalRequests)
			.where(
				eq(
					withdrawalRequests.status,
					WithdrawalStatus.WITHDRAWAL_STATUS_PENDING,
				),
			);

		if (pending.length > 0) {
			await db
				.update(withdrawalRequests)
				.set({ status: WithdrawalStatus.WITHDRAWAL_STATUS_ACKNOWLEDGED })
				.where(
					inArray(
						withdrawalRequests.id,
						pending.map((row) => row.id),
					),
				);
		}

		return {
			...buildCommonResponse(ErrorCodes.SUCCESS),
			withdrawal_requests: pending.map(
				(row): WithdrawalRequest => ({
					layer1_address: row.layer1Address,
					layer1_transaction_id: row.layer1TransactionId,
					status: row.status,
					amount: row.amount,
					layer2_withdrawal_id: row.layer2WithdrawalId,
					server_signature: row.serverSignature,
					layer2_transaction_id: row.layer2TransactionId,
					withdrawal_requested_timestamp: row.withdrawalRequestedTimestamp,
					withdrawal_requested_timestamp_str:
						row.withdrawalRequestedTimestampStr?.toISOString() ?? null,
				}),
			),
		};
	}

	async withdrawalBroadcasted(
		body: WithdrawalBroadcastedRequest,
	): Promise<WithdrawalBroadcastedResponse> {
		const { db, messaging } = this.ctx;
		const responseTransactions: Layer1BroadcastedWithdrawalTransactionStatus[] =
			[];
		for (const tx of body.transactions) {
			const validSignature = await verifyWithdrawalBroadcasted(
				messaging,
				tx.layer1_transaction_id,
				tx.layer1_transaction_vout,
				tx.layer1_address,
				tx.amount,
				tx.layer2_withdrawal_id,
				tx.signature,
			);
			if (!validSignature) {
				responseTransactions.push({
					layer2_withdrawal_id: tx.layer2_withdrawal_id,
					error_code: ErrorCodes.INVALID_SIGNATURE,
					error_message: getErrorMessage(ErrorCodes.INVALID_SIGNATURE),
				});
				continue;
			}

			await db
				.update(withdrawalRequests)
				.set({ status: WithdrawalStatus.WITHDRAWAL_STATUS_BROADCASTED })
				.where(
					eq(withdrawalRequests.layer2WithdrawalId, tx.layer2_withdrawal_id),
				);

			await db.insert(confirmedWithdrawals).values({
				layer1TransactionId: tx.layer1_transaction_id,
				layer1TransactionVout: tx.layer1_transaction_vout,
				layer1Address: tx.layer1_address,
				amount: tx.amount,
				layer2WithdrawalId: tx.layer2_withdrawal_id,
				broadcastedSignature: tx.signature,
				confirmed: false,
			});

			responseTransactions.push({
				layer2_withdrawal_id: tx.layer2_withdrawal_id,
				error_code: ErrorCodes.SUCCESS,
				error_message: getErrorMessage(ErrorCodes.SUCCESS),
			});
		}

		return {
			...buildCommonResponse(ErrorCodes.SUCCESS),
			transactions: responseTransactions,
		};
	}

	async withdrawalConfirmed(
		body: WithdrawalConfirmedRequest,
	): Promise<WithdrawalConfirmedResponse> {
		const { db, messaging } = this.ctx;
		const responseTransactions: Layer1WithdrawalConfirmedTransactionStatus[] =
			[];
		for (const tx of body.transactions) {
			const validSignature = await verifyWithdrawalConfirmed(
				messaging,
				tx.layer1_transaction_id,
				tx.layer1_transaction_vout,
				tx.layer1_address,
				tx.amount,
				tx.signature,
			);
			if (!validSignature) {
				responseTransactions.push({
					layer1_transaction_id: tx.layer1_transaction_id,
					layer1_transaction_vout: tx.layer1_transaction_vout,
					error_code: ErrorCodes.INVALID_SIGNATURE,
					error_message: getErrorMessage(ErrorCodes.INVALID_SIGNATURE),
				});
				continue;
			}

			const updated = await db
				.update(confirmedWithdrawals)
				.set({ confirmed: true, confirmedSignature: tx.signature })
				.where(
					and(
						eq(
							confirmedWithdrawals.layer1TransactionId,
							tx.layer1_transaction_id,
						),
						eq(
							confirmedWithdrawals.layer1TransactionVout,
							tx.layer1_transaction_vout,
						),
					),
				)
				.returning({
					layer2WithdrawalId: confirmedWithdrawals.layer2WithdrawalId,
				});

			for (const row of updated) {
				await db
					.update(withdrawalRequests)
					.set({
						status: WithdrawalStatus.WITHDRAWAL_STATUS_CONFIRMED,
						layer1TransactionId: tx.layer1_transaction_id,
					})
					.where(
						eq(withdrawalRequests.layer2WithdrawalId, row.layer2WithdrawalId),
					);

				await db
					.update(transactions)
					.set({ layer1TransactionId: tx.layer1_transaction_id })
					.where(eq(transactions.layer2WithdrawalId, row.layer2WithdrawalId));
			}

			responseTransactions.push({
				layer1_transaction_id: tx.layer1_transaction_id,
				layer1_transaction_vout: tx.layer1_transaction_vout,
				error_code: ErrorCodes.SUCCESS,
				error_message: getErrorMessage(ErrorCodes.SUCCESS),
			});
		}

		return {
			...buildCommonResponse(ErrorCodes.SUCCESS),
			transactions: responseTransactions,
		};
	}

	async getBalance(body: GetBalanceRequest): Promise<GetBalanceResponse> {
		const { db, redis, balanceCache } = this.ctx;
		const balances: GetBalanceResponseBalance[] = [];
		for (const publicKey of body.public_keys) {
			const balance = await getAddressBalance(
				db,
				redis,
				publicKey,
				balanceCache,
			);
			balances.push({
				public_key: publicKey,
				balance: balance ?? 0,
				address_found: balance !== undefined,
			});
		}
		return {
			...buildCommonResponse(ErrorCodes.SUCCESS),
			balance: balances,
		};
	}

	async getTransaction(
		body: GetTransactionRequest,
	): Promise<GetTransactionResponse> {
		const { db } = this.ctx;
		const rows = await db
			.select()
			.from(transactions)
			.where(eq(transactions.layer2TransactionId, body.layer2_transaction_id))
			.limit(1);
		const row = rows[0];
		if (!row) {
			return {
				...buildCommonResponse(ErrorCodes.TRANSACTION_ID_NOT_FOUND),
				transaction: null,
				transaction_id: body.layer2_transaction_id,
			};
		}
		return {
			...buildCommonResponse(ErrorCodes.SUCCESS),
			transaction: mapTransactionRow(row),
			transaction_id: body.layer2_transaction_id,
		};
	}

	async getAllTransactions(
		body: GetTransactionsRequest,
	): Promise<GetTransactionsResponse> {
		const { db } = this.ctx;
		const transactionGroups: TransactionGroup[] = [];
		for (const publicKey of body.public_keys) {
			const rows = await db
				.select()
				.from(transactions)
				.where(
					or(
						eq(transactions.sourceAddressPubkey, publicKey),
						eq(transactions.destinationAddressPubkey, publicKey),
					),
				);
			transactionGroups.push({
				public_key: publicKey,
				transactions: rows.map(mapTransactionRow),
			});
		}
		return {
			...buildCommonResponse(ErrorCodes.SUCCESS),
			transaction_groups: transactionGroups,
		};
	}

	async getFee(_body: GetFeeRequest): Promise<GetFeeResponse> {
		const { settings } = this.ctx;
		return {
			...buildCommonResponse(ErrorCodes.SUCCESS),
			fee: settings.minimum_layer1_transaction_amount,
		};
	}

	async getNodeInfo(): Promise<GetNodeInfoResponse> {
		const { settings } = this.ctx;
		return {
			...buildCommonResponse(ErrorCodes.SUCCESS),
			node_info: {
				asset_id: NODE_ASSET_ID_HEX,
				deposit_address_derivation_path: "m/44/1",
				layer1_network_info: {
					minimum_transaction_amount:
						settings.minimum_layer1_transaction_amount,
				},
				node_id: settings.layer2ledger_node_id,
				node_name: settings.layer2ledger_node_id,
				onboarding_deposit_signing_key_pubkey:
					settings.onboarding_layer2_deposit_address.public_key,
				version: {
					API_version: 1,
					major_version: 0,
					minor_version: 1,
					patch_version: 0,
				},
			},
		};
	}
}

export function createRouteHandlers(
	context: RouteHandlerContext,
): Layer2LedgerRouteHandlers {
	return new Layer2LedgerRouteHandlersImpl(context);
}
