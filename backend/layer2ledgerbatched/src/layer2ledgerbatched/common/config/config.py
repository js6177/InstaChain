import enum
import json
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel

ROOT_DIR = "~/.openl2/settings"
config_filename = "shared-config.json"


class Environment(enum.Enum):
    TEST = "test"
    PROD = "prod"

DEFAULT_ENVIRONMENT = Environment.PROD

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


class CommonSettings(BaseModel):
    database: DatabaseSettings
    redis: RedisSettings
    drop_tables_after_test_completed: Optional[bool] = True
    drop_tables_before_test_completed: Optional[bool] = True

    @property
    def database_url(self) -> str:
        return self.database.database_url

def get_common_settings(environment: Environment = DEFAULT_ENVIRONMENT) -> CommonSettings:
    cwd = Path.cwd()
    print(f"Current working directory using pathlib: {cwd}")
    config_path = Path((Path(ROOT_DIR).expanduser())) / environment.value / config_filename
    if not config_path.exists():
        raise FileNotFoundError(f"{config_filename} not found in the root directory.")
    with open(config_path, "r") as f:
        config_data = json.load(f)
        settings = CommonSettings(**config_data)
        return settings

    raise ValueError(f"Environment '{environment}' not found in config.")