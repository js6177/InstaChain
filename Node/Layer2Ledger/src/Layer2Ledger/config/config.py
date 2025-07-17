import json
import os
from Layer2Ledger.config.Layer2LedgerConfig import Layer2LedgerConfig, EnvConfig

def load_config() -> Layer2LedgerConfig:
    # Path to the config file relative to the project root
    config_path = os.path.join(os.path.dirname(__file__), 'Layer2LedgerConfig.json')
    try:
        with open(config_path, 'r') as f:
            config_data = json.load(f)
            return Layer2LedgerConfig(**config_data)
    except FileNotFoundError:
        raise FileNotFoundError(f"Config file not found at {config_path}")
    except json.JSONDecodeError:
        raise ValueError(f"Invalid JSON in config file at {config_path}")
    except Exception as e:
        raise ValueError(f"Error loading or parsing config: {e}")

# Load config once at module import
_config = load_config()

def get_config() -> EnvConfig:
    """
    Returns the appropriate configuration based on the 'LAYER2_ENV' environment variable.
    Defaults to 'functional_tests_env' if the variable is not set.
    """
    env = os.environ.get('LAYER2_ENV', 'functional_tests_env')
    if env == 'live_env':
        return _config.live_env
    return _config.functional_tests_env

# Singleton instance of the configuration
config: EnvConfig = get_config()