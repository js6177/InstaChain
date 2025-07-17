from pydantic import BaseModel
from typing import Dict, Any

class OnboardingDepositAddress(BaseModel):
    mneumonic: str
    private_key: str
    public_key: str

class DatabaseConnection(BaseModel):
    database_engine: str
    host: str
    port: int
    user: str
    password: str
    database_name: str

class EnvConfig(BaseModel):
    NODE_ID: str
    DEPOSIT_WALLET_MASTER_PUBKEY: str
    MINIMUM_LAYER1_TRANSACTION_AMOUNT: int
    FULLNODE_SIGNING_KEY_PUBKEY: str
    ONBOARDING_DEPOSIT_SIGNING_KEY_PRIVKEY: str
    ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY: str
    FULLNODE_SIGNING_KEY_USES_FUNCTIONAL_TEST_KEYS: bool
    Onboarding_Deposit_Address: OnboardingDepositAddress
    database_connection: DatabaseConnection

class Layer2LedgerConfig(BaseModel):
    functional_tests_env: EnvConfig
    live_env: EnvConfig
