from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The one .env for the whole project is in the repo root (backend/app/config.py → ../../.env), resolved from this
# file so it works no matter where uvicorn/pytest is started from. In Docker it doesn't exist: Compose sets the env.
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    database_url: str
    ollama_base_url: str
    embedding_model: str
    embedding_dim: int
    chat_model: str
    cors_origins: list[str]


settings = Settings()
