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
  layer2ledgerApihandlerDebugPort?: number;
  layer2ledgerDbwriterDebugPort?: number;
  bitcoinRpcHost: string;
  bitcoinRpcImportHost: string;
  bitcoinRpcPort: number;
  layer2ledgerApihandlerHost: string;
}
