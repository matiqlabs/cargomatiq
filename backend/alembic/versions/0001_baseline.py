"""Create the legacy finance and operations schema baseline.

The application started before Alembic existed. This baseline intentionally
uses SQLAlchemy metadata so a clean PostgreSQL database receives the complete
schema, including preserved finance tables, in one transaction.
"""
from alembic import op

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.db import models  # noqa: F401
    from app.db.session import Base
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    from app.db.session import Base
    Base.metadata.drop_all(bind=op.get_bind())
