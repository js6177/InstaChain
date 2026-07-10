import { join } from 'path';
import { readConfig } from './io';
import { getConfigFilePath } from './paths';
import { resolveEnvironment } from './env';
import type {
  CommonBackendConfig,
  Layer2BridgeConfig,
  Layer2LedgerAPIHandlerConfig,
  Layer2LedgerCommonConfig,
} from './models';
import { Services } from './services';

export function loadLayer2LedgerCommonConfig(
  environment = resolveEnvironment(),
): Layer2LedgerCommonConfig {
  return readConfig<Layer2LedgerCommonConfig>(
    getConfigFilePath(Services.LAYER2LEDGER_COMMON, environment),
  );
}

export function loadLayer2LedgerAPIHandlerConfig(
  environment = resolveEnvironment(),
): Layer2LedgerAPIHandlerConfig {
  return readConfig<Layer2LedgerAPIHandlerConfig>(
    getConfigFilePath(Services.LAYER2LEDGER_APIHANDLER, environment),
  );
}

export function loadBackendCommonConfig(
  environment = resolveEnvironment(),
): CommonBackendConfig {
  return readConfig<CommonBackendConfig>(
    getConfigFilePath(Services.BACKEND_COMMON, environment),
  );
}

export function loadLayer2BridgeConfig(
  environment = resolveEnvironment(),
): Layer2BridgeConfig {
  return readConfig<Layer2BridgeConfig>(
    getConfigFilePath(Services.LAYER2LEDGERBRIDGE, environment),
  );
}

export function getLayer2LedgerPort(): number {
  const envPort = process.env.LAYER2LEDGER_FASTAPI_PORT ?? process.env.PORT;
  if (envPort) {
    return Number(envPort);
  }
  return 8000;
}

export function getTestHelperPort(): number {
  const envPort = process.env.TESTHELPER_PORT;
  if (envPort) {
    return Number(envPort);
  }
  return 8001;
}

export function getLayer2LedgerHost(): string {
  return process.env.LAYER2LEDGER_APIHANDLER_HOST ?? '0.0.0.0';
}

export function getTestHelperHost(): string {
  return process.env.TESTHELPER_HOST ?? '0.0.0.0';
}

export function getLayer2LedgerEnvFilePath(environment = resolveEnvironment()): string {
  return join(process.cwd(), 'backend/layer2ledger', `.env.${environment}`);
}
