from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The one .env for the whole project is in the repo root (backend/app/config.py → ../../.env), resolved from this
# file so it works no matter where uvicorn/pytest is started from. In Docker it doesn't exist: Compose sets the env.
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    database_url: str = "postgresql+asyncpg://manualbuddy:manualbuddy@localhost:5433/manualbuddy"
    ollama_base_url: str = "http://localhost:11434"
    embedding_model: str = "bge-m3"
    embedding_dim: int = 1024
    chat_model: str = "llama3.2:3b"
    cors_origins: list[str] = ["http://localhost:8080", "http://127.0.0.1:8080"]


settings = Settings()
