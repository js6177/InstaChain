/**
 * 1Hz Redis monitor during k6: PING latency-history equivalent + CLIENT LIST.
 * Runs inside the stress container (same compose network as apihandler).
 */
import {
	RedisInstanceRole,
	type RedisDuringSample,
} from "@openl2/stress-results";
import { appendFile } from "node:fs/promises";
import {
	captureRedisDuringSample,
	redisCliLatencyHistoryPath,
	redisDuringSamplesPath,
} from "./redis-diagnostics";
import { createRedisClients } from "./prepare-push";

function formatLatencyHistoryLine(sample: RedisDuringSample): string {
	// Mimic redis-cli --latency-history style: min max avg samples
	const { minMs, maxMs, avgMs, sampleCount } = sample.pingLatencyMs;
	return (
		`${minMs.toFixed(2)} ${maxMs.toFixed(2)} ${avgMs.toFixed(2)} ${sampleCount} ` +
		`clients=${sample.connectedClients} ops=${sample.instantaneousOpsPerSec} ` +
		`ts=${sample.capturedAtUnixMs}\n`
	);
}

export async function runRedisDuringMonitor(options: {
	mode: string;
	intervalMs: number;
	signal: AbortSignal;
}): Promise<void> {
	const intervalMs = Math.max(100, options.intervalMs);
	const jsonlPath = redisDuringSamplesPath(options.mode);
	const txHistoryPath = redisCliLatencyHistoryPath(
		options.mode,
		RedisInstanceRole.Transactions,
	);
	const abHistoryPath = redisCliLatencyHistoryPath(
		options.mode,
		RedisInstanceRole.AddressBalance,
	);

	await Bun.write(jsonlPath, "");
	await Bun.write(txHistoryPath, "");
	await Bun.write(abHistoryPath, "");

	const { redisTransaction, redisAddressBalance } = await createRedisClients();
	console.log(
		`redis during-monitor started mode=${options.mode} interval_ms=${intervalMs} ` +
			`jsonl=${jsonlPath}`,
	);

	try {
		while (!options.signal.aborted) {
			const tickStarted = Date.now();
			try {
				const [txSample, abSample] = await Promise.all([
					captureRedisDuringSample({
						redis: redisTransaction,
						role: RedisInstanceRole.Transactions,
					}),
					captureRedisDuringSample({
						redis: redisAddressBalance,
						role: RedisInstanceRole.AddressBalance,
					}),
				]);
				await appendFile(
					jsonlPath,
					`${JSON.stringify(txSample)}\n${JSON.stringify(abSample)}\n`,
				);
				await appendFile(txHistoryPath, formatLatencyHistoryLine(txSample));
				await appendFile(abHistoryPath, formatLatencyHistoryLine(abSample));
				console.log(
					`redis-during tx_ping_avg_ms=${txSample.pingLatencyMs.avgMs.toFixed(3)} ` +
						`tx_clients=${txSample.connectedClients} ` +
						`ab_ping_avg_ms=${abSample.pingLatencyMs.avgMs.toFixed(3)} ` +
						`ab_clients=${abSample.connectedClients} ` +
						`tx_ops=${txSample.instantaneousOpsPerSec}`,
				);
			} catch (error) {
				console.warn(
					`redis during-monitor tick failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}

			const elapsed = Date.now() - tickStarted;
			const sleepMs = Math.max(0, intervalMs - elapsed);
			if (sleepMs > 0 && !options.signal.aborted) {
				await Promise.race([
					Bun.sleep(sleepMs),
					new Promise<void>((resolve) => {
						if (options.signal.aborted) {
							resolve();
							return;
						}
						options.signal.addEventListener("abort", () => resolve(), {
							once: true,
						});
					}),
				]);
			}
		}
	} finally {
		await redisTransaction.quit();
		await redisAddressBalance.quit();
		console.log(`redis during-monitor stopped mode=${options.mode}`);
	}
}
