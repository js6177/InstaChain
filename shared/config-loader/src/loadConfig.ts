import { existsSync } from 'fs';
import { join } from 'path';
import { readConfig } from './io';
import { getConfigFilePath, getProjectRoot } from './paths';
import { Environment, type EnvironmentName } from './services';
import type { ConfigInterface } from './models';
import { Services } from './services';

export function loadOAuthManagerConfig(): ConfigInterface {
  const configPath = process.env.OPENL2_OAUTH_CONFIG_PATH
    ?? getConfigFilePath(
      Services.LAYER2LEDGEROAUTHMANAGER,
      (process.env.ENVIRONMENT ?? Environment.DEV) as EnvironmentName,
    );

  if (existsSync(configPath)) {
    return readConfig<ConfigInterface>(configPath);
  }

  const fallbackPath = join(getProjectRoot(), 'backend/layer2ledgeroauthmanager/config.json');
  return readConfig<ConfigInterface>(fallbackPath);
}
