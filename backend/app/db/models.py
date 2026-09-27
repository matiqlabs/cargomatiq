from datetime import datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization: Mapped[str] = mapped_column(String, unique=True, index=True)
    country: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    credit_days: Mapped[int] = mapped_column(Integer, default=0)
    gl_group: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class LogisysSnapshot(Base):
    __tablename__ = "logisys_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    storage_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    lines: Mapped[list["LogisysLine"]] = relationship(
        back_populates="snapshot", cascade="all, delete-orphan"
    )


class LogisysLine(Base):
    __tablename__ = "logisys_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("logisys_snapshots.id", ondelete="CASCADE"), index=True
    )
    organization: Mapped[str] = mapped_column(String, index=True)
    txn_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    transaction_no: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    vendor_invoice_no: Mapped[Optional[str]] = mapped_column(String, index=True)
    vendor_invoice_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    document_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    bucket_1_15: Mapped[float] = mapped_column(Numeric(18, 2), default=0.0)
    bucket_16_30: Mapped[float] = mapped_column(Numeric(18, 2), default=0.0)
    bucket_31_45: Mapped[float] = mapped_column(Numeric(18, 2), default=0.0)
    bucket_46_60: Mapped[float] = mapped_column(Numeric(18, 2), default=0.0)
    bucket_61_90: Mapped[float] = mapped_column(Numeric(18, 2), default=0.0)
    bucket_over_90: Mapped[float] = mapped_column(Numeric(18, 2), default=0.0)
    outstanding: Mapped[float] = mapped_column(Numeric(18, 2), default=0.0)
    norm_invno: Mapped[Optional[str]] = mapped_column(String, index=True)

    snapshot: Mapped[LogisysSnapshot] = relationship(back_populates="lines")


class BTSnapshot(Base):
    __tablename__ = "bt_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    storage_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    lines: Mapped[list["BTLine"]] = relationship(
        back_populates="snapshot", cascade="all, delete-orphan"
    )


class BTLine(Base):
    __tablename__ = "bt_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("bt_snapshots.id", ondelete="CASCADE"), index=True
    )
    bt_label: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    request_sent_to: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email_subject: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    vendor: Mapped[Optional[str]] = mapped_column(String, index=True)
    vendor_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    invoice_number: Mapped[Optional[str]] = mapped_column(String, index=True)
    invoice_total: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    accrued_total: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    job_numbers: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    charge_codes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    invoice_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    invoice_due_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    invoice_received_on: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    request_sent_on: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    labels: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    link_to_item: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    bt_invoice_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    norm_invno: Mapped[Optional[str]] = mapped_column(String, index=True)

    snapshot: Mapped[BTSnapshot] = relationship(back_populates="lines")


class UploadedSOA(Base):
    __tablename__ = "uploaded_soas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("recon_jobs.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String)
    storage_path: Mapped[str] = mapped_column(String)
    raw_headers: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    raw_preview: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    mapping: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    canonical_rows: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    # Human-in-the-loop review fields
    reviewed_rows: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    review_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ReconJob(Base):
    __tablename__ = "recon_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"))
    logisys_snapshot_id: Mapped[int] = mapped_column(ForeignKey("logisys_snapshots.id"))
    bt_snapshot_id: Mapped[int] = mapped_column(ForeignKey("bt_snapshots.id"))
    status: Mapped[str] = mapped_column(String, default="draft")
    residual: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    closed: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    summary: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    vendor: Mapped[Vendor] = relationship()
    logisys_snapshot: Mapped[LogisysSnapshot] = relationship()
    bt_snapshot: Mapped[BTSnapshot] = relationship()
    soa: Mapped[Optional[UploadedSOA]] = relationship(
        "UploadedSOA",
        uselist=False,
        cascade="all, delete-orphan",
        primaryjoin="ReconJob.id==UploadedSOA.job_id",
    )
    results: Mapped[list["ReconLineResult"]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )


class ReconLineResult(Base):
    __tablename__ = "recon_line_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(
        ForeignKey("recon_jobs.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String, index=True)
    match_method: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    vendor_inv_no: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    vendor_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    vendor_amount: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    vendor_currency: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    vendor_age_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ajww_inv_no: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ajww_txn_no: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ajww_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ajww_amount: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    diff: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    bt_label: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    bt_labels: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    bt_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bt_link: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    bt_owner: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    exception_state: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    exception_owner: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    exception_priority: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    exception_due_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    exception_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    exception_resolution: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    job: Mapped[ReconJob] = relationship(back_populates="results")


class VendorMappingCache(Base):
    __tablename__ = "vendor_mapping_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True)
    header_signature: Mapped[str] = mapped_column(String, index=True)
    mapping: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# Operational core ---------------------------------------------------------
# The finance tables above intentionally remain intact.  The models below use
# ``ForwardingJob`` as the stable operational root; the product calls it a
# Shipment in the UI.  Typed child records let ocean, air and road movements
# share one model without encoding a company-specific workflow.


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Mailbox(Base):
    __tablename__ = "mailboxes"
    __table_args__ = (UniqueConstraint("organization_id", "address", name="uq_mailbox_address"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    address: Mapped[str] = mapped_column(String, index=True)
    provider: Mapped[str] = mapped_column(String, default="imap")
    host: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    port: Mapped[int] = mapped_column(Integer, default=993)
    folder: Mapped[str] = mapped_column(String, default="INBOX")
    uid_validity: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_uid: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    credential_env_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ForwardingJob(Base):
    __tablename__ = "forwarding_jobs"
    __table_args__ = (UniqueConstraint("organization_id", "job_code", name="uq_job_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    job_code: Mapped[str] = mapped_column(String, index=True)
    transport_mode: Mapped[str] = mapped_column(String, default="unknown")
    direction: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="open", index=True)
    canonical_facts: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class JobParty(Base):
    __tablename__ = "job_parties"
    __table_args__ = (UniqueConstraint("job_id", "role_type", "name", name="uq_job_party_role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("forwarding_jobs.id", ondelete="CASCADE"), index=True)
    role_type: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    normalized_name: Mapped[str] = mapped_column(String, index=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class JobReference(Base):
    __tablename__ = "job_references"
    __table_args__ = (UniqueConstraint("job_id", "reference_type", "normalized_value", name="uq_job_reference"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("forwarding_jobs.id", ondelete="CASCADE"), index=True)
    reference_type: Mapped[str] = mapped_column(String, index=True)
    value: Mapped[str] = mapped_column(String)
    normalized_value: Mapped[str] = mapped_column(String, index=True)
    source_document_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TransportBooking(Base):
    __tablename__ = "transport_bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("forwarding_jobs.id", ondelete="CASCADE"), index=True)
    booking_number: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    carrier_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mode: Mapped[str] = mapped_column(String, default="unknown")
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class TransportUnit(Base):
    __tablename__ = "transport_units"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("forwarding_jobs.id", ondelete="CASCADE"), index=True)
    unit_type: Mapped[str] = mapped_column(String, default="container")
    identifier: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class RouteLeg(Base):
    __tablename__ = "route_legs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("forwarding_jobs.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int] = mapped_column(Integer, default=1)
    mode: Mapped[str] = mapped_column(String, default="unknown")
    origin: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    destination: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    carrier_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class JobMilestone(Base):
    __tablename__ = "job_milestones"
    __table_args__ = (UniqueConstraint("job_id", "milestone_type", name="uq_job_milestone_type"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("forwarding_jobs.id", ondelete="CASCADE"), index=True)
    milestone_type: Mapped[str] = mapped_column(String, index=True)
    planned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    estimated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    actual_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending")


class EmailMessage(Base):
    __tablename__ = "email_messages"
    __table_args__ = (
        UniqueConstraint("mailbox_id", "imap_uidvalidity", "imap_uid", name="uq_mailbox_imap_uid"),
        UniqueConstraint("organization_id", "raw_sha256", name="uq_org_raw_email"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    mailbox_id: Mapped[Optional[int]] = mapped_column(ForeignKey("mailboxes.id"), nullable=True, index=True)
    rfc_message_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    raw_sha256: Mapped[str] = mapped_column(String, index=True)
    source_provider: Mapped[str] = mapped_column(String, default="replay")
    imap_uid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    imap_uidvalidity: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sender: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    recipients: Mapped[list] = mapped_column(JSON, default=list)
    subject: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    text_body: Mapped[str] = mapped_column(Text, default="")
    html_object_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    raw_object_key: Mapped[str] = mapped_column(String)
    processing_status: Mapped[str] = mapped_column(String, default="received", index=True)
    resolution_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    resolved_job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("forwarding_jobs.id"), nullable=True, index=True)
    resolution_reason: Mapped[dict] = mapped_column(JSON, default=dict)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class EmailAttachment(Base):
    __tablename__ = "email_attachments"
    __table_args__ = (UniqueConstraint("email_id", "sha256", name="uq_email_attachment_hash"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email_id: Mapped[int] = mapped_column(ForeignKey("email_messages.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String)
    mime_type: Mapped[str] = mapped_column(String)
    sha256: Mapped[str] = mapped_column(String, index=True)
    object_key: Mapped[str] = mapped_column(String)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    attachment_id: Mapped[Optional[int]] = mapped_column(ForeignKey("email_attachments.id"), nullable=True, unique=True)
    document_type: Mapped[str] = mapped_column(String, default="unknown", index=True)
    filename: Mapped[str] = mapped_column(String)
    mime_type: Mapped[str] = mapped_column(String)
    object_key: Mapped[str] = mapped_column(String)
    sha256: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, default="classified")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DocumentExtraction(Base):
    __tablename__ = "document_extractions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String, default="fixture")
    extractor_version: Mapped[str] = mapped_column(String, default="v1")
    raw_output: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FieldObservation(Base):
    __tablename__ = "field_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("forwarding_jobs.id", ondelete="SET NULL"), nullable=True, index=True)
    document_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True)
    email_id: Mapped[Optional[int]] = mapped_column(ForeignKey("email_messages.id", ondelete="SET NULL"), nullable=True, index=True)
    field_code: Mapped[str] = mapped_column(String, index=True)
    value_json: Mapped[object] = mapped_column(JSON)
    normalized_value: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    unit: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    evidence_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    page_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    extractor_version: Mapped[str] = mapped_column(String, default="v1")
    observed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class JobEmail(Base):
    __tablename__ = "job_emails"
    __table_args__ = (UniqueConstraint("job_id", "email_id", name="uq_job_email"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("forwarding_jobs.id", ondelete="CASCADE"), index=True)
    email_id: Mapped[int] = mapped_column(ForeignKey("email_messages.id", ondelete="CASCADE"), index=True)


class JobDocument(Base):
    __tablename__ = "job_documents"
    __table_args__ = (UniqueConstraint("job_id", "document_id", name="uq_job_document"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("forwarding_jobs.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)


class ShipmentEvent(Base):
    __tablename__ = "shipment_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("forwarding_jobs.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String, index=True)
    title: Mapped[str] = mapped_column(String)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    source_email_id: Mapped[Optional[int]] = mapped_column(ForeignKey("email_messages.id"), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class OperationalException(Base):
    __tablename__ = "operational_exceptions"
    __table_args__ = (UniqueConstraint("job_id", "exception_type", "state", name="uq_active_job_exception"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("forwarding_jobs.id", ondelete="SET NULL"), nullable=True, index=True)
    finance_recon_line_id: Mapped[Optional[int]] = mapped_column(ForeignKey("recon_line_results.id", ondelete="SET NULL"), nullable=True, index=True)
    exception_type: Mapped[str] = mapped_column(String, index=True)
    severity: Mapped[str] = mapped_column(String, default="Medium")
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text, default="")
    evidence: Mapped[list] = mapped_column(JSON, default=list)
    state: Mapped[str] = mapped_column(String, default="open", index=True)
    owner: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolution: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OperationalTask(Base):
    __tablename__ = "operational_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("forwarding_jobs.id", ondelete="SET NULL"), nullable=True, index=True)
    exception_id: Mapped[Optional[int]] = mapped_column(ForeignKey("operational_exceptions.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String)
    state: Mapped[str] = mapped_column(String, default="open", index=True)
    owner: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProcessingTask(Base):
    __tablename__ = "processing_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email_id: Mapped[int] = mapped_column(ForeignKey("email_messages.id", ondelete="CASCADE"), unique=True, index=True)
    status: Mapped[str] = mapped_column(String, default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
