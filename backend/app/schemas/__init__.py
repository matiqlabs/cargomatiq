"""Pydantic schemas for the HTTP layer."""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class ExtractionReviewRow(BaseModel):
    id: str
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    amount: Optional[float] = None
    currency: str = "USD"
    due_date: Optional[str] = None
    reference: Optional[str] = None
    description: Optional[str] = None
    confidence: str = "Medium"
    ignored: bool = False
    source: str = "extracted"
    edited: bool = False


class ExtractionReviewOut(BaseModel):
    job_id: int
    vendor_name: str
    vendor_credit_days: int = 0
    soa_filename: Optional[str] = None
    document_source_type: Optional[str] = None
    document_source_name: Optional[str] = None
    document_source_details: Optional[str] = None
    document_download_url: Optional[str] = None
    row_count: int
    rows: list[ExtractionReviewRow]
    review_status: Optional[str] = None


class SaveReviewIn(BaseModel):
    rows: list[ExtractionReviewRow]


class VendorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization: str
    country: Optional[str] = None
    credit_days: int = 0
    gl_group: Optional[str] = None


class MasterUploadResult(BaseModel):
    inserted: int
    updated: int
    total_rows: int


class SnapshotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    uploaded_at: datetime
    row_count: int


class ReconJobBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    vendor_id: int
    logisys_snapshot_id: int
    bt_snapshot_id: int
    status: str
    residual: Optional[float] = None
    closed: Optional[bool] = None
    created_at: datetime
    updated_at: datetime


class CreateJobIn(BaseModel):
    vendor_id: int
    logisys_snapshot_id: int
    bt_snapshot_id: int


class MappingFieldOut(BaseModel):
    header: Optional[str] = None
    score: int = 0
    candidates: list = []


class MappingSuggestOut(BaseModel):
    headers: list
    preview: list
    suggested: dict
    cached: bool = False


class ConfirmMappingIn(BaseModel):
    mapping: dict  # {invoice_no: header, invoice_date: header, amount: header}


class ReconLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    match_method: Optional[str] = None
    vendor_inv_no: Optional[str] = None
    vendor_date: Optional[str] = None
    vendor_amount: Optional[float] = None
    vendor_currency: Optional[str] = None
    vendor_age_days: Optional[int] = None
    ajww_inv_no: Optional[str] = None
    ajww_txn_no: Optional[str] = None
    ajww_date: Optional[str] = None
    ajww_amount: Optional[float] = None
    diff: Optional[float] = None
    bt_label: Optional[str] = None
    bt_labels: Optional[str] = None
    bt_note: Optional[str] = None
    bt_link: Optional[str] = None
    bt_owner: Optional[str] = None


class ReconJobDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    residual: Optional[float] = None
    closed: Optional[bool] = None
    summary: Optional[dict] = None
    vendor: VendorOut
    logisys_snapshot: SnapshotOut
    bt_snapshot: SnapshotOut
    results: list[ReconLineOut] = []
    mapping: Optional[dict] = None
    soa_filename: Optional[str] = None


class ExceptionCaseOut(BaseModel):
    id: int
    job_id: int
    vendor: str
    vendor_country: Optional[str] = None
    status: str
    reason: str
    recommended_action: str
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    currency: Optional[str] = None
    amount: Optional[float] = None
    diff: Optional[float] = None
    books_txn_no: Optional[str] = None
    queue_label: Optional[str] = None
    queue_owner: Optional[str] = None
    queue_link: Optional[str] = None
    age_days: Optional[int] = None
    state: str = "open"
    owner: Optional[str] = None
    priority: str = "Medium"
    due_date: Optional[str] = None
    note: Optional[str] = None
    resolution: Optional[str] = None
    created_at: datetime


class ExceptionSummaryOut(BaseModel):
    total: int = 0
    open: int = 0
    in_progress: int = 0
    waiting_vendor: int = 0
    resolved: int = 0
    high_priority: int = 0
    due_soon: int = 0
    total_amount: float = 0


class ExceptionWorkbenchOut(BaseModel):
    summary: ExceptionSummaryOut
    cases: list[ExceptionCaseOut]


class UpdateExceptionIn(BaseModel):
    state: Optional[str] = None
    owner: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    note: Optional[str] = None
    resolution: Optional[str] = None
