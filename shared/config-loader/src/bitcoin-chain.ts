/**
 * Bitcoin Core chain identifiers (bitcoin.conf `chain=` / getblockchaininfo.chain).
 */
export const BitcoinChain = {
	MAIN: "main",
	MAINNET: "mainnet",
	TEST: "test",
	TESTNET4: "testnet4",
	REGTEST: "regtest",
	SIGNET: "signet",
} as const;

export type BitcoinChainName = (typeof BitcoinChain)[keyof typeof BitcoinChain];

export function isMainBitcoinChain(chain: string): boolean {
	return chain === BitcoinChain.MAIN || chain === BitcoinChain.MAINNET;
}

/** True for any non-mainnet chain (testnet3/4, regtest, signet, etc.). */
export function isTestBitcoinNetwork(chain: string): boolean {
	return !isMainBitcoinChain(chain);
}

/**
 * Wallet directory under Bitcoin Core's datadir for the given chain.
 * e.g. testnet4 → `testnet4/wallets`, main → `wallets`.
 */
export function bitcoinWalletDataSubdir(chain: string): string {
	switch (chain) {
		case BitcoinChain.MAIN:
		case BitcoinChain.MAINNET:
			return "wallets";
		case BitcoinChain.TEST:
			return "testnet3/wallets";
		case BitcoinChain.TESTNET4:
			return "testnet4/wallets";
		case BitcoinChain.REGTEST:
			return "regtest/wallets";
		case BitcoinChain.SIGNET:
			return "signet/wallets";
		default:
			return `${chain}/wallets`;
	}
}
