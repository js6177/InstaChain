import json
from pathlib import Path

from config_models.models import Layer2LedgerCommonSettings
from config_loader.loader import get_config_file_path, Services, Environment

def get_common_settings(environment: Environment = Environment.PROD) -> Layer2LedgerCommonSettings:
    config_file_path = get_config_file_path(Services.LAYER2LEDGERBATCHED_COMMON, environment.value)
    if not config_file_path.exists():
        raise FileNotFoundError(f"Common settings file not found at {config_file_path}.")
    with open(config_file_path, "r") as f:
        config_data = json.load(f)
        settings = Layer2LedgerCommonSettings(**config_data)
        return settings