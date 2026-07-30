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
import { buildLayer1TransactionId } from "../src/utils/keybuilders";
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
		const layer2Address = user.public_key_str_base58;
		const nonce = crypto.randomUUID();
		const message = buildGetDepositAddressMessage(
			backendCommon.node_id,
			NODE_ASSET_ID_HEX,
			layer2Address,
			nonce,
		);
		const signature = await user.signMessage(message);

		const response = await createHandlers().getDepositAddress({
			layer2_address_pubkey: layer2Address,
			signature,
			nonce,
		});

		expect(response.error_code).toBe(ErrorCodes.SUCCESS);
		expect(response.layer1_deposit_address).toBeTruthy();

		const layer1DepositAddress = response.layer1_deposit_address!;
		const rows = await db
			.select()
			.from(depositAddresses)
			.where(eq(depositAddresses.layer1Address, layer1DepositAddress))
			.limit(1);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.layer2Address).toBe(layer2Address);
	});

	it("queues a bridge-signed deposit confirmation in redis", async () => {
		const user = newLayer2Address();
		const layer2Address = user.public_key_str_base58;
		const bridge = bridgeSigningAddress();
		const handlers = createHandlers();
		const amount = 500;
		const layer1TransactionVout = 0;

		const nonceGetAddress = crypto.randomUUID();
		const getAddressMessage = buildGetDepositAddressMessage(
			backendCommon.node_id,
			NODE_ASSET_ID_HEX,
			layer2Address,
			nonceGetAddress,
		);
		const getAddressSignature = await user.signMessage(getAddressMessage);
		const getAddressResponse = await handlers.getDepositAddress({
			layer2_address_pubkey: layer2Address,
			signature: getAddressSignature,
			nonce: nonceGetAddress,
		});
		expect(getAddressResponse.error_code).toBe(ErrorCodes.SUCCESS);
		const layer1DepositAddress = getAddressResponse.layer1_deposit_address!;
		expect(layer1DepositAddress).toBeTruthy();

		const layer1TxId = `l1_tx_id_${crypto.randomUUID()}`;
		const expectedLayer1TransactionId = buildLayer1TransactionId(
			layer1TxId,
			layer1TransactionVout,
		);
		const nonceConfirm = crypto.randomUUID();
		const confirmMessage = buildDepositMessage(
			backendCommon.node_id,
			layer1TxId,
			layer1TransactionVout,
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
					layer1_transaction_vout: layer1TransactionVout,
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
			layer2Address,
		);
		expect(pending[0]?.transaction.transaction_type).toBe(
			TransactionType.TRX_DEPOSIT,
		);
		expect(pending[0]?.transaction.layer1_transaction_id).toBe(
			expectedLayer1TransactionId,
		);

		await clearPendingQueues();
	});
});
