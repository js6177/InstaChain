import {
	createLayer2LedgerClient,
	type DepositConfirmedRequest,
	type DepositConfirmedResponse,
	type DepositsConfirmed,
	ErrorCodes,
	type GetWithdrawalRequestsRequest,
	type GetWithdrawalRequestsResponse,
	type Layer1BroadcastedWithdrawalTransaction,
	type Layer1WithdrawalConfirmedTransaction,
	type Layer2LedgerClient,
	unwrapLayer2LedgerResponse,
	type WithdrawalBroadcastedRequest,
	type WithdrawalBroadcastedResponse,
	type WithdrawalConfirmedRequest,
	type WithdrawalConfirmedResponse,
} from "@openl2/api-layer2ledger";
import {
	buildDepositMessage,
	buildLayer1AuditReportMessage,
	buildWithdrawalBroadcastedMessage,
	buildWithdrawalConfirmedMessage,
} from "@openl2/openl2-messaging";
import { signMessage } from "@openl2/pubkey-utils";

export function successOrDuplicateErrorCode(error: number): boolean {
	return (
		error === ErrorCodes.SUCCESS ||
		error === ErrorCodes.CANNOT_DUPLICATE_TRANSACTION ||
		error === ErrorCodes.DUPLICATE_TRANSACTION_ID
	);
}

export interface Layer1TransactionConfirmationInput {
	transactionId: string;
	transactionVout: number;
	address: string;
	amount: number;
}

export type WithdrawalBroadcastInput = Omit<
	Layer1BroadcastedWithdrawalTransaction,
	"signature"
>;

export interface Layer1AddressBalanceInput {
	layer1_address: string;
	balance: number;
}

export interface PostLayer1AuditReportResponse {
	error_code: number;
}

const AUDIT_ROUTER_PREFIX = "/audit";
const POST_LAYER1_AUDIT_REPORT_ROUTE = "/post_layer1_audit_report";

export class Layer2Interface {
	private readonly client: Layer2LedgerClient;
	private readonly layer2NodeUrl: string;

	constructor(
		layer2NodeUrl: string,
		private readonly onboardingSigningPrivateKey: string,
		private readonly nodeId: string,
	) {
		this.layer2NodeUrl = layer2NodeUrl.endsWith("/")
			? layer2NodeUrl.slice(0, -1)
			: layer2NodeUrl;
		this.client = createLayer2LedgerClient(this.layer2NodeUrl);
	}

	async getWithdrawalRequests(
		lastWithdrawalTimestamp: number,
	): Promise<GetWithdrawalRequestsResponse> {
		const body: GetWithdrawalRequestsRequest = {
			latest_timestamp: lastWithdrawalTimestamp,
		};
		const result =
			await this.client.withdrawal.get_withdrawal_requests.post(body);
		return unwrapLayer2LedgerResponse(result);
	}

	async confirmDepositMulti(
		transactions: DepositsConfirmed[],
	): Promise<DepositConfirmedResponse> {
		const body: DepositConfirmedRequest = { transactions };
		const result = await this.client.deposit.deposit_confirmed.post(body);
		return unwrapLayer2LedgerResponse(result);
	}

	async broadcastWithdrawalMulti(
		transactions: Layer1BroadcastedWithdrawalTransaction[],
	): Promise<WithdrawalBroadcastedResponse> {
		const body: WithdrawalBroadcastedRequest = { transactions };
		const result =
			await this.client.withdrawal.withdrawal_broadcasted.post(body);
		return unwrapLayer2LedgerResponse(result);
	}

	async confirmWithdrawalMulti(
		transactions: Layer1WithdrawalConfirmedTransaction[],
	): Promise<WithdrawalConfirmedResponse> {
		const body: WithdrawalConfirmedRequest = { transactions };
		const result = await this.client.withdrawal.withdrawal_confirmed.post(body);
		return unwrapLayer2LedgerResponse(result);
	}

	async sendConfirmDeposit(
		transactions: Layer1TransactionConfirmationInput[],
	): Promise<DepositConfirmedResponse> {
		const depositTxs: DepositsConfirmed[] = [];
		for (const transaction of transactions) {
			const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
			const message = buildDepositMessage(
				this.nodeId,
				transaction.transactionId,
				transaction.transactionVout,
				transaction.address,
				transaction.amount,
				nonce,
			);
			const signature = await signMessage(
				message,
				this.onboardingSigningPrivateKey,
			);
			depositTxs.push({
				layer1_transaction_id: transaction.transactionId,
				layer1_transaction_vout: transaction.transactionVout,
				amount: transaction.amount,
				layer1_address: transaction.address,
				nonce,
				signature,
			});
		}
		return this.confirmDepositMulti(depositTxs);
	}

	async sendWithdrawalBroadcasted(
		transactions: WithdrawalBroadcastInput[],
	): Promise<WithdrawalBroadcastedResponse> {
		const signed: Layer1BroadcastedWithdrawalTransaction[] = [];
		for (const tx of transactions) {
			const message = buildWithdrawalBroadcastedMessage(
				this.nodeId,
				tx.layer1_transaction_id,
				tx.layer1_transaction_vout,
				tx.layer1_address,
				tx.amount,
				tx.layer2_withdrawal_id,
			);
			signed.push({
				...tx,
				signature: await signMessage(message, this.onboardingSigningPrivateKey),
			});
		}
		return this.broadcastWithdrawalMulti(signed);
	}

	async sendConfirmWithdrawal(
		transactions: Layer1TransactionConfirmationInput[],
	): Promise<WithdrawalConfirmedResponse> {
		const withdrawalTxs: Layer1WithdrawalConfirmedTransaction[] = [];
		for (const transaction of transactions) {
			const message = buildWithdrawalConfirmedMessage(
				this.nodeId,
				transaction.transactionId,
				transaction.transactionVout,
				transaction.address,
				transaction.amount,
			);
			withdrawalTxs.push({
				layer1_transaction_id: transaction.transactionId,
				layer1_transaction_vout: transaction.transactionVout,
				layer1_address: transaction.address,
				amount: transaction.amount,
				signature: await signMessage(message, this.onboardingSigningPrivateKey),
			});
		}
		return this.confirmWithdrawalMulti(withdrawalTxs);
	}

	async postLayer1AuditReport(
		blockHeight: number,
		balance: number,
		layer1AddressBalances: Layer1AddressBalanceInput[],
	): Promise<PostLayer1AuditReportResponse> {
		const message = buildLayer1AuditReportMessage(
			this.nodeId,
			blockHeight,
			balance,
		);
		const signature = await signMessage(
			message,
			this.onboardingSigningPrivateKey,
		);
		const url = `${this.layer2NodeUrl}${AUDIT_ROUTER_PREFIX}${POST_LAYER1_AUDIT_REPORT_ROUTE}`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				block_height: blockHeight,
				layer1_address_balances: layer1AddressBalances,
				signature,
			}),
		});
		if (!response.ok) {
			throw new Error(`postLayer1AuditReport failed: HTTP ${response.status}`);
		}
		return (await response.json()) as PostLayer1AuditReportResponse;
	}
}
