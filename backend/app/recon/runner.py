"""Orchestrate a recon job end-to-end: load lines, run engine, classify,
persist ReconLineResult rows, update the ReconJob summary.
"""
from datetime import date

from sqlalchemy.orm import Session

from app.db import models
from app.recon.classifier import classify
from app.recon.engine import reconcile


def run_job(db: Session, job: models.ReconJob, vendor_rows=None) -> models.ReconJob:
    """Run reconciliation for a job.

    vendor_rows: optional override row list (e.g. reviewed/corrected rows).
                 If None, falls back to soa.canonical_rows.
    """
    vendor = job.vendor
    soa = job.soa

    if vendor_rows is None:
        if soa is None or not soa.canonical_rows:
            raise ValueError("Job has no canonical SOA rows; confirm mapping first.")
        vendor_rows = soa.canonical_rows

    logisys_lines = (
        db.query(models.LogisysLine)
        .filter(models.LogisysLine.snapshot_id == job.logisys_snapshot_id)
        .filter(models.LogisysLine.organization == vendor.organization)
        .all()
    )
    bt_lines = (
        db.query(models.BTLine)
        .filter(models.BTLine.snapshot_id == job.bt_snapshot_id)
        .filter(models.BTLine.vendor == vendor.organization)
        .all()
    )

    result = reconcile(
        vendor_rows,
        logisys_lines,
        today_iso=date.today().isoformat(),
        credit_days=vendor.credit_days or 0,
    )
    result = classify(result, vendor.organization, bt_lines)

    # Wipe old results, persist new
    db.query(models.ReconLineResult).filter_by(job_id=job.id).delete()
    persisted_lines = []
    for rl in result.lines:
        persisted = models.ReconLineResult(
            job_id=job.id,
            status=rl.status,
            match_method=rl.match_method,
            vendor_inv_no=rl.vendor_inv_no,
            vendor_date=rl.vendor_date,
            vendor_amount=rl.vendor_amount,
            vendor_currency=rl.vendor_currency,
            vendor_age_days=rl.vendor_age_days,
            ajww_inv_no=rl.ajww_inv_no,
            ajww_txn_no=rl.ajww_txn_no,
            ajww_date=rl.ajww_date,
            ajww_amount=rl.ajww_amount,
            diff=rl.diff,
            bt_label=rl.bt_label,
            bt_labels=rl.bt_labels,
            bt_note=rl.bt_note,
            bt_link=rl.bt_link,
            bt_owner=rl.bt_owner,
        )
        db.add(persisted)
        persisted_lines.append(persisted)

    job.residual = result.residual
    job.closed = result.closed
    job.status = "reconciled"
    job.summary = {
        "vendor_total": result.vendor_total,
        "ajww_total": result.ajww_total,
        "reconstructed_total": result.reconstructed_total,
        "residual": result.residual,
        "closed": result.closed,
        "counts": result.counts,
        "vendor": vendor.organization,
        "credit_days": vendor.credit_days,
        "country": vendor.country,
        "gl_group": vendor.gl_group,
    }
    db.flush()
    # Finance remains its own workflow, but finance exceptions become first-
    # class generic cases alongside shipment exceptions.
    from app.operations.finance_sync import sync_finance_exception
    for line in persisted_lines:
        sync_finance_exception(db, line, vendor.organization)
    db.commit()
    db.refresh(job)
    return job
