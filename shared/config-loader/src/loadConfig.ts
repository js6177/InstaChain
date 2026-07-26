import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveEnvironment } from "./env";
import { readConfig } from "./io";
import type { ConfigInterface } from "./models";
import { getConfigFilePath, getProjectRoot } from "./paths";
import { Services } from "./services";

export function loadOAuthManagerConfig(): ConfigInterface {
	const configPath = getConfigFilePath(
		Services.LAYER2LEDGEROAUTHMANAGER,
		resolveEnvironment(),
	);

	if (existsSync(configPath)) {
		return readConfig<ConfigInterface>(configPath);
	}

	const fallbackPath = join(
		getProjectRoot(),
		"backend/layer2ledgeroauthmanager/config.json",
	);
	return readConfig<ConfigInterface>(fallbackPath);
}
