import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	buildDepositMessage,
	buildGetDepositAddressMessage,
	NODE_ASSET_ID_HEX,
} from "@openl2/openl2-messaging";
import { eq } from "drizzle-orm";
import { ErrorCodes } from "../src/api/models/common";
import { depositAddresses, TransactionType } from "../src/db/schema";
import { getPendingTransactions } from "../src/redis/distributed-lock";
import {
	backendCommon,
	bridgeSigningAddress,
	clearPendingQueues,
	createHandlers,
	db,
	newLayer2Address,
	redis,
	setupLedgerTests,
	teardownLedgerTests,
} from "./helpers";

beforeAll(async () => {
	await setupLedgerTests();
});

afterAll(async () => {
	await teardownLedgerTests();
});

describe("deposit route handlers", () => {
	it("creates and stores a layer1 deposit address", async () => {
		const user = newLayer2Address();
		const nonce = crypto.randomUUID();
		const message = buildGetDepositAddressMessage(
			backendCommon.node_id,
			NODE_ASSET_ID_HEX,
			user.public_key_str_base58,
			nonce,
		);
		const signature = await user.signMessage(message);

		const response = await createHandlers().getDepositAddress({
			layer2_address_pubkey: user.public_key_str_base58,
			signature,
			nonce,
		});

		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.layer1_deposit_address).toBeTruthy();

		const rows = await db
			.select()
			.from(depositAddresses)
			.where(
				eq(depositAddresses.layer1Address, response.layer1_deposit_address!),
			)
			.limit(1);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.layer2Address).toBe(user.public_key_str_base58);
	});

	it("queues a bridge-signed deposit confirmation in redis", async () => {
		const user = newLayer2Address();
		const bridge = bridgeSigningAddress();
		const handlers = createHandlers();

		const nonceGetAddress = crypto.randomUUID();
		const getAddressMessage = buildGetDepositAddressMessage(
			backendCommon.node_id,
			NODE_ASSET_ID_HEX,
			user.public_key_str_base58,
			nonceGetAddress,
		);
		const getAddressSignature = await user.signMessage(getAddressMessage);
		const getAddressResponse = await handlers.getDepositAddress({
			layer2_address_pubkey: user.public_key_str_base58,
			signature: getAddressSignature,
			nonce: nonceGetAddress,
		});
		expect(getAddressResponse.error_code).toBe(ErrorCodes.SUCCESS);
		const layer1DepositAddress = getAddressResponse.layer1_deposit_address!;
		expect(layer1DepositAddress).toBeTruthy();

		const layer1TxId = `l1_tx_id_${crypto.randomUUID()}`;
		const amount = 500;
		const nonceConfirm = crypto.randomUUID();
		const confirmMessage = buildDepositMessage(
			backendCommon.node_id,
			layer1TxId,
			0,
			layer1DepositAddress,
			amount,
			nonceConfirm,
		);
		const confirmSignature = await bridge.signMessage(confirmMessage);

		const response = await handlers.depositConfirmed({
			transactions: [
				{
					layer1_address: layer1DepositAddress,
					layer1_transaction_id: layer1TxId,
					layer1_transaction_vout: 0,
					amount,
					signature: confirmSignature,
					nonce: nonceConfirm,
				},
			],
		});

		expect(response.error_code).toBe(ErrorCodes.SUCCESS);

		const pending = await getPendingTransactions(redis, 0, -1);
		expect(pending).toHaveLength(1);
		expect(pending[0]?.transaction.amount).toBe(amount);
		expect(pending[0]?.transaction.destination_address_pubkey).toBe(
			user.public_key_str_base58,
		);
		expect(pending[0]?.transaction.transaction_type).toBe(
			TransactionType.TRX_DEPOSIT,
		);
		expect(pending[0]?.transaction.layer1_transaction_id).toBe(
			`${layer1TxId}:0`,
		);

		await clearPendingQueues();
	});
});
