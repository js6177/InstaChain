import { describe, expect, it } from "bun:test";
import { createOpenL2Logger } from "@openl2/openl2-logger";
import {
	buildTransferMessage,
	NODE_ASSET_ID_HEX,
	verifyTransferMessage,
} from "@openl2/openl2-messaging";
import { computeLatencyStats, newLayer2Address } from "./common";

const log = createOpenL2Logger({
	serviceName: "openl2-messaging-verify-bench",
	prettyJson: true,
});

describe("openl2 message verification timing", () => {
	it(
		"signs multiple transfer messages and reports average verify duration",
		async () => {
			const messageCount = Number(process.env.VERIFY_BENCH_COUNT ?? "1000");
			expect(Number.isFinite(messageCount) && messageCount > 0).toBe(true);

			const amount = 100;
			const fee = 10;
			const source = newLayer2Address();
			const dest = newLayer2Address();
			const context = {
				nodeId: "verify-bench-node",
				layer2BridgeSigningPublicKey: dest.public_key_str_base58,
			};

			const signed: Array<{ nonce: string; signature: string }> = [];
			const signLatenciesMs: number[] = [];
			for (let i = 0; i < messageCount; i++) {
				const nonce = crypto.randomUUID();
				const message = buildTransferMessage(
					context.nodeId,
					NODE_ASSET_ID_HEX,
					source.public_key_str_base58,
					dest.public_key_str_base58,
					amount,
					fee,
					nonce,
				);
				const signStartedAt = performance.now();
				const signature = await source.signMessage(message);
				signLatenciesMs.push(performance.now() - signStartedAt);
				signed.push({ nonce, signature });
			}

			// Warm up verify path once so the timed loop is steady-state.
			expect(
				await verifyTransferMessage(
					context,
					source.public_key_str_base58,
					dest.public_key_str_base58,
					amount,
					fee,
					signed[0]!.nonce,
					signed[0]!.signature,
				),
			).toBe(true);

			const verifyLatenciesMs: number[] = [];
			for (const sample of signed) {
				const verifyStartedAt = performance.now();
				const valid = await verifyTransferMessage(
					context,
					source.public_key_str_base58,
					dest.public_key_str_base58,
					amount,
					fee,
					sample.nonce,
					sample.signature,
				);
				verifyLatenciesMs.push(performance.now() - verifyStartedAt);
				expect(valid).toBe(true);
			}

			const signLatencyMs = computeLatencyStats(signLatenciesMs);
			const verifyLatencyMs = computeLatencyStats(verifyLatenciesMs);
			const verifyElapsedMs = verifyLatenciesMs.reduce(
				(total, value) => total + value,
				0,
			);

			log.info("openl2 message verification timing", {
				message_count: messageCount,
				sign_latency_ms: signLatencyMs,
				verify_latency_ms: verifyLatencyMs,
				verifies_per_second: Number(
					((messageCount / Math.max(verifyElapsedMs, 1)) * 1000).toFixed(2),
				),
			});
		},
		{ timeout: 180_000 },
	);
});
