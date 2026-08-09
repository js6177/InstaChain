import { isStructuredObject } from "./json";

/** Wall-clock phase timings for a pushTransaction stress run. */
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

	static parse(data: StressPhaseTimingsMs | null): StressPhaseTimingsMs | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const typed = data as StressPhaseTimingsMs;
		return new StressPhaseTimingsMs({
			prepareMs: typed.prepareMs,
			signMs: typed.signMs,
			seedMs: typed.seedMs,
			pushMs: typed.pushMs,
			settleMs: typed.settleMs,
			pushToSettleMs: typed.pushToSettleMs ?? typed.pushMs + typed.settleMs,
			totalMs: typed.totalMs,
		});
	}
}
