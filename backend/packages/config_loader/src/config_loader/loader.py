import os
import platform
from pathlib import Path
from enum import StrEnum

class Services(StrEnum):
    LAYER2LEDGERBATCHED_COMMON = 'layer2ledgerbatched-common'
    LAYER2LEDGERBATCHED_LAYER2LEDGERAPIHANDLER = 'layer2ledgerbatched-layer2ledgerapihandler'
    LAYER2LEDGEROAUTHMANAGER = 'layer2ledgeroauthmanager'
    LAYER2LEDGERBRIDGE = 'layer2ledgerbridge'

class Environment(StrEnum):
    DEV = "dev"
    PROD = "prod"

# Gets the path where all the configuration files are stored, based on these 3 criteria:
# 1. If the environment variable OPENL2_CONFIG_PATH is set, use that path.
# 2. Local project root directory (where the .git folder is located) in the '/.config' directory.
# 3. System configuration directory ('~/.openl2/config/' for linux, and 'C:\ProgramData\openl2\config\' for windows).
def get_config_path() -> str:
    """
    Returns the path to the configuration file.
    """

    # 1. Check for environment variable
    env_path = os.getenv("OPENL2_CONFIG_PATH")
    if env_path:
        return env_path

    # 2. Check for local project root directory
    current_path = Path.cwd()
    for parent in current_path.parents:
        if (parent / ".git").exists():
            local_config_path = parent / ".config"
            return str(local_config_path)

    # 3. System configuration directory
    if platform.system() == "Windows":
        system_config_path = Path("C:/ProgramData/.openl2/config/")
    elif platform.system() == "Linux":
        system_config_path = Path.home() / ".openl2/config/"
    else:
        raise OSError("Unsupported operating system")

    return str(system_config_path)

def get_env_specific_config_path(environment: str) -> str:
    """
    Returns the path to the configuration file for a specific environment (e.g., dev, staging, prod).
    """
    base_config_path = get_config_path()
    env_specific_path = Path(base_config_path) / environment
    return str(env_specific_path)


# Returns the full path of the config file
def get_config_file(service: str, environment: str) -> str:
    """
    Returns the full path to the configuration file for a given service and environment.
    """
    from pathlib import Path

    config_path = get_config_path()
    service_file_name = f"{service}-config.json"
    if(service == 'bitcoin.conf'):
        service_file_name = f"{service}"
    config_file = Path(config_path) / f"{environment}/{service_file_name}"
    return str(config_file)

def docker_env_file_path(service: str, environment: str) -> str:
    """
    Returns the full path to the Docker environment file for a given service and environment.
    """
    from pathlib import Path

    config_path = get_config_path()
    env_file = Path(config_path) / f"{environment}/{service}.env"
    return str(env_file)

def get_layer2bridge_bitcoinconf_file_path() -> str:
    """
    Returns the full path to the bitcoin.conf file in the layer2bridge project directory
    """
    from pathlib import Path

    project_root = get_project_root()
    bitcoinconf_file = Path(project_root) / "backend" / "layer2bridge" / "bitcoin.conf"
    return str(bitcoinconf_file)

def get_project_root() -> str:
    """
    Returns the root directory of the project (where the .git folder is located).
    """
    from pathlib import Path

    current_path = Path.cwd()
    for parent in current_path.parents:
        if (parent / ".git").exists():
            return str(parent)
    raise FileNotFoundError("Project root with .git folder not found.")