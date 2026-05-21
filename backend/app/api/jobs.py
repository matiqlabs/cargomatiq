"""Recon job lifecycle: create, upload SOA, suggest mapping, confirm + run."""
import shutil
import tempfile
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import models
from app.db.session import get_db
from app.extraction import extract_file, list_sheets
from app.mapping.apply import apply_mapping
from app.mapping.dictionary import ALIASES
from app.mapping.resolver import header_signature, suggest_mapping
from app.recon.currency import currency_from_country, infer_currency_from_value
from app.recon.runner import run_job
from app.schemas import (
    ConfirmMappingIn,
    CreateJobIn,
    ExtractionReviewOut,
    ExtractionReviewRow,
    MappingSuggestOut,
    ReconJobBrief,
    ReconJobDetail,
    SaveReviewIn,
)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _currency_for_canonical_row(row: dict, amount_header: str | None, vendor: models.Vendor) -> str:
    raw = row.get("_raw") or {}
    return (
        infer_currency_from_value(raw.get(amount_header) if amount_header else None)
        or infer_currency_from_value(row.get("amount"))
        or currency_from_country(vendor.country)
    )


def _detect_header_row(path, sheet_name, max_scan: int = 5) -> int:
    """Auto-detect which row in the SOA holds the column headers.

    Scans the first `max_scan` rows, treats each as a candidate header row,
    and scores it by how many of its cells look like canonical field aliases
    (invoice number / date / amount synonyms). The row with the most hits
    wins. Falls back to 0 if no row stands out.

    Real-world SOAs vary: clean 3-column files have headers on row 1
    (header_row=0); AP-team templates with sub-total preambles have them on
    row 2 (header_row=1). This makes the upload robust to both.
    """
    all_aliases = {a.lower() for v in ALIASES.values() for a in v}
    best_row, best_hits = 0, 0
    for hr in range(max_scan):
        try:
            t = extract_file(path, sheet_name=sheet_name, header_row=hr)
        except Exception:
            continue
        hits = 0
        for h in t.headers:
            if not isinstance(h, str):
                continue
            hl = h.strip().lower()
            if not hl:
                continue
            if any(a in hl or hl in a for a in all_aliases):
                hits += 1
        if hits > best_hits:
            best_hits, best_row = hits, hr
    return best_row


@router.post("/msg-preview")
def preview_msg_file(file: UploadFile = File(...)):
    """Convert a .msg to rows and return as JSON — no job created, for user verification."""
    if not (file.filename or "").lower().endswith(".msg"):
        raise HTTPException(400, "File must be a .msg")
    tmp_path = Path(tempfile.mktemp(suffix=".msg"))
    with tmp_path.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)
    try:
        from app.extraction.msg_converter import workbook_bytes_from_msg
        result, _ = workbook_bytes_from_msg(tmp_path)
    except Exception as exc:
        raise HTTPException(400, f"Extraction failed: {exc}")
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass
    return {
        "vendor_hint": result.vendor_hint,
        "source_type": result.source_type,
        "source_name": result.source_name,
        "source_details": result.source_details,
        "row_count": len(result.rows),
        "rows": [
            {
                "INV Number": r.invoice_number,
                "INV Date": r.invoice_date,
                "Outstanding Amount": r.outstanding_amount,
            }
            for r in result.rows
        ],
    }


@router.get("", response_model=list[ReconJobBrief])
def list_jobs(db: Session = Depends(get_db)):
    return db.query(models.ReconJob).order_by(models.ReconJob.created_at.desc()).all()


@router.post("", response_model=ReconJobBrief)
def create_job(body: CreateJobIn, db: Session = Depends(get_db)):
    vendor = db.query(models.Vendor).get(body.vendor_id)
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    if not db.query(models.LogisysSnapshot).get(body.logisys_snapshot_id):
        raise HTTPException(404, "Logisys snapshot not found")
    if not db.query(models.BTSnapshot).get(body.bt_snapshot_id):
        raise HTTPException(404, "BT snapshot not found")
    job = models.ReconJob(
        vendor_id=body.vendor_id,
        logisys_snapshot_id=body.logisys_snapshot_id,
        bt_snapshot_id=body.bt_snapshot_id,
        status="draft",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _job_to_detail(job: models.ReconJob) -> dict:
    return {
        "id": job.id,
        "status": job.status,
        "residual": job.residual,
        "closed": job.closed,
        "summary": job.summary,
        "vendor": job.vendor,
        "logisys_snapshot": job.logisys_snapshot,
        "bt_snapshot": job.bt_snapshot,
        "results": job.results,
        "mapping": job.soa.mapping if job.soa else None,
        "soa_filename": job.soa.filename if job.soa else None,
    }


@router.get("/{job_id}", response_model=ReconJobDetail)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.ReconJob).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return _job_to_detail(job)


@router.post("/{job_id}/soa")
def upload_soa(
    job_id: int,
    sheet: str | None = None,
    header_row: int | None = None,  # None → auto-detect; explicit int → use as-is
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> MappingSuggestOut:
    """Upload the vendor's SOA, auto-detect column mapping, return suggestion.

    `header_row` semantics:
      - omitted/None: scan the first few rows and pick the one whose cells
        look most like canonical field names (handles clean 3-col SOAs AND
        AP-team templates with sub-total preambles automatically).
      - explicit int: use that row index verbatim (accountant override).
    """
    job = db.query(models.ReconJob).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    filename_lower = (file.filename or "").lower()
    if not filename_lower.endswith((".xlsx", ".xlsm", ".csv", ".msg")):
        raise HTTPException(400, "SOA must be .xlsx, .csv, or .msg")

    dest = settings.storage_dir / f"soa_{job.id}_{uuid.uuid4().hex}_{file.filename}"
    with dest.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)

    # Convert .msg to xlsx before passing through the normal extraction pipeline.
    # The converter produces a standardised 3-column workbook (INV Number / INV Date /
    # Outstanding Amount) that the existing alias dictionary maps at score 100.
    msg_source = None
    if filename_lower.endswith(".msg"):
        try:
            from app.extraction.msg_converter import (
                MsgConversionError,
                workbook_bytes_from_msg,
            )
            msg_source, xlsx_bytes = workbook_bytes_from_msg(dest)
        except Exception as exc:
            dest.unlink(missing_ok=True)
            raise HTTPException(400, f"Failed to convert .msg to Excel: {exc}")
        xlsx_dest = dest.with_suffix(".xlsx")
        xlsx_dest.write_bytes(xlsx_bytes)
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            pass  # Windows: handle may still be held; leave the .msg, xlsx is what matters
        dest = xlsx_dest
        # Converted xlsx always has headers on row 0; skip auto-detection.
        if header_row is None:
            header_row = 0

    # Resolve sheet
    sheets = list_sheets(dest)
    chosen_sheet = sheet if sheet in sheets else (sheets[0] if sheets else None)

    # Auto-detect header row if not explicitly provided
    if header_row is None:
        header_row = _detect_header_row(dest, chosen_sheet)

    try:
        table = extract_file(dest, sheet_name=chosen_sheet, header_row=header_row)
    except Exception as e:
        raise HTTPException(400, f"Failed to read SOA: {e}")

    if not table.headers:
        raise HTTPException(400, "SOA has no headers at the chosen row.")

    suggested = suggest_mapping(table.headers, table.rows)

    # Try cache
    sig = header_signature(table.headers)
    cached = (
        db.query(models.VendorMappingCache)
        .filter_by(vendor_id=job.vendor_id, header_signature=sig)
        .one_or_none()
    )

    if cached:
        # Pre-fill suggestion with cached choices (still let the user override).
        for field, header in cached.mapping.items():
            if field in suggested:
                suggested[field]["header"] = header
                suggested[field]["score"] = 100

    # Persist UploadedSOA (overwrite any prior one)
    if job.soa is not None:
        db.delete(job.soa)
        db.flush()
    soa = models.UploadedSOA(
        job_id=job.id,
        filename=file.filename,
        storage_path=str(dest),
        raw_headers=table.headers,
        raw_preview=table.rows[:25],
        mapping={
            "_suggested": suggested,
            "_sheet": chosen_sheet,
            "_header_row": header_row,
            "_source_type": msg_source.source_type if msg_source else "uploaded_statement",
            "_source_name": msg_source.source_name if msg_source else file.filename,
            "_source_details": msg_source.source_details if msg_source else "Extracted from the uploaded vendor statement file.",
        },
    )
    db.add(soa)
    job.status = "mapping_pending"
    db.commit()
    db.refresh(soa)

    return MappingSuggestOut(
        headers=table.headers,
        preview=table.rows[:10],
        suggested=suggested,
        cached=cached is not None,
    )


@router.post("/{job_id}/mapping/confirm", response_model=ReconJobDetail)
def confirm_mapping(job_id: int, body: ConfirmMappingIn, db: Session = Depends(get_db)):
    """Confirm column mapping, materialize canonical rows, run reconciliation."""
    job = db.query(models.ReconJob).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.soa is None:
        raise HTTPException(400, "No SOA uploaded for this job.")

    mapping = body.mapping or {}
    required = ("invoice_no", "invoice_date", "amount")
    missing = [f for f in required if not mapping.get(f)]
    if missing:
        raise HTTPException(400, f"Missing mapping for: {', '.join(missing)}")

    # Re-extract from disk to get full rows (we only stored preview)
    soa_meta = job.soa.mapping or {}
    chosen_sheet = soa_meta.get("_sheet")
    header_row = soa_meta.get("_header_row", 0)
    try:
        table = extract_file(job.soa.storage_path, sheet_name=chosen_sheet, header_row=header_row)
    except Exception as e:
        raise HTTPException(400, f"Failed to re-read SOA: {e}")

    canonical = apply_mapping(table, mapping)
    amount_header = mapping.get("amount")
    # Strip _raw before persisting to keep JSON column compact, but preserve inferred currency.
    persisted = []
    for row in canonical:
        compact = {k: v for k, v in row.items() if k != "_raw"}
        compact["currency"] = _currency_for_canonical_row(row, amount_header, job.vendor)
        persisted.append(compact)

    job.soa.canonical_rows = persisted
    # Clear any previous review when mapping changes
    job.soa.reviewed_rows = None
    job.soa.review_status = None
    job.soa.reviewed_at = None
    job.soa.mapping = {**mapping, "_sheet": chosen_sheet, "_header_row": header_row}
    job.status = "review_pending"
    db.commit()

    # Cache mapping by header signature
    sig = header_signature(table.headers)
    existing = (
        db.query(models.VendorMappingCache)
        .filter_by(vendor_id=job.vendor_id, header_signature=sig)
        .one_or_none()
    )
    if existing:
        existing.mapping = {k: v for k, v in mapping.items() if k in ("invoice_no", "invoice_date", "amount")}
    else:
        db.add(models.VendorMappingCache(
            vendor_id=job.vendor_id,
            header_signature=sig,
            mapping={k: v for k, v in mapping.items() if k in ("invoice_no", "invoice_date", "amount")},
        ))
    db.commit()
    db.refresh(job)
    return _job_to_detail(job)


@router.post("/{job_id}/rerun", response_model=ReconJobDetail)
def rerun(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.ReconJob).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.soa is None or not job.soa.canonical_rows:
        raise HTTPException(400, "Mapping not confirmed yet.")
    vendor_rows = _resolve_vendor_rows(job.soa)
    run_job(db, job, vendor_rows=vendor_rows)
    db.refresh(job)
    return _job_to_detail(job)


# ── Extraction review endpoints ────────────────────────────────────────────

def _row_confidence(row: dict) -> str:
    has_inv = bool(row.get("invoice_no"))
    has_date = bool(row.get("invoice_date"))
    has_amt = row.get("amount") is not None
    if has_inv and has_date and has_amt:
        return "High"
    elif has_inv and has_amt:
        return "Medium"
    return "Low"


def _due_date_from_invoice(invoice_date, credit_days: int | None) -> str | None:
    if not invoice_date:
        return None
    try:
        if isinstance(invoice_date, datetime):
            base = invoice_date.date()
        elif isinstance(invoice_date, date):
            base = invoice_date
        else:
            base = date.fromisoformat(str(invoice_date)[:10])
    except (TypeError, ValueError):
        return None
    return (base + timedelta(days=int(credit_days or 0))).isoformat()


def _canonical_to_review(canonical_rows: list, vendor: models.Vendor | None = None) -> list[ExtractionReviewRow]:
    fallback_currency = currency_from_country(vendor.country if vendor else None)
    credit_days = vendor.credit_days if vendor else 0
    return [
        ExtractionReviewRow(
            id=str(i),
            invoice_no=row.get("invoice_no"),
            invoice_date=row.get("invoice_date"),
            amount=row.get("amount"),
            currency=row.get("currency") or fallback_currency,
            due_date=row.get("due_date") or _due_date_from_invoice(row.get("invoice_date"), credit_days),
            confidence=_row_confidence(row),
            source="extracted",
            ignored=False,
            edited=False,
        )
        for i, row in enumerate(canonical_rows)
    ]


def _resolve_vendor_rows(soa: models.UploadedSOA) -> list[dict]:
    """Return the rows that reconciliation should consume.

    Uses reviewed_rows (excluding ignored) if saved, otherwise canonical_rows.
    Maps to the minimal {invoice_no, invoice_date, amount} format the engine expects.
    """
    if soa.reviewed_rows:
        return [
            {
                "invoice_no": r["invoice_no"],
                "invoice_date": r.get("invoice_date"),
                "amount": r["amount"],
                "currency": r.get("currency"),
            }
            for r in soa.reviewed_rows
            if not r.get("ignored", False)
            and r.get("invoice_no")
            and r.get("amount") is not None
        ]
    return soa.canonical_rows or []


@router.get("/{job_id}/extraction-review", response_model=ExtractionReviewOut)
def get_extraction_review(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.ReconJob).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    soa = job.soa
    if soa is None:
        raise HTTPException(400, "No SOA uploaded for this job.")
    if soa.reviewed_rows is not None:
        rows = [ExtractionReviewRow(**r) for r in soa.reviewed_rows]
    elif soa.canonical_rows:
        rows = _canonical_to_review(soa.canonical_rows, job.vendor)
    else:
        rows = []
    source_meta = soa.mapping or {}
    return ExtractionReviewOut(
        job_id=job.id,
        vendor_name=job.vendor.organization,
        vendor_credit_days=job.vendor.credit_days or 0,
        soa_filename=soa.filename,
        document_source_type=source_meta.get("_source_type") or "uploaded_statement",
        document_source_name=source_meta.get("_source_name") or soa.filename,
        document_source_details=source_meta.get("_source_details"),
        document_download_url=f"/api/jobs/{job.id}/soa/download",
        row_count=len(rows),
        rows=rows,
        review_status=soa.review_status,
    )


@router.get("/{job_id}/soa/download")
def download_soa_document(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.ReconJob).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.soa is None:
        raise HTTPException(400, "No SOA uploaded for this job.")
    path = Path(job.soa.storage_path)
    if not path.exists():
        raise HTTPException(404, "Stored statement file not found.")

    original = job.soa.filename or path.name
    if original.lower().endswith(".msg") and path.suffix.lower() == ".xlsx":
        download_name = f"{Path(original).stem}_extracted_statement.xlsx"
    else:
        download_name = original
    return FileResponse(path, filename=download_name)


@router.put("/{job_id}/extraction-review")
def save_extraction_review(job_id: int, body: SaveReviewIn, db: Session = Depends(get_db)):
    job = db.query(models.ReconJob).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.soa is None:
        raise HTTPException(400, "No SOA uploaded for this job.")
    job.soa.reviewed_rows = [r.model_dump() for r in body.rows]
    job.soa.review_status = "saved"
    job.soa.reviewed_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "saved": len(body.rows)}


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.ReconJob).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    db.delete(job)
    db.commit()


@router.post("/{job_id}/continue-reconciliation", response_model=ReconJobDetail)
def continue_reconciliation(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.ReconJob).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.soa is None or not job.soa.canonical_rows:
        raise HTTPException(400, "Mapping not confirmed yet.")
    vendor_rows = _resolve_vendor_rows(job.soa)
    if not vendor_rows:
        raise HTTPException(400, "No rows to reconcile (all rows may be ignored).")
    try:
        run_job(db, job, vendor_rows=vendor_rows)
    except Exception as e:
        raise HTTPException(500, f"Reconciliation failed: {e}")
    db.refresh(job)
    return _job_to_detail(job)
