"""Report endpoints - each returns an .xlsx file."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db import models
from app.db.session import get_db
from app.reports import aging, disputes, payment_packet, recon_report

router = APIRouter(prefix="/api/reports", tags=["reports"])


XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx(data: bytes, filename: str) -> Response:
    return Response(
        content=data,
        media_type=XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/aging.json")
def view_aging(db: Session = Depends(get_db)):
    from app.reports.aging import COLUMNS, build_rows
    return {"columns": COLUMNS, "rows": build_rows(db)}


@router.get("/disputes.json")
def view_disputes(db: Session = Depends(get_db)):
    from app.reports.disputes import COLUMNS
    rows_q = (
        db.query(models.ReconLineResult, models.ReconJob, models.Vendor)
        .join(models.ReconJob, models.ReconLineResult.job_id == models.ReconJob.id)
        .join(models.Vendor, models.ReconJob.vendor_id == models.Vendor.id)
        .filter(models.ReconLineResult.status.in_(["pending_in_bt", "amount_dispute"]))
        .order_by(models.Vendor.organization, models.ReconLineResult.status)
        .all()
    )
    rows = [
        {
            "Vendor": vendor.organization, "Status": line.status,
            "Invoice": line.vendor_inv_no or line.ajww_inv_no or "",
            "Currency": line.vendor_currency or "", "Amount": line.vendor_amount, "Diff": line.diff,
            "Queue Label": line.bt_label or "", "Queue Labels": line.bt_labels or "",
            "Follow-Up Note": line.bt_note or "", "Queue Owner": line.bt_owner or "",
            "Queue Link": line.bt_link or "",
            "Age (days)": line.vendor_age_days if line.vendor_age_days is not None else "",
        }
        for line, _job, vendor in rows_q
    ]
    return {"columns": COLUMNS, "rows": rows}


@router.get("/payment_packet.json")
def view_payment_packet(db: Session = Depends(get_db)):
    from app.reports.payment_packet import COLUMNS
    rows_q = (
        db.query(models.ReconLineResult, models.Vendor)
        .join(models.ReconJob, models.ReconLineResult.job_id == models.ReconJob.id)
        .join(models.Vendor, models.ReconJob.vendor_id == models.Vendor.id)
        .filter(models.ReconLineResult.status == "ok_to_pay")
        .order_by(models.Vendor.organization, models.ReconLineResult.vendor_date)
        .all()
    )
    rows = [
        {
            "Vendor": vendor.organization, "Invoice": line.vendor_inv_no or "",
            "Invoice Date": line.vendor_date or "", "Currency": line.vendor_currency or "", "Amount": line.vendor_amount,
            "Age (days)": line.vendor_age_days if line.vendor_age_days is not None else "",
            "Credit Term": vendor.credit_days or 0, "Books Txn No": line.ajww_txn_no or "",
        }
        for line, vendor in rows_q
    ]
    return {"columns": COLUMNS, "rows": rows}


@router.get("/recon/{job_id}.xlsx")
def export_recon(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.ReconJob).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    data = recon_report.build(db, job)
    safe = "".join(c if c.isalnum() else "_" for c in job.vendor.organization)
    return _xlsx(data, f"recon_{safe}_{job.id}.xlsx")


@router.get("/aging.xlsx")
def export_aging(db: Session = Depends(get_db)):
    return _xlsx(aging.build(db), "aging_summary.xlsx")


@router.get("/disputes.xlsx")
def export_disputes(db: Session = Depends(get_db)):
    return _xlsx(disputes.build(db), "dispute_log.xlsx")


@router.get("/payment_packet.xlsx")
def export_payment_packet(db: Session = Depends(get_db)):
    return _xlsx(payment_packet.build(db), "payment_packet.xlsx")
