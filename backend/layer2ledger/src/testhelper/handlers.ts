import type {
	HealthResponse,
	SeedBalanceRequest,
	SeedMnemonicRequest,
	SeedResponse,
} from "./models";

export interface TestHelperRouteHandlers {
	health(): HealthResponse;
	seedBalance(body: SeedBalanceRequest): Promise<SeedResponse>;
	seedMnemonic(body: SeedMnemonicRequest): Promise<SeedResponse>;
}
