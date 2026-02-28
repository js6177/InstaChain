import json
from pathlib import Path
from config_models.models import Layer2BridgeSettings, Layer2LedgerAPIHandlerSettings, SettingsLayer2Address
from config_loader.loader import get_config_file_path, Services, Environment

def get_settings(environment: Environment = Environment.PROD) -> Layer2LedgerAPIHandlerSettings:
    config_file_path = get_config_file_path(Services.LAYER2LEDGERBATCHED_LAYER2LEDGERAPIHANDLER, environment.value)
    if not config_file_path.exists():
        raise FileNotFoundError(f"API Handler settings file not found at {config_file_path}.")
    with open(config_file_path, "r") as f:
        config_data = json.load(f)
        settings = Layer2LedgerAPIHandlerSettings(**config_data)
        return settings

def get_layer2bridge_settings(environment: Environment = Environment.PROD) -> Layer2BridgeSettings:
    config_file_path = get_config_file_path(Services.LAYER2LEDGERBRIDGE, environment.value)
    if not config_file_path.exists():
        raise FileNotFoundError(f"Layer2Bridge settings file not found at {config_file_path}.")
    with open(config_file_path, "r") as f:
        config_data = json.load(f)
        settings = Layer2BridgeSettings(**config_data)
        return settings