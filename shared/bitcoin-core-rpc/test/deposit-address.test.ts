import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import {
  BitcoinRPCClient,
  isWalletAlreadyExists,
  isWalletAlreadyLoaded,
} from '../index';
import {
  getConfigFilePath,
  Intermediate,
  loadLayer2BridgeConfig,
  readConfig,
  resolveEnvironment,
} from '@openl2/config-loader';
import {
  deriveAddressFromXpubSegwit,
  generateBitcoinCoreDescriptorSegwit,
  type MasterKeys,
} from '@openl2/pubkey-utils/btc';

function loadMasterKeys(): MasterKeys {
  const keysPath = getConfigFilePath(
    Intermediate.BITCOIN_CORE_MASTER_KEYS,
    resolveEnvironment(),
  );
  if (!existsSync(keysPath)) {
    throw new Error(
      `Master keys not found at ${keysPath}. Run setup scripts with -generate-keys first.`,
    );
  }
  return readConfig<MasterKeys>(keysPath);
}

const runIntegration = process.env.RUN_BITCOIN_RPC_INTEGRATION === '1';

describe.skipIf(!runIntegration)('deposit address derivation vs bitcoin-core', () => {
  const rpcConfig = loadLayer2BridgeConfig(resolveEnvironment()).rpc_settings;
  const masterKeys = loadMasterKeys();
  const testnet = rpcConfig.chain !== 'main';

  it('derived deposit addresses match successive getnewaddress results', async () => {
    const walletName = `deposit-addr-verify-${Date.now()}`;
    const rootClient = new BitcoinRPCClient(rpcConfig);

    const createResp = await rootClient.createWallet(walletName);
    if (createResp.error && !isWalletAlreadyExists(createResp.error)) {
      throw new Error(
        `Failed to create wallet ${walletName}: ${createResp.error.code} - ${createResp.error.message}`,
      );
    }

    const loadResp = await rootClient.loadWallet(walletName);
    if (loadResp.error && !isWalletAlreadyLoaded(loadResp.error)) {
      throw new Error(
        `Failed to load wallet ${walletName}: ${loadResp.error.code} - ${loadResp.error.message}`,
      );
    }

    const walletClient = rootClient.withWallet(walletName);
    const descriptors = generateBitcoinCoreDescriptorSegwit(masterKeys.master_xprv, testnet);
    const importResults = await walletClient.importDescriptors(
      descriptors.map((descriptor) => ({
        desc: descriptor.desc,
        active: descriptor.active,
        internal: descriptor.internal,
        range: descriptor.range,
        timestamp: descriptor.timestamp,
      })),
    );

    for (const [index, result] of importResults.entries()) {
      expect(result.success, `descriptor ${index} import failed: ${JSON.stringify(result.error)}`).toBe(
        true,
      );
    }

    // Fresh wallet: getnewaddress should return receiving indexes 0, 1, 2 in order —
    // the same path layer2ledger uses for deposit addresses (change=0).
    for (let addressIndex = 0; addressIndex < 3; addressIndex++) {
      const fromBitcoinCore = await walletClient.getNewAddress('', 'bech32');
      const derived = deriveAddressFromXpubSegwit(
        masterKeys.master_xpub,
        0,
        addressIndex,
        testnet,
      );
      expect(fromBitcoinCore).toBe(derived);
    }
  });
});
