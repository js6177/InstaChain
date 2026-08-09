import { isStructuredObject } from "./json";

/** Wall-clock phase timings for a pushTransaction stress round. */
export class StressPhaseTimingsMs {
	/** Address generation + transfer message build (excludes signing). */
	readonly prepareMs: number;
	/** Wall-clock to sign all transfer messages. */
	readonly signMs: number;
	readonly seedMs: number;
	/** Wall-clock for the concurrent push wave only. */
	readonly pushMs: number;
	/** Wall-clock polling until dbwriter has persisted accepted pushes. */
	readonly settleMs: number;
	/**
	 * Wall-clock from push-wave start until all accepted pushes are settled
	 * in Postgres (`pushMs + settleMs`).
	 */
	readonly pushToSettleMs: number;
	readonly totalMs: number;

	constructor(init: StressPhaseTimingsMs) {
		this.prepareMs = init.prepareMs;
		this.signMs = init.signMs;
		this.seedMs = init.seedMs;
		this.pushMs = init.pushMs;
		this.settleMs = init.settleMs;
		this.pushToSettleMs = init.pushToSettleMs;
		this.totalMs = init.totalMs;
	}

	static parse(
		data: StressPhaseTimingsMs | null | undefined,
	): StressPhaseTimingsMs | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const {
			prepareMs,
			signMs,
			seedMs,
			pushMs,
			settleMs,
			pushToSettleMs,
			totalMs,
		} = data;
		if (
			typeof prepareMs !== "number" ||
			typeof signMs !== "number" ||
			typeof seedMs !== "number" ||
			typeof pushMs !== "number" ||
			typeof settleMs !== "number" ||
			typeof totalMs !== "number"
		) {
			return null;
		}
		return new StressPhaseTimingsMs({
			prepareMs,
			signMs,
			seedMs,
			pushMs,
			settleMs,
			pushToSettleMs:
				typeof pushToSettleMs === "number" ? pushToSettleMs : pushMs + settleMs,
			totalMs,
		});
	}
}
