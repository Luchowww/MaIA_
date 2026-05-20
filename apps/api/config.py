from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    supabase_url: str
    supabase_key: str
    supabase_jwt_secret: str
    ollama_url: str = "http://localhost:11434"


settings = Settings()
