import os
import platform
from pathlib import Path
from enum import StrEnum

class Services(StrEnum):
    LAYER2LEDGERBATCHED_COMMON = 'layer2ledgerbatched-common'
    LAYER2LEDGERBATCHED_LAYER2LEDGERAPIHANDLER = 'layer2ledgerbatched-layer2ledgerapihandler'
    LAYER2LEDGEROAUTHMANAGER = 'layer2ledgeroauthmanager'
    LAYER2LEDGERBRIDGE = 'layer2ledgerbridge'
    BACKEND_COMMON = 'backend-common' # settings shared between all backend components

class Environment(StrEnum):
    DEV = "dev"
    PROD = "prod"

# Gets the directory where all the configuration files are stored, based on these 3 criteria:
# 1. If the environment variable OPENL2_CONFIG_PATH is set, use that path.
# 2. Local project root directory (where the .git folder is located) in the '/.config' directory.
# 3. System configuration directory ('~/.openl2/config/' for linux, and 'C:\ProgramData\openl2\config\' for windows).
def get_config_directory() -> Path:
    """
    Returns the path to the configuration file.
    """

    # 1. Check for environment variable
    env_path = os.getenv("OPENL2_CONFIG_PATH")
    if env_path:
        return Path(env_path)

    # 2. Check for local project root directory
    current_path = Path.cwd()
    for parent in current_path.parents:
        if (parent / ".git").exists():
            local_config_path = parent / ".config"
            return local_config_path

    # 3. System configuration directory
    if platform.system() == "Windows":
        system_config_path = Path("C:/ProgramData/.openl2/config/")
    elif platform.system() == "Linux":
        system_config_path = Path.home() / ".openl2/config/"
    else:
        raise OSError("Unsupported operating system")

    return system_config_path

def get_env_specific_config_directory(environment: str) -> Path:
    """
    Returns the path to the configuration file for a specific environment (e.g., dev, staging, prod).
    """
    base_config_path = get_config_directory()
    env_specific_path = base_config_path / environment
    return env_specific_path

# gets the directory where the bitcoin.conf used by bitcoin core is
def get_bitcoincore_conf_directory() -> Path:
    system = platform.system()
    if system == "Windows":
        return Path(os.environ["APPDATA"]) / "Bitcoin"
    elif system == "Darwin":  # macOS
        return Path.home() / "Library/Application Support/Bitcoin"
    else:  # Linux and others
        return Path.home() / ".bitcoin"

# Returns the full path of the config file
def get_config_file_path(service: str, environment: str) -> Path:
    """
    Returns the full path to the configuration file for a given service and environment.
    """

    config_path = get_config_directory()
    service_file_name = f"{service}-config.json"
    if(service == 'bitcoin.conf'):
        service_file_name = f"{service}"
    config_file = config_path / environment / service_file_name
    return config_file

def docker_env_file_path(service: str, environment: str) -> Path:
    """
    Returns the full path to the Docker environment file for a given service and environment.
    """

    config_path = get_config_directory()
    env_file = config_path / environment / f"{service}.env"
    return env_file

def get_layer2bridge_bitcoinconf_file_path() -> Path:
    """
    Returns the full path to the bitcoin.conf file in the layer2bridge project directory
    """

    project_root = get_project_root()
    bitcoinconf_file = project_root / "backend" / "layer2bridge" / "bitcoin.conf"
    return bitcoinconf_file

def get_project_root() -> Path:
    """
    Returns the root directory of the project (where the .git folder is located).
    """

    current_path = Path.cwd()
    for parent in current_path.parents:
        if (parent / ".git").exists():
            return parent
    raise FileNotFoundError("Project root with .git folder not found.")