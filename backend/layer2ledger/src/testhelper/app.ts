import { openl2Logging } from "@openl2/openl2-logger/elysia";
import { Elysia } from "elysia";
import { log } from "./logger";
import {
	TESTHELPER_HEALTH_ROUTE,
	TESTHELPER_ROUTER_PREFIX,
	TESTHELPER_SEED_BALANCE_ROUTE,
	TESTHELPER_SEED_MNEMONIC_ROUTE,
} from "./api-paths";
import type { TestHelperRouteHandlers } from "./handlers";
import {
	HealthResponse,
	SeedBalanceRequest,
	SeedMnemonicRequest,
	SeedResponse,
} from "./models";

export function createTestHelperApp(handlers: TestHelperRouteHandlers) {
	return new Elysia({ prefix: TESTHELPER_ROUTER_PREFIX })
		.use(
			openl2Logging({ serviceName: "layer2ledger-testhelper", logger: log }),
		)
		.get(TESTHELPER_HEALTH_ROUTE, () => handlers.health(), {
			response: HealthResponse,
		})
		.post(
			TESTHELPER_SEED_BALANCE_ROUTE,
			({ body }) => handlers.seedBalance(body),
			{
				body: SeedBalanceRequest,
				response: SeedResponse,
			},
		)
		.post(
			TESTHELPER_SEED_MNEMONIC_ROUTE,
			({ body }) => handlers.seedMnemonic(body),
			{
				body: SeedMnemonicRequest,
				response: SeedResponse,
			},
		);
}

export type Layer2TestHelperApp = ReturnType<typeof createTestHelperApp>;
