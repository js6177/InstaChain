from pydantic import BaseModel, Field, model_validator, ConfigDict
from pydantic_settings import BaseSettings, SettingsConfigDict
import string
from pathlib import Path
from typing import Optional

# Layer2Ledger settings
# Settings from the .env file from the docker root 
class Layer2LedgerDockerEnvSettings(BaseSettings):
    postgres_user: str
    postgres_password: str
    postgres_db: str
    postgres_host: str
    postgres_port: int

    redis_host: str
    redis_port: int

    database_url: str
    redis_url: str

    layer2ledger_fastapi_port: int

    bitcoin_rpc_host: str
    layer2ledger_apihandler_host: str

    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    @classmethod
    def load_from_path(cls, env_path: str):
        # This manually triggers the env loading logic
        return cls(_env_file=env_path)

    @model_validator(mode='after')
    def interpolate_database_url(self) -> 'Layer2LedgerDockerEnvSettings':
        # This replaces ${VAR} with the actual values in the model
        template = string.Template(self.database_url.replace("${", "$"))
        self.database_url = template.safe_substitute(self.model_dump())
        return self
    
    @model_validator(mode='after')
    def interpolate_redis_url(self) -> 'Layer2LedgerDockerEnvSettings':
        # This replaces ${VAR} with the actual values in the model
        template = string.Template(self.database_url.replace("${", "$"))
        self.redis_url = template.safe_substitute(self.model_dump())
        return self


class Layer2LedgerOAuthManagerDockerEnvSettings(BaseSettings):
    server_host: str
    server_port: int
    mongodb_host: str
    mongodb_port: int
    mongodb_db_name: str
    layer2oauth_port: int

    model_config = SettingsConfigDict(env_file='.env')

    @classmethod
    def load_from_path(cls, env_path: str):
        path = Path(env_path)
        if not path.is_file():
            raise FileNotFoundError(f"Environment file not found: {env_path}")
        return cls(_env_file=env_path)


class OAuth2ServiceParams(BaseModel):
    client_id: str = Field(alias="clientId")
    client_secret: str = Field(alias="clientSecret")
    redirect_uri: str | None = Field(default=None, alias="redirectUri")
    authorization_uri: str | None = Field(default=None, alias="authorizationUri")
    token_uri: str | None = Field(default=None, alias="tokenUri")
    use_basic_authorization_header: bool | None = Field(default=None, alias="useBasicAuthorizationHeader")
    scopes: list[str] | None = None
    fields: list[str] | None = None

    model_config = ConfigDict(populate_by_name=True)


class ExpressServerConfig(BaseModel):
    port: int
    host: str


class MongoDbConfig(BaseModel):
    host: str
    port: int
    db_name: str = Field(alias="dbName")

    model_config = ConfigDict(populate_by_name=True)


class Layer2LedgerOAuthManagerConfig(BaseModel):
    server: ExpressServerConfig
    mongo_db: MongoDbConfig = Field(alias="mongoDb")
    twitter: OAuth2ServiceParams | None = None
    github: OAuth2ServiceParams | None = None
    google: OAuth2ServiceParams | None = None
    facebook: OAuth2ServiceParams | None = None
    discord: OAuth2ServiceParams | None = None
    tiktok: OAuth2ServiceParams | None = None

    model_config = ConfigDict(populate_by_name=True)


# Settings of the subprojects, written as json files
class SettingsLayer2Address(BaseModel):
    mneumonic: str | None = None
    private_key: str
    public_key: str

# Layer2Ledger settings of layer2ledgerapihandler
class Layer2LedgerAPIHandlerSettings(BaseModel):
    layer2ledger_node_id: str
    deposit_wallet_master_pubkey: str
    minimum_layer1_transaction_amount: int
    layer2bridge_signing_address: SettingsLayer2Address
    deposit_transaction_pubkey: str
    layer2bridge_signing_key_uses_functional_test_keys: bool
    onboarding_layer2_deposit_address: SettingsLayer2Address

class PostgresqlDatabaseSettings(BaseModel):
    db_user: str
    db_password: str
    db_host: str
    db_port: str
    db_name: str

    @property
    def database_url(self) -> str:
        return f"postgresql+asyncpg://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"
    
class RedisSettings(BaseModel):
    host: str
    port: int

# Layer2Ledger settings that are shared between layer2ledgerapihandler and layer2ledgerdbwriter
class Layer2LedgerCommonSettings(BaseModel):
    database: PostgresqlDatabaseSettings
    redis: RedisSettings
    drop_tables_after_test_completed: Optional[bool] = True
    drop_tables_before_test_completed: Optional[bool] = True


# Layer2Bridge settings

class Layer2BridgeBitcoinConfFileSettings(BaseModel):
    chain: str
    rpcuser: str
    rpcpassword: str
    rpchost: str
    rpcport: int

class Layer2BridgeSettings(BaseModel):
    #required fields:
    rpc_settings: Layer2BridgeBitcoinConfFileSettings
    database_layer2bridge_name: str
    wallet_name: str
    layer2_node_url: str
    onboarding_signing_private_key: str

    #optional fields:
    database_audit_name: str | None = None

#Common settings that all backend services can access
class CommonBackendSettings(BaseModel):
    node_id: str
    layer2bridge_signing_public_key: str
