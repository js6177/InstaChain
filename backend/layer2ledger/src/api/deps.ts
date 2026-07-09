export interface SettingsLayer2Address {
  mneumonic?: string | null;
  private_key: string;
  public_key: string;
}

export interface Layer2LedgerAPIHandlerSettings {
  layer2ledger_node_id: string;
  deposit_wallet_master_pubkey: string;
  minimum_layer1_transaction_amount: number;
  layer2bridge_signing_address: SettingsLayer2Address;
  deposit_transaction_pubkey: string;
  layer2bridge_signing_key_uses_functional_test_keys: boolean;
  onboarding_layer2_deposit_address: SettingsLayer2Address;
}

export interface MessagingContext {
  nodeId: string;
  layer2BridgeSigningPublicKey: string;
}

export interface Layer2LedgerAppDependencies {
  db: unknown;
  /**
   * Intentionally structural/opaque: this shared package must not depend on any
   * specific database/redis client implementation.
   */
  sql: unknown;
  redis: unknown;
  lockManager: {
    acquireMultiLock(userIds: string[]): Promise<string | null>;
    releaseMultiLock(userIds: string[], lockToken: string): Promise<boolean>;
  };
  settings: Layer2LedgerAPIHandlerSettings;
  messaging: MessagingContext;
  generateBtcTestnetAddress(masterPublicKey: string, addressIndex: number): string | null;
}
