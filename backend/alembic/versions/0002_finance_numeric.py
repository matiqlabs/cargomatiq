"""Use fixed precision for financial amounts."""
from alembic import op
import sqlalchemy as sa

revision = "0002_finance_numeric"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

_COLUMNS = {
    "logisys_lines": ["bucket_1_15", "bucket_16_30", "bucket_31_45", "bucket_46_60", "bucket_61_90", "bucket_over_90", "outstanding"],
    "bt_lines": ["invoice_total", "accrued_total"],
    "recon_jobs": ["residual"],
    "recon_line_results": ["vendor_amount", "ajww_amount", "diff"],
}


def upgrade() -> None:
    for table, columns in _COLUMNS.items():
        for column in columns:
            op.alter_column(table, column, type_=sa.Numeric(18, 2), postgresql_using=f"{column}::numeric(18,2)")


def downgrade() -> None:
    for table, columns in _COLUMNS.items():
        for column in columns:
            op.alter_column(table, column, type_=sa.Float())
