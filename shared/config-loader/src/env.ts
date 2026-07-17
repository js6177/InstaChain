import { readFileSync } from 'fs';
import type {
  ConfigInterface,
  Layer2LedgerDockerEnvSettings,
  Layer2LedgerOAuthManagerDockerEnvSettings,
} from './models';
import { Environment, type EnvironmentName } from './services';
export function resolveEnvironment(environment?: EnvironmentName): EnvironmentName {
  if (environment !== undefined) {
    return environment;
  }
  return (process.env.ENVIRONMENT ?? Environment.DEFAULT) as EnvironmentName;
}


function parseEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseDockerEnvFile(envPath: string): Record<string, string> {
  const contents = readFileSync(envPath, 'utf-8');
  const values: Record<string, string> = {};

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = parseEnvValue(trimmed.slice(separatorIndex + 1));
    values[key] = value.replace(/\$\{([^}]+)\}/g, (_, variableName: string) => {
      return values[variableName] ?? '';
    });
  }

  return values;
}

function requireEnvValue(values: Record<string, string>, key: string): string {
  const value = values[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function requireEnvNumber(values: Record<string, string>, key: string): number {
  const value = Number(requireEnvValue(values, key));
  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return value;
}

function optionalEnvNumber(values: Record<string, string>, key: string): number | undefined {
  const value = values[key];
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

export function loadOAuthManagerDockerEnvSettings(
  envPath: string,
): Layer2LedgerOAuthManagerDockerEnvSettings {
  const values = parseDockerEnvFile(envPath);

  return {
    serverHost: requireEnvValue(values, 'SERVER_HOST'),
    serverPort: requireEnvNumber(values, 'SERVER_PORT'),
    mongodbHost: requireEnvValue(values, 'MONGODB_HOST'),
    mongodbPort: requireEnvNumber(values, 'MONGODB_PORT'),
    mongodbDbName: requireEnvValue(values, 'MONGODB_DB_NAME'),
    layer2oauthPort: requireEnvNumber(values, 'LAYER2OAUTH_PORT'),
    layer2oauthDebugPort: optionalEnvNumber(values, 'LAYER2OAUTH_DEBUG_PORT'),
  };
}

export function loadLayer2LedgerDockerEnvSettings(
  envPath: string,
): Layer2LedgerDockerEnvSettings {
  const values = parseDockerEnvFile(envPath);

  return {
    postgresUser: requireEnvValue(values, 'POSTGRES_USER'),
    postgresPassword: requireEnvValue(values, 'POSTGRES_PASSWORD'),
    postgresDb: requireEnvValue(values, 'POSTGRES_DB'),
    postgresHost: requireEnvValue(values, 'POSTGRES_HOST'),
    postgresPort: requireEnvNumber(values, 'POSTGRES_PORT'),
    redisHost: requireEnvValue(values, 'REDIS_HOST'),
    redisPort: requireEnvNumber(values, 'REDIS_PORT'),
    databaseUrl: requireEnvValue(values, 'DATABASE_URL'),
    redisUrl: requireEnvValue(values, 'REDIS_URL'),
    layer2ledgerFastapiPort: requireEnvNumber(values, 'LAYER2LEDGER_FASTAPI_PORT'),
    testhelperPort: optionalEnvNumber(values, 'TESTHELPER_PORT') ?? 8001,
    layer2ledgerApihandlerDebugPort: optionalEnvNumber(values, 'LAYER2LEDGER_APIHANDLER_DEBUG_PORT'),
    layer2ledgerDbwriterDebugPort: optionalEnvNumber(values, 'LAYER2LEDGER_DBWRITER_DEBUG_PORT'),
    bitcoinRpcHost: requireEnvValue(values, 'BITCOIN_RPC_HOST'),
    bitcoinRpcImportHost: requireEnvValue(values, 'BITCOIN_RPC_IMPORT_HOST'),
    bitcoinRpcPort: requireEnvNumber(values, 'BITCOIN_RPC_PORT'),
    layer2ledgerApihandlerHost: requireEnvValue(values, 'LAYER2LEDGER_APIHANDLER_HOST'),
  };
}

export function buildOAuthManagerConfigFromEnv(
  settings: Layer2LedgerOAuthManagerDockerEnvSettings,
  containered = true,
): ConfigInterface {
  return {
    server: {
      host: containered ? '0.0.0.0' : settings.serverHost,
      port: settings.serverPort,
    },
    mongoDb: {
      host: containered ? settings.mongodbHost : 'localhost',
      port: settings.mongodbPort,
      dbName: settings.mongodbDbName,
    },
  };
}
