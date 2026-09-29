from __future__ import with_statement

from alembic import context

from app.db.session import Base, database_url, engine
from app.db import models  # noqa: F401 - register metadata

config = context.config
# Reuse the application's normalized Psycopg 3 URL. Supabase supplies a
# generic postgresql:// URL, which SQLAlchemy would otherwise route to the
# uninstalled psycopg2 driver when Alembic creates its own engine.
config.set_main_option("sqlalchemy.url", database_url)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=database_url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
