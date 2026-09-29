"""Operations Inbox, Shipment Workspace, exceptions, tasks, and demo replay APIs."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.db.session import get_db
from app.operations.service import ensure_default_organization, ingest_raw_email


router = APIRouter(prefix="/api/operations", tags=["operations"])


def _match_out(email: models.EmailMessage, db: Session) -> dict:
    """Turn stored resolver rationale into demo-friendly shipment labels."""
    rationale = email.resolution_reason or {}
    candidates = []
    for job_id, references in (rationale.get("candidates") or {}).items():
        try:
            job = db.get(models.ForwardingJob, int(job_id))
        except (TypeError, ValueError):
            job = None
        if job:
            candidates.append({"id": job.id, "job_code": job.job_code, "references": references})
    target = db.get(models.ForwardingJob, email.resolved_job_id) if email.resolved_job_id else None
    return {
        "decision": email.resolution_status,
        "reason": rationale.get("reason"),
        "target": {"id": target.id, "job_code": target.job_code} if target else None,
        "candidates": candidates,
        "extracted_references": rationale.get("references") or [],
    }


def _email_out(email: models.EmailMessage, db: Session) -> dict:
    attachments = db.scalars(select(models.EmailAttachment).where(models.EmailAttachment.email_id == email.id)).all()
    documents = db.scalars(select(models.Document).join(models.EmailAttachment, models.Document.attachment_id == models.EmailAttachment.id).where(models.EmailAttachment.email_id == email.id)).all()
    return {
        "id": email.id, "sender": email.sender, "subject": email.subject,
        "received_at": email.received_at, "status": email.processing_status,
        "resolution_status": email.resolution_status, "resolution_reason": email.resolution_reason or {},
        "shipment_id": email.resolved_job_id, "attachments": [{"id": a.id, "filename": a.filename, "mime_type": a.mime_type} for a in attachments],
        "documents": [{"id": d.id, "filename": d.filename, "document_type": d.document_type} for d in documents],
        "match": _match_out(email, db),
        "error_message": email.error_message,
    }


@router.get("/inbox")
def list_inbox(limit: int = 100, db: Session = Depends(get_db)):
    org = ensure_default_organization(db)
    rows = db.scalars(select(models.EmailMessage).where(models.EmailMessage.organization_id == org.id).order_by(models.EmailMessage.created_at.desc()).limit(limit)).all()
    db.commit()
    return {"items": [_email_out(row, db) for row in rows]}


@router.post("/inbox/replay")
async def replay_email(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not (file.filename or "").lower().endswith(".eml"):
        raise HTTPException(400, "Upload an .eml file.")
    org = ensure_default_organization(db)
    email, created = ingest_raw_email(db, await file.read(), organization=org)
    return {"created": created, "item": _email_out(email, db)}


def _shipment_out(job: models.ForwardingJob, db: Session, detail: bool = False) -> dict:
    refs = db.scalars(select(models.JobReference).where(models.JobReference.job_id == job.id)).all()
    exceptions = db.scalars(select(models.OperationalException).where(models.OperationalException.job_id == job.id).order_by(models.OperationalException.created_at.desc())).all()
    data = {
        "id": job.id, "job_code": job.job_code, "transport_mode": job.transport_mode,
        "direction": job.direction, "status": job.status, "canonical_facts": job.canonical_facts or {},
        "references": [{"type": r.reference_type, "value": r.value} for r in refs],
        "exception_count": len([e for e in exceptions if e.state != "resolved"]), "created_at": job.created_at,
    }
    if detail:
        data["events"] = [{"id": e.id, "event_type": e.event_type, "title": e.title, "details": e.details or {}, "occurred_at": e.occurred_at} for e in db.scalars(select(models.ShipmentEvent).where(models.ShipmentEvent.job_id == job.id).order_by(models.ShipmentEvent.occurred_at.desc())).all()]
        data["documents"] = [{"id": d.id, "filename": d.filename, "document_type": d.document_type, "status": d.status} for d in db.scalars(select(models.Document).join(models.JobDocument, models.JobDocument.document_id == models.Document.id).where(models.JobDocument.job_id == job.id)).all()]
        data["communication"] = [_email_out(email, db) for email in db.scalars(select(models.EmailMessage).join(models.JobEmail, models.JobEmail.email_id == models.EmailMessage.id).where(models.JobEmail.job_id == job.id).order_by(models.EmailMessage.created_at.desc())).all()]
        data["exceptions"] = [_exception_out(e) for e in exceptions]
        data["tasks"] = [_task_out(t) for t in db.scalars(select(models.OperationalTask).where(models.OperationalTask.job_id == job.id).order_by(models.OperationalTask.created_at.desc())).all()]
        data["observations"] = [{"id": o.id, "field": o.field_code, "value": o.value_json, "evidence_text": o.evidence_text, "confidence": o.confidence, "document_id": o.document_id} for o in db.scalars(select(models.FieldObservation).where(models.FieldObservation.job_id == job.id).order_by(models.FieldObservation.observed_at.desc())).all()]
    return data


@router.get("/shipments")
def list_shipments(db: Session = Depends(get_db)):
    org = ensure_default_organization(db)
    rows = db.scalars(select(models.ForwardingJob).where(models.ForwardingJob.organization_id == org.id).order_by(models.ForwardingJob.updated_at.desc())).all()
    db.commit()
    return {"items": [_shipment_out(job, db) for job in rows]}


@router.get("/shipments/{job_id}")
def get_shipment(job_id: int, db: Session = Depends(get_db)):
    job = db.get(models.ForwardingJob, job_id)
    if not job:
        raise HTTPException(404, "Shipment not found")
    return _shipment_out(job, db, detail=True)


class ResolveEmailIn(BaseModel):
    email_id: int


@router.post("/shipments/{job_id}/emails")
def manually_link_email(job_id: int, body: ResolveEmailIn, db: Session = Depends(get_db)):
    job, email = db.get(models.ForwardingJob, job_id), db.get(models.EmailMessage, body.email_id)
    if not job or not email or job.organization_id != email.organization_id:
        raise HTTPException(404, "Shipment or email not found")
    if not db.scalar(select(models.JobEmail).where(models.JobEmail.job_id == job.id, models.JobEmail.email_id == email.id)):
        db.add(models.JobEmail(job_id=job.id, email_id=email.id))
    email.resolved_job_id, email.resolution_status = job.id, "manually_matched"
    db.add(models.ShipmentEvent(job_id=job.id, event_type="EMAIL_MANUALLY_LINKED", title=email.subject or "Email linked manually", details={"email_id": email.id}))
    db.commit()
    return _shipment_out(job, db, detail=True)


def _exception_out(row: models.OperationalException) -> dict:
    return {"id": row.id, "shipment_id": row.job_id, "type": row.exception_type, "severity": row.severity, "title": row.title, "description": row.description, "evidence": row.evidence or [], "state": row.state, "owner": row.owner, "due_at": row.due_at, "resolution": row.resolution, "created_at": row.created_at}


@router.get("/exceptions")
def list_operational_exceptions(db: Session = Depends(get_db)):
    org = ensure_default_organization(db)
    rows = db.scalars(select(models.OperationalException).where(models.OperationalException.organization_id == org.id).order_by(models.OperationalException.created_at.desc())).all()
    db.commit()
    return {"items": [_exception_out(row) for row in rows]}


class ExceptionUpdateIn(BaseModel):
    state: str | None = None
    owner: str | None = None
    resolution: str | None = None


@router.patch("/exceptions/{exception_id}")
def update_operational_exception(exception_id: int, body: ExceptionUpdateIn, db: Session = Depends(get_db)):
    row = db.get(models.OperationalException, exception_id)
    if not row:
        raise HTTPException(404, "Exception not found")
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(row, key, value)
    db.commit()
    return _exception_out(row)


def _task_out(row: models.OperationalTask) -> dict:
    return {"id": row.id, "shipment_id": row.job_id, "exception_id": row.exception_id, "title": row.title, "state": row.state, "owner": row.owner, "due_at": row.due_at, "created_at": row.created_at}


@router.get("/tasks")
def list_tasks(db: Session = Depends(get_db)):
    org = ensure_default_organization(db)
    rows = db.scalars(select(models.OperationalTask).where(models.OperationalTask.organization_id == org.id).order_by(models.OperationalTask.created_at.desc())).all()
    db.commit()
    return {"items": [_task_out(row) for row in rows]}


class TaskUpdateIn(BaseModel):
    state: str | None = None
    owner: str | None = None


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, body: TaskUpdateIn, db: Session = Depends(get_db)):
    row = db.get(models.OperationalTask, task_id)
    if not row:
        raise HTTPException(404, "Task not found")
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(row, key, value)
    db.commit()
    return _task_out(row)


@router.post("/demo/replay")
def replay_demo(db: Session = Depends(get_db)):
    """Replay checked-in synthetic EML fixtures through the production ingestion path."""
    org = ensure_default_organization(db)
    demo_dir = Path(__file__).resolve().parent.parent / "operations" / "demo_emails"
    if not demo_dir.exists():
        raise HTTPException(404, "Demo fixtures are not installed")
    results = []
    for path in sorted(demo_dir.glob("*.eml")):
        email, created = ingest_raw_email(db, path.read_bytes(), organization=org, source_provider="demo_replay")
        results.append({"filename": path.name, "created": created, "email_id": email.id, "shipment_id": email.resolved_job_id})
    return {"items": results}
