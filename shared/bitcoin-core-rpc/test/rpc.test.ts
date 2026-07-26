import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	BitcoinChain,
	type Layer2BridgeBitcoinConfFileSettings,
} from "@openl2/config-loader";
import { BitcoinRPCClient } from "../index";

function loadRpcConfig(): Layer2BridgeBitcoinConfFileSettings {
	const configPath = join(import.meta.dir, "config", "config.json");
	return JSON.parse(
		readFileSync(configPath, "utf8"),
	) as Layer2BridgeBitcoinConfFileSettings;
}

const runIntegration = process.env.RUN_BITCOIN_RPC_INTEGRATION === "1";

describe.skipIf(!runIntegration)("bitcoin-core-rpc integration", () => {
	const rpcConfig = loadRpcConfig();
	const client = new BitcoinRPCClient(rpcConfig);

	it("getBestBlockHash returns a 64-char hash", async () => {
		const blockHash = await client.getBestBlockHash();
		expect(typeof blockHash).toBe("string");
		expect(blockHash).toHaveLength(64);
	});

	it("getBlockCount returns a non-negative integer", async () => {
		const count = await client.getBlockCount();
		expect(Number.isInteger(count)).toBe(true);
		expect(count).toBeGreaterThanOrEqual(0);
	});

	it("getBlockchainInfo returns testnet4 chain in test config", async () => {
		const info = await client.getBlockchainInfo();
		expect(info.chain).toBe(BitcoinChain.TESTNET4);
		expect(info.blocks).toBeGreaterThanOrEqual(0);
	});

	it("getBlockHeader returns height for best block", async () => {
		const blockHash = await client.getBestBlockHash();
		const header = await client.getBlockHeader(blockHash);
		expect(header.hash).toBe(blockHash);
		expect(header.height).toBeGreaterThanOrEqual(0);
	});
});
