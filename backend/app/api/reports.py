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
    from app.reports.aging import _bucket, BUCKETS, COLUMNS
    jobs = db.query(models.ReconJob).filter(models.ReconJob.status == "reconciled").all()
    grouped: dict = {}
    vendor_meta: dict = {}
    for job in jobs:
        v = job.vendor
        vendor_meta[v.organization] = {"country": v.country or "", "currency": "USD"}
        for r in job.results:
            if r.status not in ("ok_to_pay", "not_due", "pending_in_bt", "amount_dispute"):
                continue
            amt = r.vendor_amount or 0.0
            b = _bucket(r.vendor_age_days)
            grouped.setdefault(v.organization, {x: 0.0 for x in BUCKETS})
            grouped[v.organization][b] += amt
    rows = []
    for vendor in sorted(grouped):
        meta = vendor_meta[vendor]
        buckets = grouped[vendor]
        rows.append({
            "Partner": vendor, "Country": meta["country"], "Currency": meta["currency"],
            "0-30": round(buckets["0-30"], 2), "31-60": round(buckets["31-60"], 2),
            "61-90": round(buckets["61-90"], 2), "90+": round(buckets["90+"], 2),
            "Total": round(sum(buckets.values()), 2),
        })
    return {"columns": COLUMNS, "rows": rows}


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
            "Partner": vendor.organization, "Status": line.status,
            "Invoice": line.vendor_inv_no or line.ajww_inv_no or "",
            "Amount": line.vendor_amount, "Diff": line.diff,
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
            "Partner": vendor.organization, "Invoice": line.vendor_inv_no or "",
            "Invoice Date": line.vendor_date or "", "Amount": line.vendor_amount,
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
