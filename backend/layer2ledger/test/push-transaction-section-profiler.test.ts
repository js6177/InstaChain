import { describe, expect, it } from "bun:test";
import {
	getPushTransactionSectionAveragesForTests,
	PushTransactionSection,
	recordPushTransactionSectionMs,
	resetPushTransactionSectionProfilerForTests,
	timePushTransactionSectionSync,
} from "../src/transaction-processing/push-transaction-section-profiler";

describe("push-transaction-section-profiler", () => {
	it("accumulates rolling averages across section timings", () => {
		resetPushTransactionSectionProfilerForTests();
		recordPushTransactionSectionMs(PushTransactionSection.Validate, 2);
		recordPushTransactionSectionMs(PushTransactionSection.Validate, 4);
		recordPushTransactionSectionMs(
			PushTransactionSection.VerifySignature,
			10,
		);

		expect(getPushTransactionSectionAveragesForTests()).toEqual({
			validate: 3,
			verify_signature: 10,
		});

		const validateMs = timePushTransactionSectionSync(
			PushTransactionSection.Validate,
			() => 42,
		);
		expect(validateMs).toBe(42);
		expect(
			getPushTransactionSectionAveragesForTests().validate,
		).toBeGreaterThan(0);
	});
});
