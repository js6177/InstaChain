export interface OAuth2ServiceParams {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  authorizationUri?: string;
  tokenUri?: string;
  useBasicAuthorizationHeader?: boolean;
  scopes?: string[];
  fields?: string[];
}

export interface ExpressServerConfig {
  port: number;
  host: string;
}

export interface MongoDbConfig {
  host: string;
  port: number;
  dbName: string;
}

export interface ConfigInterface {
  server: ExpressServerConfig;
  mongoDb: MongoDbConfig;
  twitter?: OAuth2ServiceParams;
  github?: OAuth2ServiceParams;
  google?: OAuth2ServiceParams;
  facebook?: OAuth2ServiceParams;
  discord?: OAuth2ServiceParams;
  tiktok?: OAuth2ServiceParams;
}

export interface Layer2LedgerOAuthManagerDockerEnvSettings {
  serverHost: string;
  serverPort: number;
  mongodbHost: string;
  mongodbPort: number;
  mongodbDbName: string;
  layer2oauthPort: number;
  layer2oauthDebugPort?: number;
}

export interface Layer2LedgerDockerEnvSettings {
  postgresUser: string;
  postgresPassword: string;
  postgresDb: string;
  postgresHost: string;
  postgresPort: number;
  redisHost: string;
  redisPort: number;
  databaseUrl: string;
  redisUrl: string;
  layer2ledgerFastapiPort: number;
  testhelperPort: number;
  layer2ledgerApihandlerDebugPort?: number;
  layer2ledgerDbwriterDebugPort?: number;
  bitcoinRpcHost: string;
  bitcoinRpcImportHost: string;
  bitcoinRpcPort: number;
  layer2ledgerApihandlerHost: string;
}

export interface Layer2LedgerTestHelperConfig {
  host: string;
  port: number;
}

export interface PostgresqlDatabaseSettings {
  db_user: string;
  db_password: string;
  db_host: string;
  db_port: string;
  db_name: string;
}

export interface RedisSettings {
  host: string;
  port: number;
}

export interface Layer2LedgerCommonConfig {
  database: PostgresqlDatabaseSettings;
  redis: RedisSettings;
  drop_tables_after_test_completed?: boolean;
  drop_tables_before_test_completed?: boolean;
}

export interface SettingsLayer2Address {
  mneumonic?: string | null;
  private_key: string;
  public_key: string;
}

export interface Layer2LedgerAPIHandlerConfig {
  layer2ledger_node_id: string;
  deposit_wallet_master_pubkey: string;
  minimum_layer1_transaction_amount: number;
  layer2bridge_signing_address: SettingsLayer2Address;
  deposit_transaction_pubkey: string;
  layer2bridge_signing_key_uses_functional_test_keys: boolean;
  onboarding_layer2_deposit_address: SettingsLayer2Address;
}

export interface CommonBackendConfig {
  node_id: string;
  layer2bridge_signing_public_key: string;
}

export interface Layer2BridgeBitcoinConfFileSettings {
  chain: string;
  rpcuser: string;
  rpcpassword: string;
  rpchost: string;
  rpcport: number;
}

export interface Layer2BridgeConfig {
  rpc_settings: Layer2BridgeBitcoinConfFileSettings;
  database_layer2bridge_name: string;
  wallet_name: string;
  layer2_node_url: string;
  onboarding_signing_private_key: string;
  database_audit_name?: string | null;
}
