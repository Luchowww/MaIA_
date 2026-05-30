from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")

    database_url: str
    supabase_url: str
    supabase_key: str
    supabase_jwt_secret: str
    ollama_url: str = "http://localhost:11434"


settings = Settings()
