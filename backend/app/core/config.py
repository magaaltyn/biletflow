from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BACKEND_DIR / ".env"), env_file_encoding="utf-8", extra="ignore")

    app_name: str = "BiletFlow API"
    environment: str = "development"
    database_url: str = "postgresql+psycopg://biletflow:biletflow@localhost:5433/biletflow"
    test_database_url: str = "postgresql+psycopg://biletflow:biletflow@localhost:5433/biletflow_test"

    secret_key: str = "change-me-in-.env"
    qr_signing_key: str = "change-me-too-in-.env"
    access_token_minutes: int = 720
    email_token_hours: int = 48
    reset_token_minutes: int = 60

    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_sender: str = "BiletFlow <no-reply@biletflow.local>"
    email_enabled: bool = True

    reservation_minutes: int = 15
    media_dir: str = str(BACKEND_DIR / "media")
    mail_outbox_dir: str = str(BACKEND_DIR / "var" / "mail")
    max_upload_mb: int = 5
    activation_fee_kzt: int = 5000

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
