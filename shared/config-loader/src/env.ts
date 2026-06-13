import { readFileSync } from 'fs';
import type {
  ConfigInterface,
  Layer2LedgerOAuthManagerDockerEnvSettings,
} from './models';

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
