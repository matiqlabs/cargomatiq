"""Document classification and provider-neutral extraction contracts."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol


DOCUMENT_TYPES = {
    "commercial_invoice", "packing_list", "booking_confirmation", "bill_of_lading",
    "draft_bill_of_lading", "air_waybill", "road_consignment_note", "unknown",
}


def classify_document(filename: str, subject: str = "") -> str:
    value = f"{filename} {subject}".lower()
    if "packing" in value:
        return "packing_list"
    if "commercial" in value and "invoice" in value or "invoice" in value:
        return "commercial_invoice"
    if "draft" in value and ("bill" in value or "bl" in value):
        return "draft_bill_of_lading"
    if "bill of lading" in value or re.search(r"\bbl\b", value):
        return "bill_of_lading"
    if "booking" in value or "confirmation" in value:
        return "booking_confirmation"
    if "awb" in value or "air waybill" in value:
        return "air_waybill"
    if "cmr" in value or "consignment" in value:
        return "road_consignment_note"
    return "unknown"


@dataclass(frozen=True)
class ExtractedField:
    field_code: str
    value: str
    normalized_value: str
    evidence_text: str
    confidence: float = 0.9
    unit: str | None = None


class DocumentExtractionProvider(Protocol):
    name: str
    version: str

    def extract(self, *, document_type: str, filename: str, content: bytes, email_text: str) -> list[ExtractedField]: ...


class FixtureExtractionProvider:
    """Deterministic fallback for replay fixtures until a model provider is selected."""

    name = "fixture"
    version = "v1"
    patterns = {
        "booking_number": r"(?:booking(?:\s*(?:no|number))?\s*[:#-]?\s*)([A-Z]{2,8}[- ]?\d{3,})",
        "bl_number": r"(?:\b(?:mbl|hbl|bl|bill of lading)(?:\s*(?:no|number))?\s*[:#-]?\s*)([A-Z]{2,8}[- ]?\d{3,})",
        "container_number": r"\b([A-Z]{4}\d{7})\b",
        "po_number": r"\b(PO[- ]?\d{3,})\b",
        "invoice_number": r"\b(INV[- ]?\d{3,})\b",
        "etd": r"\bETD\s*[:#-]?\s*(\d{4}-\d{2}-\d{2})",
        "eta": r"\bETA\s*[:#-]?\s*(\d{4}-\d{2}-\d{2})",
        "gross_weight": r"(?:gross\s*weight|weight)\s*[:#-]?\s*([\d,.]+)\s*(kg|kgs|kilograms?)?",
        "consignee": r"consignee\s*[:#-]?\s*([^\n\r]{2,80})",
        "shipper": r"shipper\s*[:#-]?\s*([^\n\r]{2,80})",
        "pol": r"\bPOL\s*[:#-]?\s*([^\n\r]{2,80})",
        "pod": r"\bPOD\s*[:#-]?\s*([^\n\r]{2,80})",
    }

    def extract(self, *, document_type: str, filename: str, content: bytes, email_text: str) -> list[ExtractedField]:
        text = f"{email_text}\n{filename}\n{content.decode('utf-8', errors='ignore')}"
        fields: list[ExtractedField] = []
        for code, pattern in self.patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if not match:
                continue
            value = match.group(1).strip().rstrip(".,;")
            unit = match.group(2).upper() if code == "gross_weight" and match.lastindex and match.lastindex > 1 and match.group(2) else None
            fields.append(ExtractedField(code, value, re.sub(r"[^A-Z0-9]", "", value.upper()), match.group(0).strip(), unit=unit))
        return fields


fixture_provider = FixtureExtractionProvider()
