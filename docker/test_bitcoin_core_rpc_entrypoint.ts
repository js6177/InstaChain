import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';

const environment = process.env.ENVIRONMENT ?? 'test';
const configRoot = process.env.OPENL2_CONFIG_PATH ?? '/app/.config';
const bridgeConfigPath = join(configRoot, environment, 'layer2ledgerbridge-config.json');

const bridgeConfig = await Bun.file(bridgeConfigPath).json();
const rpcSettings = {
  ...bridgeConfig.rpc_settings,
  rpchost: 'bitcoin-core',
};

const testRoot = '/app/shared/bitcoin-core-rpc';
const configDir = join(testRoot, 'test', 'config');
mkdirSync(configDir, { recursive: true });
const configPath = join(configDir, 'config.json');
writeFileSync(configPath, `${JSON.stringify(rpcSettings, null, 4)}\n`, 'utf8');

console.log(
  `Using RPC config at ${configPath} -> ${rpcSettings.rpchost}:${rpcSettings.rpcport}`,
);

const resultFile = process.env.TEST_RESULT_FILE;
const result =
  resultFile && resultFile.length > 0
    ? await $`env RUN_BITCOIN_RPC_INTEGRATION=1 bun test --reporter=junit --reporter-outfile=${resultFile}`
        .cwd(testRoot)
        .nothrow()
    : await $`env RUN_BITCOIN_RPC_INTEGRATION=1 bun test`.cwd(testRoot).nothrow();
process.exit(result.exitCode);
