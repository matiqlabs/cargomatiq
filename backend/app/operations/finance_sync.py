"""Expose finance reconciliation exceptions through the generic exception model."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.operations.service import ensure_default_organization


FINANCE_EXCEPTION_STATUSES = {"amount_dispute", "pending_in_bt", "to_be_booked", "missing_in_vendor", "paid", "not_due"}


def sync_finance_exception(db: Session, line: models.ReconLineResult, vendor_name: str) -> None:
    if line.status not in FINANCE_EXCEPTION_STATUSES:
        return
    organization = ensure_default_organization(db)
    row = db.scalar(select(models.OperationalException).where(models.OperationalException.finance_recon_line_id == line.id))
    title = f"Finance: {line.status.replace('_', ' ')}"
    description = f"{vendor_name} invoice {line.vendor_inv_no or line.ajww_inv_no or 'unknown'} requires reconciliation follow-up."
    if row is None:
        db.add(models.OperationalException(organization_id=organization.id, finance_recon_line_id=line.id, exception_type=f"FINANCE_{line.status.upper()}", severity="High" if line.status in {"amount_dispute", "missing_in_vendor"} else "Medium", title=title, description=description, evidence=[{"recon_line_id": line.id}]))
    else:
        row.title, row.description = title, description
