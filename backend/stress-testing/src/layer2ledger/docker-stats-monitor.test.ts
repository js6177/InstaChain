import { describe, expect, it } from "bun:test";
import { DockerStatsServiceRole } from "@openl2/stress-results";
import {
	parseDockerSizeToBytes,
	parseMemUsage,
	parsePercent,
	roleForContainerName,
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

describe("roleForContainerName", () => {
	it("maps compose container names to docker-stats roles", () => {
		expect(roleForContainerName("instachain-redis-transactions-1")).toBe(
			DockerStatsServiceRole.Transactions,
		);
		expect(roleForContainerName("instachain-redis-addressbalance-1")).toBe(
			DockerStatsServiceRole.AddressBalance,
		);
		expect(
			roleForContainerName("instachain-layer2ledgerapihandler-nginx-1"),
		).toBe(DockerStatsServiceRole.Nginx);
		expect(roleForContainerName("instachain-layer2ledgerapihandler-3")).toBe(
			DockerStatsServiceRole.Apihandler,
		);
		expect(roleForContainerName("instachain-layer2ledgerdbwriter-1")).toBe(
			DockerStatsServiceRole.Dbwriter,
		);
		expect(roleForContainerName("instachain-layer2ledger-pgbouncer-1")).toBe(
			DockerStatsServiceRole.PgBouncer,
		);
		expect(roleForContainerName("instachain-layer2ledger-postgres-1")).toBe(
			DockerStatsServiceRole.Postgres,
		);
		expect(roleForContainerName("instachain-wallet-web-1")).toBeNull();
	});
});
