import { describe, expect, it } from "bun:test";
import {
	parseDockerSizeToBytes,
	parseMemUsage,
	parsePercent,
} from "./docker-stats-monitor";

describe("parseDockerSizeToBytes", () => {
	it("parses binary and SI units", () => {
		expect(parseDockerSizeToBytes("157.8MiB")).toBeCloseTo(
			157.8 * 1024 ** 2,
			0,
		);
		expect(parseDockerSizeToBytes("1.5GB")).toBeCloseTo(1.5 * 1000 ** 3, 0);
		expect(parseDockerSizeToBytes("1024")).toBe(1024);
	});
});

describe("parseMemUsage", () => {
	it("parses Docker string form used / limit", () => {
		expect(parseMemUsage("28.85MiB / 30.4GiB")).toEqual({
			usageBytes: parseDockerSizeToBytes("28.85MiB"),
			limitBytes: parseDockerSizeToBytes("30.4GiB"),
		});
	});

	it("parses Podman numeric MemUsage + MemLimit bytes", () => {
		expect(parseMemUsage(30253056, 32666005504)).toEqual({
			usageBytes: 30253056,
			limitBytes: 32666005504,
		});
	});

	it("returns zeros for missing values", () => {
		expect(parseMemUsage(undefined)).toEqual({
			usageBytes: 0,
			limitBytes: 0,
		});
		expect(parseMemUsage(null)).toEqual({ usageBytes: 0, limitBytes: 0 });
		expect(parseMemUsage("")).toEqual({ usageBytes: 0, limitBytes: 0 });
	});
});

describe("parsePercent", () => {
	it("parses Docker percent strings and Podman numbers", () => {
		expect(parsePercent("12.5%")).toBe(12.5);
		expect(parsePercent(0.777)).toBeCloseTo(0.777);
		expect(parsePercent(undefined)).toBe(0);
	});
});
