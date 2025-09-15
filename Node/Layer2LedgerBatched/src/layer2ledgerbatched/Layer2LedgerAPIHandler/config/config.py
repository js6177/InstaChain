import json
from pathlib import Path
from pydantic import BaseModel
from typing import Dict, Any, List

#lower 32 bits are used to specify the asset
ASSET_BITCOIN = 1
ASSET_ETHEREUM = 2

ASSET_TESTNET_FLAG = (1 << 32) #bit 32 is the testnet flag
ASSET_STABLECOIN_FLAG = (1 << 33)
# variable that holds what asset the node supports
# For now, a node can support only 1 asset, though in the future, multi-asset nodes are possible
NODE_ASSET_ID = ASSET_BITCOIN|ASSET_TESTNET_FLAG

config_filename = "Layer2LedgerAPIHandler-config.json"

class OnboardingDepositAddress(BaseModel):
    mneumonic: str
    private_key: str
    public_key: str

class EnvironmentSpecificSettings(BaseModel):
    environment: str #either 'test' or 'prod'
    NODE_ID: str
    DEPOSIT_WALLET_MASTER_PUBKEY: str
    MINIMUM_LAYER1_TRANSACTION_AMOUNT: int
    FULLNODE_SIGNING_KEY_PUBKEY: str
    ONBOARDING_DEPOSIT_SIGNING_KEY_PRIVKEY: str
    ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY: str
    FULLNODE_SIGNING_KEY_USES_FUNCTIONAL_TEST_KEYS: bool
    Onboarding_Deposit_Address: OnboardingDepositAddress
    
class Settings(BaseModel):
    environment_specific_settings: List[EnvironmentSpecificSettings]

def get_settings(environment: str) -> EnvironmentSpecificSettings:
    config_path = Path(config_filename)
    if not config_path.exists():
        raise FileNotFoundError(f"{config_filename} not found in the root directory.")
    with open(config_path, "r") as f:
        config_data = json.load(f)
        settings = Settings(**config_data)
        for env_settings in settings.environment_specific_settings:
            if env_settings.environment == environment:
                return env_settings

    raise ValueError(f"Environment '{environment}' not found in config.")

settings = get_settings("prod")