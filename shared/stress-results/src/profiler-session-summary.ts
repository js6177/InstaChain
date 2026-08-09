import { isStructuredObject } from "./json";

/** Subset of the server profiler-session report used for stress throughput. */
export class StressProfilerSessionSummary {
	readonly sessionId: string;
	readonly outputFile: string | null;
	readonly pushTxsPerSecond: number;
	readonly settledTxsPerSecond: number;
	readonly pushPeakConcurrent: number;
	readonly pushAvgLatencyMs: number;
	readonly pushCount: number;
	readonly dbwriterWritesTotal: number;
	readonly pushMs: number;
	readonly pushToSettleMs: number;
	readonly settleMs: number;

	constructor(init: StressProfilerSessionSummary) {
		this.sessionId = init.sessionId;
		this.outputFile = init.outputFile;
		this.pushTxsPerSecond = init.pushTxsPerSecond;
		this.settledTxsPerSecond = init.settledTxsPerSecond;
		this.pushPeakConcurrent = init.pushPeakConcurrent;
		this.pushAvgLatencyMs = init.pushAvgLatencyMs;
		this.pushCount = init.pushCount;
		this.dbwriterWritesTotal = init.dbwriterWritesTotal;
		this.pushMs = init.pushMs;
		this.pushToSettleMs = init.pushToSettleMs;
		this.settleMs = init.settleMs;
	}

	static parse(
		data: StressProfilerSessionSummary | null,
	): StressProfilerSessionSummary | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as StressProfilerSessionSummary;
		return new StressProfilerSessionSummary({
			sessionId: typed.sessionId,
			outputFile: typed.outputFile ?? null,
			pushTxsPerSecond: typed.pushTxsPerSecond,
			settledTxsPerSecond: typed.settledTxsPerSecond,
			pushPeakConcurrent: typed.pushPeakConcurrent,
			pushAvgLatencyMs: typed.pushAvgLatencyMs,
			pushCount: typed.pushCount,
			dbwriterWritesTotal: typed.dbwriterWritesTotal,
			pushMs: typed.pushMs,
			pushToSettleMs: typed.pushToSettleMs,
			settleMs: typed.settleMs,
		});
	}
}
