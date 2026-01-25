# Gets the path where all the configuration files are stored, based on these 3 criteria:
# 1. If the environment variable OPENL2_CONFIG_PATH is set, use that path.
# 2. Local project root directory (where the .git folder is located) in the '/.config' directory.
# 3. System configuration directory ('~/.openl2/config/' for linux, and 'C:\ProgramData\openl2\config\' for windows).
def get_config_path() -> str:
    """
    Returns the path to the configuration file.
    """
    import os
    import platform
    from pathlib import Path

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


# Returns the full pat of the config file
def get_config_file(service: str, environment: str) -> str:
    """
    Returns the full path to the configuration file for a given service and environment.
    """
    from pathlib import Path

    config_path = get_config_path()
    config_file = Path(config_path) / f"{service}/{environment}/config.json"
    return str(config_file)