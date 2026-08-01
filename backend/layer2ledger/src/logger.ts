import { createOpenL2Logger } from "@openl2/openl2-logger";

export const log = createOpenL2Logger({
	serviceName: "layer2ledger",
	/** Indent JSON in test runs so performance timings are easy to spot in bun test output. */
	prettyJson: process.env.ENVIRONMENT === "test",
});
