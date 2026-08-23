import { describe, expect, it } from "bun:test";
import { emptyApiErrorCounts } from "./api-errors";
import {
	buildGetBalanceStressMatrix,
	DEFAULT_GET_BALANCE_ADDRESS_COUNTS,
	DEFAULT_GET_BALANCE_CACHE_PCTS,
	DEFAULT_GET_BALANCE_CALL_COUNTS,
	DEFAULT_GET_BALANCE_NONZERO_PCTS,
	getBalanceMissingAddressWorstCaseVariables,
	getBalanceStressHistoryPath,
	GetBalanceAddressMode,
	GetBalanceStressBatchResult,
	GetBalanceStressHistory,
	GetBalanceStressHistoryEntry,
	GetBalanceStressResult,
	GetBalanceStressVariables,
} from "./get-balance-stress";
import { LatencyStatsMs } from "./latency-stats";

describe("GetBalanceStressVariables", () => {
	it("emits description lines for Explorer table parsing", () => {
		const variables = new GetBalanceStressVariables({
			callCount: 1000,
			addressCount: 25,
			cachePct: 80,
			nonzeroPct: 50,
			addressMode: GetBalanceAddressMode.SeededPool,
		});
		expect(variables.toDescriptionLines()).toEqual([
			"get_balance_call_count=1000",
			"get_balance_address_count=25",
			"get_balance_cache_pct=80",
			"get_balance_nonzero_pct=50",
			"get_balance_address_mode=seeded_pool",
		]);
	});
});

describe("buildGetBalanceStressMatrix", () => {
	it("builds the default 2x3x3x2 matrix plus missing-address worst case", () => {
		const matrix = buildGetBalanceStressMatrix({
			callCounts: DEFAULT_GET_BALANCE_CALL_COUNTS,
			addressCounts: DEFAULT_GET_BALANCE_ADDRESS_COUNTS,
			cachePcts: DEFAULT_GET_BALANCE_CACHE_PCTS,
			nonzeroPcts: DEFAULT_GET_BALANCE_NONZERO_PCTS,
		});
		expect(matrix).toHaveLength(2 * 3 * 3 * 2 + 1);
		expect(matrix[0]).toEqual(
			new GetBalanceStressVariables({
				callCount: 1000,
				addressCount: 1,
				cachePct: 10,
				nonzeroPct: 50,
				addressMode: GetBalanceAddressMode.SeededPool,
			}),
		);
		expect(matrix[matrix.length - 2]).toEqual(
			new GetBalanceStressVariables({
				callCount: 2000,
				addressCount: 100,
				cachePct: 100,
				nonzeroPct: 25,
				addressMode: GetBalanceAddressMode.SeededPool,
			}),
		);
		expect(matrix[matrix.length - 1]).toEqual(
			getBalanceMissingAddressWorstCaseVariables(),
		);
		expect(matrix[matrix.length - 1]?.addressMode).toBe(
			GetBalanceAddressMode.MissingRandom,
		);
	});

	it("can omit the missing-address worst case", () => {
		const matrix = buildGetBalanceStressMatrix({
			callCounts: [100],
			addressCounts: [1],
			cachePcts: [100],
			nonzeroPcts: [50],
			includeMissingAddressWorstCase: false,
		});
		expect(matrix).toHaveLength(1);
		expect(matrix[0]?.addressMode).toBe(GetBalanceAddressMode.SeededPool);
	});
});

describe("GetBalanceStressBatchResult", () => {
	it("round-trips through JSON", () => {
		const run = new GetBalanceStressResult({
			variables: new GetBalanceStressVariables({
				callCount: 100,
				addressCount: 5,
				cachePct: 25,
				nonzeroPct: 75,
				addressMode: GetBalanceAddressMode.SeededPool,
			}),
			concurrency: 50,
			accepted: 100,
			successRatePct: 100,
			elapsedMs: 1234,
			requestsPerSecond: 81.04,
			clientRttMs: new LatencyStatsMs({
				average: 10,
				shortest: 2,
				longest: 40,
				bottomQuartile: 5,
				upperQuartile: 12,
			}),
			apiErrors: emptyApiErrorCounts(),
			profilerSessionId: "session-1",
			profilerOutputFile: "/tmp/profiler-session-session-1.json",
		});
		const batch = new GetBalanceStressBatchResult({
			batchId: "batch-1",
			runs: [run],
		});
		const parsed = GetBalanceStressBatchResult.fromJsonText(
			JSON.stringify(batch),
		);
		expect(parsed).not.toBeNull();
		expect(parsed?.batchId).toBe("batch-1");
		expect(parsed?.runs).toHaveLength(1);
		expect(parsed?.sessionIds()).toEqual(["session-1"]);
		expect(parsed?.runs[0]?.variables.addressMode).toBe(
			GetBalanceAddressMode.SeededPool,
		);
	});
});

describe("GetBalanceStressHistory", () => {
	it("prepends entries and enforces retention", () => {
		const run = new GetBalanceStressResult({
			variables: new GetBalanceStressVariables({
				callCount: 100,
				addressCount: 5,
				cachePct: 25,
				nonzeroPct: 75,
				addressMode: GetBalanceAddressMode.SeededPool,
			}),
			concurrency: 50,
			accepted: 100,
			successRatePct: 100,
			elapsedMs: 1234,
			requestsPerSecond: 81.04,
			clientRttMs: new LatencyStatsMs({
				average: 10,
				shortest: 2,
				longest: 40,
				bottomQuartile: 5,
				upperQuartile: 12,
			}),
			apiErrors: emptyApiErrorCounts(),
			profilerSessionId: "session-1",
			profilerOutputFile: "/tmp/profiler-session-session-1.json",
		});
		const batchA = new GetBalanceStressBatchResult({
			batchId: "batch-a",
			runs: [run],
		});
		const batchB = new GetBalanceStressBatchResult({
			batchId: "batch-b",
			runs: [run],
		});
		const entryA = GetBalanceStressHistoryEntry.fromBatch({
			batch: batchA,
			completedAtUnixMs: 1_000,
			visualizationUrl: "http://localhost:5173/explorer/stats/session-1",
		});
		const entryB = GetBalanceStressHistoryEntry.fromBatch({
			batch: batchB,
			completedAtUnixMs: 2_000,
			visualizationUrl: "http://localhost:5173/explorer/stats/session-1",
		});
		const history = GetBalanceStressHistory.empty()
			.withEntry(entryA, 1)
			.withEntry(entryB, 1);
		expect(history.entries).toHaveLength(1);
		expect(history.entries[0]?.batchId).toBe("batch-b");
		expect(getBalanceStressHistoryPath("/tmp/out.json")).toBe(
			"/tmp/out.history.json",
		);
	});
});
