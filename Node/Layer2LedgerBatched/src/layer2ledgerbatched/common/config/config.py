import json
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel

class DatabaseSettings(BaseModel):
    db_user: str
    db_password: str
    db_host: str
    db_port: str
    db_name: str

    @property
    def database_url(self) -> str:
        return f"postgresql+asyncpg://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"


class EnvironmentSpecificSettings(BaseModel):
    environment: str #either 'test' or 'prod'
    database: DatabaseSettings
    drop_tables_after_test_completed: Optional[bool] = True
    drop_tables_before_test_completed: Optional[bool] = True

    @property
    def database_url(self) -> str:
        return self.database.database_url
    
class Settings(BaseModel):
    environment_specific_settings: List[EnvironmentSpecificSettings]

def get_settings(environment: str) -> EnvironmentSpecificSettings:
    config_path = Path("shared-config.json")
    if not config_path.exists():
        raise FileNotFoundError("shared-config.json not found in the root directory.")
    with open(config_path, "r") as f:
        config_data = json.load(f)
        settings = Settings(**config_data)
        for env_settings in settings.environment_specific_settings:
            if env_settings.environment == environment:
                return env_settings

    raise ValueError(f"Environment '{environment}' not found in config.")

settings = get_settings("prod")
