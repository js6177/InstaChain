import { t } from "elysia";

export const SeedBalanceRequest = t.Object({
	address: t.String(),
	balance: t.Number(),
	include_deposit_transaction: t.Boolean(),
});

export type SeedBalanceRequest = typeof SeedBalanceRequest.static;

export const SeedMnemonicRequest = t.Object({
	mnemonic: t.String(),
	balance: t.Number(),
	include_deposit_transaction: t.Boolean(),
});

export type SeedMnemonicRequest = typeof SeedMnemonicRequest.static;

export const SeedResponse = t.Object({
	address: t.String(),
	balance: t.Number(),
	include_deposit_transaction: t.Boolean(),
});

export type SeedResponse = typeof SeedResponse.static;

export const HealthResponse = t.Object({
	status: t.String(),
});

export type HealthResponse = typeof HealthResponse.static;
