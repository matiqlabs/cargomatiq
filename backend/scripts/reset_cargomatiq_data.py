"""Reset all Cargomatiq application data while preserving the database schema.

This removes Finance and Operations records, including mailbox cursor state,
and clears local raw-email/attachment objects. It deliberately leaves Alembic's
schema-version table untouched.

Usage:
  python scripts\\reset_cargomatiq_data.py --confirm-reset-cargomatiq-data
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db import models  # noqa: F401 - register all application tables
from app.core.config import settings
from app.db.session import Base, engine
from app.operations.storage import object_storage


def reset() -> tuple[int, Path]:
    """Truncate only application tables and clear only configured local objects."""
    if engine.dialect.name != "postgresql":
        raise RuntimeError("This reset utility only supports PostgreSQL/Supabase.")

    storage_root = object_storage.root.resolve()
    expected_storage_root = (settings.storage_dir / "objects").resolve()
    if storage_root != expected_storage_root:
        raise RuntimeError(f"Refusing to clear unexpected storage path: {storage_root}")

    table_names = sorted(Base.metadata.tables)
    quoted_names = ", ".join(f'"{name}"' for name in table_names)
    with engine.begin() as connection:
        connection.execute(text(f"TRUNCATE TABLE {quoted_names} RESTART IDENTITY CASCADE"))

    if storage_root.exists():
        shutil.rmtree(storage_root)
    storage_root.mkdir(parents=True, exist_ok=True)
    return len(table_names), storage_root


def main() -> int:
    parser = argparse.ArgumentParser(description="Delete all Cargomatiq application data but keep the schema.")
    parser.add_argument(
        "--confirm-reset-cargomatiq-data",
        action="store_true",
        help="Required acknowledgement for this irreversible operation.",
    )
    args = parser.parse_args()
    if not args.confirm_reset_cargomatiq_data:
        parser.error("Refusing to reset data without --confirm-reset-cargomatiq-data")
    table_count, storage_root = reset()
    print(f"Reset complete: truncated {table_count} Cargomatiq tables and cleared {storage_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
