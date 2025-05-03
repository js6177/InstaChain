import json
import os

def load_config():
    config_path = os.path.join(os.path.expanduser('~') + "/.IC/Layer2Ledger/", 'config.json')
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        raise FileNotFoundError(f"Config file not found at {config_path}")
    except json.JSONDecodeError:
        raise ValueError(f"Invalid JSON in config file at {config_path}")

# Load config once at module import
config = load_config()

def get_config(key, default=None):
    """Get a configuration value with an optional default."""
    return config.get(key, default)

def get_int_config(key, default=None):
    """Get an integer configuration value with an optional default."""
    value = get_config(key, default)
    return int(value) if value is not None else default 