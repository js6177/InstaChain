import { readFile } from 'node:fs/promises';
import {
  createLayer2TestHelperClient,
  unwrapLayer2TestHelperResponse,
} from '../src/testhelper/client';

interface SeedConfig {
  balance_sats: number;
  mnemonic_file: string;
  include_deposit_transaction: boolean;
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const configPath = process.env.SEED_CONFIG_PATH ?? '/app/test-seed-config.json';
  const rawConfig = JSON.parse(await readFile(configPath, 'utf-8')) as unknown;
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('Invalid seed config JSON');
  }

  const cfg = rawConfig as Record<string, unknown>;
  const seedConfig: SeedConfig = {
    balance_sats: requireNumber(cfg.balance_sats, 'balance_sats'),
    mnemonic_file: requireString(cfg.mnemonic_file, 'mnemonic_file'),
    include_deposit_transaction: requireBoolean(
      cfg.include_deposit_transaction,
      'include_deposit_transaction',
    ),
  };

  const rawKeys = JSON.parse(await readFile(seedConfig.mnemonic_file, 'utf-8')) as unknown;
  if (!rawKeys || typeof rawKeys !== 'object') {
    throw new Error('Invalid keys JSON');
  }
  const mnemonic = requireString(
    (rawKeys as Record<string, unknown>).mnemonic,
    'mnemonic',
  );

  const baseUrl = process.env.TESTHELPER_BASE_URL ?? 'http://layer2ledger-testhelper:8001';
  const client = createLayer2TestHelperClient(baseUrl);
  const result = unwrapLayer2TestHelperResponse(
    await client.testhelper.seed.mnemonic.post({
      mnemonic,
      balance: seedConfig.balance_sats,
      include_deposit_transaction: seedConfig.include_deposit_transaction,
    }),
  );

  console.log(JSON.stringify(result));
}

await main();
