export interface OAuth2ServiceParams{
    clientId: string;
    clientSecret: string;
    redirectUri?: string;
    authorizationUri?: string;
    tokenUri?: string;
    useBasicAuthorizationHeader?: boolean;
    scopes?: string[];
    fields?: string[]; // A User profile's fields to request from the service (i.e. id, username, pfp, etc.)
}
export interface ExpressServerConfig{
    port: number;
    host: string;
}

export interface MongoDbConfig{
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
}