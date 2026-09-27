from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    app_name: str = "Cargomatiq"
    database_url: str = f"sqlite:///{BASE_DIR / 'recon.db'}"
    storage_dir: Path = BASE_DIR / "storage"
    residual_tolerance: float = 1.0          # USD; closing-equation threshold
    amount_tolerance_abs: float = 0.50       # USD; absolute tolerance for Pass 2
    amount_tolerance_pct: float = 0.005      # 0.5% relative tolerance for Pass 2
    # IMAP secrets stay in .env. Mailbox state (UIDVALIDITY and last UID) is
    # deliberately stored in PostgreSQL so polling is restart-safe.
    imap_host: Optional[str] = None
    imap_port: int = 993
    imap_username: Optional[str] = None
    imap_password: Optional[str] = None
    imap_folder: str = "INBOX"
    imap_poll_seconds: int = 60
    imap_credential_env_key: str = "IMAP_PASSWORD"
    cors_origins: list = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    class Config:
        env_file = ".env"


settings = Settings()
settings.storage_dir.mkdir(parents=True, exist_ok=True)
