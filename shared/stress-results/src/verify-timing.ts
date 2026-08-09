import { isStructuredObject, parseJsonAs } from "./json";
import { LatencyStatsMs } from "./latency-stats";

/**
 * On-disk verify-timing result written by `verify-timing.test.ts`
 * (`VERIFY_RESULT_FILE` / `test-layer2ledger.verify-timing.json`).
 */
export class VerifyTimingResult {
	readonly messageCount: number;
	readonly signLatencyMs: LatencyStatsMs;
	readonly verifyLatencyMs: LatencyStatsMs;
	readonly verifiesPerSecond: number;

	constructor(init: VerifyTimingResult) {
		this.messageCount = init.messageCount;
		this.signLatencyMs = init.signLatencyMs;
		this.verifyLatencyMs = init.verifyLatencyMs;
		this.verifiesPerSecond = init.verifiesPerSecond;
	}

	static parse(data: VerifyTimingResult | null): VerifyTimingResult | null {
		if (!isStructuredObject(data)) {
			return null;
		}
		const { messageCount, signLatencyMs, verifyLatencyMs, verifiesPerSecond } =
			data;
		if (
			typeof messageCount !== "number" ||
			typeof verifiesPerSecond !== "number"
		) {
			return null;
		}
		const parsedSign = LatencyStatsMs.parse(signLatencyMs ?? null);
		const parsedVerify = LatencyStatsMs.parse(verifyLatencyMs ?? null);
		if (!parsedSign || !parsedVerify) {
			return null;
		}
		return new VerifyTimingResult({
			messageCount,
			signLatencyMs: parsedSign,
			verifyLatencyMs: parsedVerify,
			verifiesPerSecond,
		});
	}

	static fromJsonText(text: string): VerifyTimingResult | null {
		return VerifyTimingResult.parse(parseJsonAs<VerifyTimingResult>(text));
	}
}
