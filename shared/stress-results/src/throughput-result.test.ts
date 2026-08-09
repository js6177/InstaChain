import { describe, expect, it } from "bun:test";
import { StressApiErrors } from "./api-errors";
import { StressCacheStats } from "./cache-stats";
import { computeLatencyStats } from "./latency-stats";
import { StressPhaseTimingsMs } from "./phase-timings";
import { StressRoundThroughputResult, StressThroughputResult } from "./throughput-result";

describe("StressThroughputResult", () => {
	it("round-trips through JSON using structured parse", () => {
		const phases = new StressPhaseTimingsMs({
			prepareMs: 1,
			signMs: 2,
			seedMs: 3,
			pushMs: 4,
			settleMs: 5,
			pushToSettleMs: 9,
			totalMs: 15,
		});
		const round = new StressRoundThroughputResult({
			round: 1,
			transactionCount: 10,
			processedToPostgres: 10,
			acceptedPushes: 10,
			elapsedMs: 4,
			pushTxsPerSecond: 2.5,
			settledTxsPerSecond: 2,
			profilerSessionId: "session-1",
			txsPerSecond: 2.5,
			pushClientRttMs: computeLatencyStats([1, 2, 3, 4]),
			phaseTimingsMs: phases,
			apiErrors: StressApiErrors.empty(),
			cache: new StressCacheStats({ hits: 1, misses: 0 }),
			reusedSourceCount: 0,
		});
		const written = new StressThroughputResult({
			transactionCount: 10,
			addressOverlapPercent: 0,
			rounds: [round],
		});

		const parsed = StressThroughputResult.fromJsonText(JSON.stringify(written));
		expect(parsed).not.toBeNull();
		expect(parsed?.transactionCount).toBe(10);
		expect(parsed?.rounds).toHaveLength(1);
		expect(parsed?.rounds[0]?.profilerSessionId).toBe("session-1");
		expect(parsed?.rounds[0]?.phaseTimingsMs.pushMs).toBe(4);
		expect(parsed?.rounds[0]?.cache.hits).toBe(1);
	});

	it("still parses legacy two-round result files", () => {
		const phases = new StressPhaseTimingsMs({
			prepareMs: 1,
			signMs: 2,
			seedMs: 3,
			pushMs: 4,
			settleMs: 5,
			pushToSettleMs: 9,
			totalMs: 15,
		});
		const makeRound = (round: number): StressRoundThroughputResult =>
			new StressRoundThroughputResult({
				round,
				transactionCount: 10,
				processedToPostgres: 10,
				acceptedPushes: 10,
				elapsedMs: 4,
				pushTxsPerSecond: 2.5,
				settledTxsPerSecond: 2,
				profilerSessionId: `session-${round}`,
				txsPerSecond: 2.5,
				pushClientRttMs: computeLatencyStats([1, 2, 3, 4]),
				phaseTimingsMs: phases,
				apiErrors: StressApiErrors.empty(),
				cache: new StressCacheStats({ hits: 1, misses: 0 }),
				reusedSourceCount: round === 2 ? 5 : 0,
			});
		const written = new StressThroughputResult({
			transactionCount: 10,
			addressOverlapPercent: 50,
			rounds: [makeRound(1), makeRound(2)],
		});
		const parsed = StressThroughputResult.fromJsonText(JSON.stringify(written));
		expect(parsed?.rounds).toHaveLength(2);
		expect(parsed?.addressOverlapPercent).toBe(50);
	});
});
