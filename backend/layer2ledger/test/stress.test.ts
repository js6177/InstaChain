import { describe, expect, it } from "bun:test";
import {
	createLayer2LedgerClient,
	createLayer2TestHelperClient,
	ErrorCodes,
	unwrapLayer2LedgerResponse,
	unwrapLayer2TestHelperResponse,
} from "@openl2/api-layer2ledger";
import { createOpenL2Logger } from "@openl2/openl2-logger";
import {
	buildTransferMessage,
	NODE_ASSET_ID_HEX,
} from "@openl2/openl2-messaging";
import { newLayer2Address } from "./common";

const runHttpStress = process.env.RUN_LEDGER_HTTP_STRESS === "1";

const log = createOpenL2Logger({
	serviceName: "layer2ledger-stress",
});

const ledgerApiUrl =
	process.env.LAYER2LEDGER_API_URL ?? "http://layer2ledgerapihandler:8000";
const testhelperUrl =
	process.env.TESTHELPER_BASE_URL ?? "http://layer2ledger-testhelper:8001";

async function sleep(ms: number): Promise<void> {
	await Bun.sleep(ms);
}

/** Run async work over items with a fixed concurrency limit. */
async function mapPool<T, R>(
	items: readonly T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		for (;;) {
			const index = nextIndex;
			nextIndex += 1;
			if (index >= items.length) {
				return;
			}
			results[index] = await fn(items[index] as T, index);
		}
	}

	const workerCount = Math.max(1, Math.min(concurrency, items.length));
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

async function waitForApiHealth(
	baseUrl: string,
	timeoutMs: number,
): Promise<void> {
	const ledger = createLayer2LedgerClient(baseUrl);
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = unwrapLayer2LedgerResponse(await ledger.get());
			if (response.error_code === ErrorCodes.SUCCESS) {
				return;
			}
		} catch {
			// Retry until timeout.
		}
		await sleep(500);
	}
	throw new Error(`Timed out waiting for ledger API at ${baseUrl}`);
}

/**
 * Push `transactionCount` transfers through the live Elysia API, wait for the
 * running dbwriter to persist them, and return how many landed in Postgres
 * (via explorer.get_transaction).
 */
async function runPushTransactionStress(
	transactionCount: number,
): Promise<number> {
	const amount = 100;
	const fee = 10;
	const initialBalance = 1000;
	const concurrency = Number(process.env.STRESS_CONCURRENCY ?? "10");
	const settleTimeoutMs = Number(
		process.env.STRESS_SETTLE_TIMEOUT_MS ?? "120000",
	);

	const ledger = createLayer2LedgerClient(ledgerApiUrl);
	const testhelper = createLayer2TestHelperClient(testhelperUrl);

	await waitForApiHealth(ledgerApiUrl, 60_000);

	const nodeInfo = unwrapLayer2LedgerResponse(
		await ledger.info.get_node_info.get(),
	);
	expect(nodeInfo.error_code).toBe(ErrorCodes.SUCCESS);
	const nodeId = nodeInfo.node_info.node_id;
	const assetId = nodeInfo.node_info.asset_id || NODE_ASSET_ID_HEX;

	const prepared = await mapPool(
		Array.from({ length: transactionCount }, (_, index) => index),
		concurrency,
		async () => {
			const source = newLayer2Address();
			const dest = newLayer2Address();
			const transactionId = crypto.randomUUID();
			const message = buildTransferMessage(
				nodeId,
				assetId,
				source.public_key_str_base58,
				dest.public_key_str_base58,
				amount,
				fee,
				transactionId,
			);
			const signature = await source.signMessage(message);
			return { source, dest, transactionId, signature };
		},
	);

	await mapPool(prepared, concurrency, async ({ source }) => {
		unwrapLayer2TestHelperResponse(
			await testhelper.testhelper.seed.balance.post({
				address: source.public_key_str_base58,
				balance: initialBalance,
				include_deposit_transaction: false,
			}),
		);
	});

	const pushResponses = await mapPool(
		prepared,
		concurrency,
		async ({ source, dest, transactionId, signature }) =>
			unwrapLayer2LedgerResponse(
				await ledger.transfer.push_transaction.post({
					amount,
					destination_address_public_key: dest.public_key_str_base58,
					fee,
					signature,
					source_address_public_key: source.public_key_str_base58,
					transaction_id: transactionId,
				}),
			),
	);

	const accepted = pushResponses.filter(
		(response) => response.error_code === ErrorCodes.SUCCESS,
	).length;
	if (accepted !== transactionCount) {
		const sample = pushResponses
			.filter((response) => response.error_code !== ErrorCodes.SUCCESS)
			.slice(0, 5)
			.map((response) => `${response.error_code}: ${response.error_message}`);
		throw new Error(
			`Expected ${transactionCount} accepted pushes, got ${accepted}. Sample errors: ${sample.join(" | ")}`,
		);
	}

	const transactionIds = prepared.map(({ transactionId }) => transactionId);
	const deadline = Date.now() + settleTimeoutMs;
	let processedToPostgres = 0;

	while (Date.now() < deadline) {
		const lookups = await mapPool(
			transactionIds,
			concurrency,
			async (transactionId) =>
				unwrapLayer2LedgerResponse(
					await ledger.explorer.get_transaction.post({
						layer2_transaction_id: transactionId,
					}),
				),
		);
		processedToPostgres = lookups.filter(
			(response) => response.error_code === ErrorCodes.SUCCESS,
		).length;
		if (processedToPostgres === transactionCount) {
			return processedToPostgres;
		}
		await sleep(500);
	}

	return processedToPostgres;
}

describe.skipIf(!runHttpStress)("pushTransaction HTTP stress", () => {
	it(
		"measures end-to-end throughput through the live apihandler and dbwriter",
		async () => {
			const transactionCount = Number(process.env.STRESS_TX_COUNT ?? "100");
			expect(Number.isFinite(transactionCount) && transactionCount > 0).toBe(
				true,
			);

			const startedAt = performance.now();
			const processedToPostgres =
				await runPushTransactionStress(transactionCount);
			const elapsedMs = Math.round(performance.now() - startedAt);
			const txsPerSecond = Number(
				((processedToPostgres / Math.max(elapsedMs, 1)) * 1000).toFixed(2),
			);
			const throughput = {
				transactionCount,
				processedToPostgres,
				elapsedMs,
				txsPerSecond,
			};

			log.info("pushTransaction stress throughput", throughput);

			const stressResultFile = process.env.STRESS_RESULT_FILE;
			if (stressResultFile) {
				await Bun.write(
					stressResultFile,
					`${JSON.stringify(throughput, null, 2)}\n`,
				);
			}

			expect(processedToPostgres).toBe(transactionCount);
		},
		{ timeout: 300_000 },
	);
});
