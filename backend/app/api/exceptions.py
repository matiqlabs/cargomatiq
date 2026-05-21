"""Exception Workbench endpoints for post-reconciliation operations."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import models
from app.db.session import get_db
from app.schemas import (
    ExceptionCaseOut,
    ExceptionSummaryOut,
    ExceptionWorkbenchOut,
    UpdateExceptionIn,
)
from app.recon.normalize import normalize_invno

router = APIRouter(prefix="/api/exceptions", tags=["exceptions"])

EXCEPTION_STATUSES = {
    "amount_dispute",
    "pending_in_bt",
    "to_be_booked",
    "missing_in_vendor",
    "paid",
    "not_due",
}

VALID_STATES = {"open", "in_progress", "waiting_vendor", "resolved"}
VALID_PRIORITIES = {"High", "Medium", "Low"}


def _reason(line: models.ReconLineResult) -> str:
    return {
        "amount_dispute": "Statement and books amounts do not match.",
        "pending_in_bt": "Invoice appears in the pending queue and needs follow-up.",
        "to_be_booked": "Vendor statement line is not available in books yet.",
        "missing_in_vendor": "Books line is missing from the vendor statement.",
        "paid": "Invoice appears already paid or settled outside this run.",
        "not_due": "Invoice is matched but not yet due based on credit terms.",
    }.get(line.status, "Line needs operational review.")


def _recommended_action(line: models.ReconLineResult) -> str:
    return {
        "amount_dispute": "Validate charges, attach backup, and raise a vendor dispute if variance is confirmed.",
        "pending_in_bt": "Open the queue item, assign an AP owner, and clear blockers.",
        "to_be_booked": "Create the accrual or booking request with invoice backup.",
        "missing_in_vendor": "Ask vendor to confirm whether the books invoice should remain payable.",
        "paid": "Confirm payment reference and suppress duplicate payment release.",
        "not_due": "Keep on watchlist until the invoice crosses the credit period.",
    }.get(line.status, "Review supporting data and record the next action.")


def _default_priority(line: models.ReconLineResult) -> str:
    if line.exception_priority:
        return line.exception_priority
    if line.status in {"amount_dispute", "missing_in_vendor"}:
        return "High"
    if line.status in {"pending_in_bt", "to_be_booked"}:
        return "Medium"
    return "Low"


def _default_due_date(line: models.ReconLineResult, priority: str) -> str:
    if line.exception_due_date:
        return line.exception_due_date
    days = 1 if priority == "High" else 3 if priority == "Medium" else 7
    return (date.today() + timedelta(days=days)).isoformat()


def _case_from_line(line: models.ReconLineResult, job: models.ReconJob, vendor: models.Vendor) -> ExceptionCaseOut:
    priority = _default_priority(line)
    amount = line.vendor_amount if line.vendor_amount is not None else line.ajww_amount
    invoice_no = line.vendor_inv_no or line.ajww_inv_no
    return ExceptionCaseOut(
        id=line.id,
        job_id=job.id,
        vendor=vendor.organization,
        vendor_country=vendor.country,
        status=line.status,
        reason=_reason(line),
        recommended_action=_recommended_action(line),
        invoice_no=invoice_no,
        invoice_date=line.vendor_date or line.ajww_date,
        currency=line.vendor_currency,
        amount=amount,
        diff=line.diff,
        books_txn_no=line.ajww_txn_no,
        queue_label=line.bt_label,
        queue_owner=line.bt_owner,
        queue_link=line.bt_link,
        age_days=line.vendor_age_days,
        state=line.exception_state or "open",
        owner=line.exception_owner or line.bt_owner,
        priority=priority,
        due_date=_default_due_date(line, priority),
        note=line.exception_note,
        resolution=line.exception_resolution,
        created_at=job.created_at,
    )


def _display_date(value: str | None) -> str:
    if not value:
        return ""
    text = str(value)
    return text[:10] if len(text) >= 10 and text[4:5] == "-" and text[7:8] == "-" else text


def _exception_key(line: models.ReconLineResult, job: models.ReconJob, vendor: models.Vendor) -> tuple:
    invoice_no = line.vendor_inv_no or line.ajww_inv_no
    invoice_date = _display_date(line.vendor_date or line.ajww_date)
    normalized_invoice = normalize_invno(invoice_no)
    if normalized_invoice or invoice_date:
        return (
            vendor.organization.strip().lower(),
            normalized_invoice,
            invoice_date,
            line.status,
        )
    fallback_ref = line.ajww_txn_no or line.bt_link or str(line.id)
    return (
        vendor.organization.strip().lower(),
        line.status,
        fallback_ref,
    )


def _dedupe_cases(rows) -> list[tuple[models.ReconLineResult, models.ReconJob, models.Vendor]]:
    seen: set[tuple] = set()
    unique = []
    for line, job, vendor in rows:
        key = _exception_key(line, job, vendor)
        if key in seen:
            continue
        seen.add(key)
        unique.append((line, job, vendor))
    return unique


def _query_cases(db: Session):
    return (
        db.query(models.ReconLineResult, models.ReconJob, models.Vendor)
        .join(models.ReconJob, models.ReconLineResult.job_id == models.ReconJob.id)
        .join(models.Vendor, models.ReconJob.vendor_id == models.Vendor.id)
        .filter(models.ReconJob.status == "reconciled")
        .filter(models.ReconLineResult.status.in_(EXCEPTION_STATUSES))
        .order_by(models.ReconJob.updated_at.desc(), models.ReconLineResult.id.desc())
        .all()
    )


def _summary(cases: list[ExceptionCaseOut]) -> ExceptionSummaryOut:
    today = date.today()
    soon = today + timedelta(days=2)
    summary = ExceptionSummaryOut(total=len(cases))
    for case in cases:
        state = case.state
        if state == "open":
            summary.open += 1
        elif state == "in_progress":
            summary.in_progress += 1
        elif state == "waiting_vendor":
            summary.waiting_vendor += 1
        elif state == "resolved":
            summary.resolved += 1
        if case.priority == "High" and state != "resolved":
            summary.high_priority += 1
        if case.due_date and state != "resolved":
            try:
                due = date.fromisoformat(case.due_date[:10])
                if due <= soon:
                    summary.due_soon += 1
            except ValueError:
                pass
        if state != "resolved":
            summary.total_amount += float(case.amount or 0)
    summary.total_amount = round(summary.total_amount, 2)
    return summary


@router.get("", response_model=ExceptionWorkbenchOut)
def list_exceptions(db: Session = Depends(get_db)):
    cases = [_case_from_line(line, job, vendor) for line, job, vendor in _dedupe_cases(_query_cases(db))]
    return ExceptionWorkbenchOut(summary=_summary(cases), cases=cases)


@router.patch("/{line_id}", response_model=ExceptionCaseOut)
def update_exception(line_id: int, body: UpdateExceptionIn, db: Session = Depends(get_db)):
    row = (
        db.query(models.ReconLineResult, models.ReconJob, models.Vendor)
        .join(models.ReconJob, models.ReconLineResult.job_id == models.ReconJob.id)
        .join(models.Vendor, models.ReconJob.vendor_id == models.Vendor.id)
        .filter(models.ReconLineResult.id == line_id)
        .one_or_none()
    )
    if not row:
        raise HTTPException(404, "Exception line not found")
    line, job, vendor = row
    if line.status not in EXCEPTION_STATUSES:
        raise HTTPException(400, "This line is not an exception case")

    updates = body.model_dump(exclude_unset=True)
    if "state" in updates and updates["state"] not in VALID_STATES:
        raise HTTPException(400, "Invalid exception state")
    if "priority" in updates and updates["priority"] not in VALID_PRIORITIES:
        raise HTTPException(400, "Invalid priority")

    if "state" in updates:
        line.exception_state = updates["state"]
    if "owner" in updates:
        line.exception_owner = updates["owner"]
    if "priority" in updates:
        line.exception_priority = updates["priority"]
    if "due_date" in updates:
        line.exception_due_date = updates["due_date"]
    if "note" in updates:
        line.exception_note = updates["note"]
    if "resolution" in updates:
        line.exception_resolution = updates["resolution"]

    db.commit()
    db.refresh(line)
    return _case_from_line(line, job, vendor)
