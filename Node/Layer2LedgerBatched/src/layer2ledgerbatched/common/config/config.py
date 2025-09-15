import json
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel

ROOT_DIR = "~/.openl2/settings"
config_filename = "shared-config.json"

class DatabaseSettings(BaseModel):
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


class EnvironmentSpecificSettings(BaseModel):
    environment: str #either 'test' or 'prod'
    database: DatabaseSettings
    redis: RedisSettings
    drop_tables_after_test_completed: Optional[bool] = True
    drop_tables_before_test_completed: Optional[bool] = True

    @property
    def database_url(self) -> str:
        return self.database.database_url
    
class Settings(BaseModel):
    environment_specific_settings: List[EnvironmentSpecificSettings]

def get_settings(environment: str) -> EnvironmentSpecificSettings:
    cwd = Path.cwd()
    print(f"Current working directory using pathlib: {cwd}")
    config_path = Path((Path(ROOT_DIR).expanduser())) / config_filename
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
