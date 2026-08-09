import { describe, expect, it } from "bun:test";
import { parseNginxStubStatus } from "../src/utils/nginx-status";

describe("parseNginxStubStatus", () => {
	it("parses active, counters, and reading/writing/waiting", () => {
		const body = [
			"Active connections: 291",
			"server accepts handled requests",
			" 12345 12345 67890",
			"Reading: 1 Writing: 12 Waiting: 278",
			"",
		].join("\n");
		expect(parseNginxStubStatus(body)).toEqual({
			active: 291,
			accepts: 12345,
			handled: 12345,
			requests: 67890,
			reading: 1,
			writing: 12,
			waiting: 278,
		});
	});
});
