"""Copy a legacy SQLite Cargomatiq database into an empty PostgreSQL database.

Usage:
  DATABASE_URL=postgresql+psycopg://... python scripts/migrate_sqlite_to_postgres.py path/to/recon.db
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy import DateTime, MetaData, create_engine, inspect, select

# Allow the documented `python scripts\\...` invocation from the backend
# directory without requiring callers to set PYTHONPATH manually.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.session import Base, engine
from app.db import models  # noqa: F401


def _coerce_legacy_row(table_name: str, row: dict) -> dict:
    """Convert SQLite text timestamps to Python datetimes for typed targets."""
    converted = dict(row)
    target_table = Base.metadata.tables[table_name]
    for column in target_table.columns:
        value = converted.get(column.name)
        if value is not None and isinstance(column.type, DateTime) and isinstance(value, str):
            try:
                converted[column.name] = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as exc:
                raise ValueError(
                    f"Cannot migrate {table_name}.{column.name}: invalid timestamp {value!r}"
                ) from exc
    return converted


def migrate(source_path: Path) -> dict[str, int]:
    if not source_path.exists():
        raise FileNotFoundError(source_path)
    source = create_engine(f"sqlite:///{source_path}")
    # Use the application engine so a standard PostgreSQL URL is normalized to
    # the installed Psycopg 3 driver in exactly the same way as the API.
    target = engine
    Base.metadata.create_all(target)
    source_meta = MetaData()
    source_meta.reflect(source)
    copied: dict[str, int] = {}
    # Parent-first ordering preserves the current finance foreign keys.
    order = ["vendors", "logisys_snapshots", "bt_snapshots", "logisys_lines", "bt_lines", "recon_jobs", "uploaded_soas", "recon_line_results", "vendor_mapping_cache"]
    with source.connect() as src, target.begin() as dst:
        target_tables = set(inspect(target).get_table_names())
        existing_finance_data = {
            name: dst.execute(select(Base.metadata.tables[name]).limit(1)).first()
            for name in order
            if name in target_tables
        }
        occupied = [name for name, row in existing_finance_data.items() if row is not None]
        if occupied:
            raise RuntimeError(
                "Target database already contains finance data in: "
                + ", ".join(occupied)
                + ". Migration stopped to prevent duplicate records."
            )
        for name in order:
            if name not in source_meta.tables or name not in target_tables:
                continue
            rows = [
                _coerce_legacy_row(name, dict(row._mapping))
                for row in src.execute(select(source_meta.tables[name]))
            ]
            if rows:
                dst.execute(Base.metadata.tables[name].insert(), rows)
            copied[name] = len(rows)
    return copied


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: migrate_sqlite_to_postgres.py path/to/recon.db")
    print(migrate(Path(sys.argv[1]).resolve()))
