from pydantic import BaseModel, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import string
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

    model_config = SettingsConfigDict(env_file='.env')

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
    import_wallet_privkey_at_startup: bool | None = False
    wallet_private_key_seed_mneumonic: str | None = None
    import_wallet_privkey_while_looping: bool | None = False
    import_wallet_privkey_startup_count: int | None = 1000
    import_wallet_privkey_loop_count: int | None = 0
    database_audit_name: str | None = None

#Common settings that all backend services can access
class CommonBackendSettings(BaseModel):
    node_id: str
    