"""Single ingestion pipeline: raw MIME -> evidence -> job resolution -> rules."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import models
from app.operations.documents import classify_document, fixture_provider
from app.operations.email_parser import clean_body_text, parse_email
from app.operations.storage import object_storage


REFERENCE_FIELDS = {"booking_number": "booking", "bl_number": "bill_of_lading", "container_number": "container", "po_number": "purchase_order", "invoice_number": "invoice"}
STRONG_REFERENCE_TYPES = {"booking", "bill_of_lading", "container", "air_waybill", "road_consignment_note"}


def normalized(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def ensure_default_organization(db: Session) -> models.Organization:
    org = db.scalar(select(models.Organization).where(models.Organization.slug == "demo"))
    if org is None:
        org = models.Organization(name="Cargomatiq Demo", slug="demo")
        db.add(org)
        db.flush()
    return org


def ensure_configured_mailbox(db: Session, organization: models.Organization) -> models.Mailbox | None:
    """Create the single demo mailbox from environment configuration once.

    Credentials are never persisted: only the environment-variable key is
    stored with the mailbox, while the IMAP cursor remains in PostgreSQL.
    """
    if not settings.imap_username:
        return None
    mailbox = db.scalar(
        select(models.Mailbox).where(
            models.Mailbox.organization_id == organization.id,
            models.Mailbox.address == settings.imap_username,
        )
    )
    if mailbox is None:
        mailbox = models.Mailbox(
            organization_id=organization.id,
            address=settings.imap_username,
            host=settings.imap_host,
            port=settings.imap_port,
            folder=settings.imap_folder,
            credential_env_key=settings.imap_credential_env_key,
            active=True,
        )
        db.add(mailbox)
        db.flush()
    return mailbox


def _job_code(job_id: int) -> str:
    return f"SHP-{datetime.utcnow().year}-{job_id:05d}"


def create_job(db: Session, organization_id: int, *, transport_mode: str = "unknown") -> models.ForwardingJob:
    job = models.ForwardingJob(organization_id=organization_id, job_code="pending", transport_mode=transport_mode)
    db.add(job)
    db.flush()
    job.job_code = _job_code(job.id)
    db.add(models.ShipmentEvent(job_id=job.id, event_type="JOB_CREATED", title="Shipment workspace created"))
    return job


def _candidate_jobs(db: Session, organization_id: int, references: list[tuple[str, str]]) -> tuple[list[models.ForwardingJob], dict]:
    matched: dict[int, list[dict]] = {}
    for ref_type, value in references:
        norm = normalized(value)
        if not norm:
            continue
        rows = db.execute(
            select(models.ForwardingJob, models.JobReference)
            .join(models.JobReference, models.JobReference.job_id == models.ForwardingJob.id)
            .where(models.ForwardingJob.organization_id == organization_id)
            .where(models.JobReference.reference_type == ref_type)
            .where(models.JobReference.normalized_value == norm)
        ).all()
        for job, _ref in rows:
            matched.setdefault(job.id, []).append({"type": ref_type, "value": value, "strong": ref_type in STRONG_REFERENCE_TYPES})
    jobs = db.scalars(select(models.ForwardingJob).where(models.ForwardingJob.id.in_(matched.keys()))).all() if matched else []
    return jobs, {str(k): v for k, v in matched.items()}


def resolve_job(db: Session, organization_id: int, references: list[tuple[str, str]]) -> tuple[models.ForwardingJob | None, str, dict]:
    candidates, evidence = _candidate_jobs(db, organization_id, references)
    if len(candidates) == 1:
        candidate_evidence = evidence[str(candidates[0].id)]
        return candidates[0], "auto_matched", {"candidates": evidence, "reason": "exact_reference", "evidence": candidate_evidence}
    if len(candidates) > 1:
        strong = [job for job in candidates if any(item["strong"] for item in evidence[str(job.id)])]
        if len(strong) == 1:
            return strong[0], "auto_matched", {"candidates": evidence, "reason": "unique_strong_reference"}
        return None, "needs_review", {"candidates": evidence, "reason": "ambiguous_references"}
    if references:
        job = create_job(db, organization_id)
        return job, "new_job", {
            "candidates": {},
            "reason": "no_existing_reference",
            "references": [{"type": ref_type, "value": value} for ref_type, value in references],
        }
    return None, "needs_review", {"candidates": {}, "reason": "no_references_found"}


def _add_reference(db: Session, job: models.ForwardingJob, reference_type: str, value: str, document_id: int | None) -> None:
    norm = normalized(value)
    if not norm:
        return
    existing = db.scalar(select(models.JobReference).where(models.JobReference.job_id == job.id, models.JobReference.reference_type == reference_type, models.JobReference.normalized_value == norm))
    if not existing:
        db.add(models.JobReference(job_id=job.id, reference_type=reference_type, value=value, normalized_value=norm, source_document_id=document_id))


def _link_job_email(db: Session, job: models.ForwardingJob, email: models.EmailMessage) -> None:
    if not db.scalar(select(models.JobEmail).where(models.JobEmail.job_id == job.id, models.JobEmail.email_id == email.id)):
        db.add(models.JobEmail(job_id=job.id, email_id=email.id))


def _link_job_document(db: Session, job: models.ForwardingJob, document: models.Document) -> None:
    if not db.scalar(select(models.JobDocument).where(models.JobDocument.job_id == job.id, models.JobDocument.document_id == document.id)):
        db.add(models.JobDocument(job_id=job.id, document_id=document.id))


def _set_canonical_facts(job: models.ForwardingJob, fields: list[tuple[str, str]]) -> None:
    facts = dict(job.canonical_facts or {})
    for code, value in fields:
        # The canonical projection is current state only. FieldObservation
        # records retain every conflicting source assertion.
        if value:
            facts[code] = value
    job.canonical_facts = facts


def _upsert_exception(db: Session, job: models.ForwardingJob, exception_type: str, title: str, description: str, evidence: list[dict], severity: str = "Medium") -> models.OperationalException:
    row = db.scalar(select(models.OperationalException).where(models.OperationalException.job_id == job.id, models.OperationalException.exception_type == exception_type, models.OperationalException.state != "resolved"))
    if row is None:
        row = models.OperationalException(organization_id=job.organization_id, job_id=job.id, exception_type=exception_type, title=title, description=description, evidence=evidence, severity=severity)
        db.add(row)
        db.flush()
        db.add(models.ShipmentEvent(job_id=job.id, event_type="EXCEPTION_CREATED", title=title, details={"exception_id": row.id, "type": exception_type}))
        db.add(models.OperationalTask(organization_id=job.organization_id, job_id=job.id, exception_id=row.id, title=f"Resolve: {title}", due_at=datetime.utcnow() + timedelta(days=1 if severity == "High" else 3)))
    else:
        row.description = description
        row.evidence = evidence
        row.severity = severity
    return row


def evaluate_rules(db: Session, job: models.ForwardingJob) -> None:
    observations = db.scalars(select(models.FieldObservation).where(models.FieldObservation.job_id == job.id).order_by(models.FieldObservation.observed_at)).all()
    documents = {d.id: d.document_type for d in db.scalars(select(models.Document).join(models.JobDocument, models.JobDocument.document_id == models.Document.id).where(models.JobDocument.job_id == job.id)).all()}
    by_field: dict[str, list[models.FieldObservation]] = {}
    for obs in observations:
        by_field.setdefault(obs.field_code, []).append(obs)

    def differing(field: str, left_type: str, right_type: str):
        left = [o for o in by_field.get(field, []) if documents.get(o.document_id) == left_type]
        right = [o for o in by_field.get(field, []) if documents.get(o.document_id) == right_type]
        if left and right and left[-1].normalized_value != right[-1].normalized_value:
            return [left[-1], right[-1]]
        return []

    conflict = differing("consignee", "commercial_invoice", "draft_bill_of_lading")
    if conflict:
        _upsert_exception(db, job, "CONSIGNEE_MISMATCH", "Consignee mismatch", "Commercial Invoice and Draft Bill of Lading name different consignees.", [{"observation_id": o.id, "value": o.value_json, "document_type": documents.get(o.document_id)} for o in conflict], "High")
    conflict = differing("gross_weight", "commercial_invoice", "packing_list")
    if conflict:
        _upsert_exception(db, job, "WEIGHT_MISMATCH", "Gross-weight mismatch", "Commercial Invoice and Packing List report different gross weights.", [{"observation_id": o.id, "value": o.value_json, "document_type": documents.get(o.document_id)} for o in conflict])
    etd_values = {o.normalized_value for o in by_field.get("etd", []) if o.normalized_value}
    if len(etd_values) > 1:
        _upsert_exception(db, job, "SCHEDULE_CHANGE", "ETD changed", "More than one ETD was observed for this shipment.", [{"observation_id": o.id, "value": o.value_json} for o in by_field["etd"]])
    facts = job.canonical_facts or {}
    etd = facts.get("etd")
    if etd:
        try:
            close_to_departure = datetime.fromisoformat(etd).date() <= (datetime.utcnow() + timedelta(days=2)).date()
        except ValueError:
            close_to_departure = False
        required = {"commercial_invoice", "packing_list"}
        if close_to_departure and not required.issubset(set(documents.values())):
            _upsert_exception(db, job, "MISSING_REQUIRED_DOCUMENT", "Required documents missing", "A departure is near but the Commercial Invoice and Packing List are not both available.", [])


def process_email(db: Session, email: models.EmailMessage) -> models.EmailMessage:
    """Run a queued message to completion. Errors are retained for safe retry."""
    email.processing_status = "processing"
    task = db.scalar(select(models.ProcessingTask).where(models.ProcessingTask.email_id == email.id))
    if task:
        task.status, task.attempts = "processing", task.attempts + 1
    db.flush()
    try:
        documents = db.scalars(select(models.Document).join(models.EmailAttachment, models.EmailAttachment.id == models.Document.attachment_id).where(models.EmailAttachment.email_id == email.id)).all()
        extracted: list[tuple[models.Document, object]] = []
        for document in documents:
            fields = fixture_provider.extract(document_type=document.document_type, filename=document.filename, content=object_storage.read(document.object_key), email_text=email.text_body)
            extraction = models.DocumentExtraction(document_id=document.id, provider=fixture_provider.name, extractor_version=fixture_provider.version, raw_output={"fields": [field.__dict__ for field in fields]})
            db.add(extraction)
            extracted.extend((document, field) for field in fields)
        references = [(REFERENCE_FIELDS[field.field_code], field.value) for _doc, field in extracted if field.field_code in REFERENCE_FIELDS]
        job, resolution, reason = resolve_job(db, email.organization_id, references)
        email.resolution_status, email.resolution_reason = resolution, reason
        if job is None:
            email.processing_status = "needs_review"
        else:
            email.resolved_job_id = job.id
            _link_job_email(db, job, email)
            all_fields = []
            linked_document_ids: set[int] = set()
            added_reference_keys: set[tuple[str, str]] = set()
            for document, field in extracted:
                if document.id not in linked_document_ids:
                    _link_job_document(db, job, document)
                    linked_document_ids.add(document.id)
                db.add(models.FieldObservation(organization_id=job.organization_id, job_id=job.id, document_id=document.id, email_id=email.id, field_code=field.field_code, value_json=field.value, normalized_value=field.normalized_value, unit=field.unit, evidence_text=field.evidence_text, confidence=field.confidence, extractor_version=fixture_provider.version))
                all_fields.append((field.field_code, field.value))
                if field.field_code in REFERENCE_FIELDS:
                    reference_key = (REFERENCE_FIELDS[field.field_code], normalized(field.value))
                    if reference_key not in added_reference_keys:
                        _add_reference(db, job, REFERENCE_FIELDS[field.field_code], field.value, document.id)
                        added_reference_keys.add(reference_key)
            _set_canonical_facts(job, all_fields)
            db.add(models.ShipmentEvent(job_id=job.id, event_type="EMAIL_PROCESSED", title=email.subject or "Email processed", details={"email_id": email.id, "resolution": resolution}, source_email_id=email.id))
            # Rules must see observations from the message currently being
            # processed, not only facts committed by earlier messages.
            db.flush()
            evaluate_rules(db, job)
            email.processing_status = "processed"
        if task:
            task.status, task.error_message = "completed", None
    except Exception as exc:
        email.processing_status, email.error_message = "failed", f"{type(exc).__name__}: {exc}"
        if task:
            task.status, task.error_message = "failed", email.error_message
    return email


def ingest_raw_email(db: Session, raw_email: bytes, *, organization: models.Organization, mailbox_id: int | None = None, source_provider: str = "replay", imap_uid: str | None = None, imap_uidvalidity: str | None = None) -> tuple[models.EmailMessage, bool]:
    digest = hashlib.sha256(raw_email).hexdigest()
    existing = db.scalar(select(models.EmailMessage).where(models.EmailMessage.organization_id == organization.id, models.EmailMessage.raw_sha256 == digest))
    if existing:
        return existing, False
    fields, plain, html, attachments = parse_email(raw_email)
    raw_key = object_storage.put(raw_email, namespace=f"organizations/{organization.id}/emails", filename=f"{uuid4().hex}.eml")
    html_key = object_storage.put(html.encode(), namespace=f"organizations/{organization.id}/email-html", filename=f"{uuid4().hex}.html") if html else None
    email = models.EmailMessage(organization_id=organization.id, mailbox_id=mailbox_id, rfc_message_id=fields["rfc_message_id"], raw_sha256=digest, source_provider=source_provider, imap_uid=imap_uid, imap_uidvalidity=imap_uidvalidity, sender=fields["sender"], recipients=fields["recipients"], subject=fields["subject"], received_at=fields["received_at"], text_body=clean_body_text(plain), html_object_key=html_key, raw_object_key=raw_key)
    db.add(email)
    db.flush()
    for attachment in attachments:
        filename = attachment.filename or "attachment.bin"
        key = object_storage.put(attachment.content, namespace=f"organizations/{organization.id}/attachments", filename=filename)
        hash_ = hashlib.sha256(attachment.content).hexdigest()
        record = models.EmailAttachment(email_id=email.id, filename=filename, mime_type=attachment.mime_type, sha256=hash_, object_key=key)
        db.add(record)
        db.flush()
        db.add(models.Document(organization_id=organization.id, attachment_id=record.id, document_type=classify_document(filename, fields["subject"] or ""), filename=filename, mime_type=attachment.mime_type, object_key=key, sha256=hash_))
    db.add(models.ProcessingTask(email_id=email.id))
    db.flush()
    process_email(db, email)
    db.commit()
    db.refresh(email)
    return email, True


def process_queued_tasks(db: Session, *, limit: int = 20) -> int:
    tasks = db.scalars(select(models.ProcessingTask).where(models.ProcessingTask.status.in_(["queued", "failed"])).order_by(models.ProcessingTask.created_at).limit(limit)).all()
    for task in tasks:
        email = db.get(models.EmailMessage, task.email_id)
        if email:
            process_email(db, email)
    db.commit()
    return len(tasks)
