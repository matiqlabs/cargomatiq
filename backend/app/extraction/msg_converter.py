from __future__ import annotations

import csv
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from html import unescape
from io import BytesIO
from pathlib import Path
from typing import Iterable

import extract_msg
import pdfplumber
from bs4 import BeautifulSoup
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Border, Font, PatternFill, Side

log = logging.getLogger(__name__)


class MsgConversionError(Exception):
    """Raised when a .msg file cannot be converted into a worksheet."""


@dataclass
class ExtractedTable:
    headers: list[str]
    rows: list[list[str]]


@dataclass
class CanonicalRow:
    invoice_number: str
    invoice_date: str
    outstanding_amount: str


@dataclass
class ExtractionResult:
    rows: list[CanonicalRow]
    source_type: str
    source_name: str
    source_details: str
    vendor_hint: str = ""
    output_path: Path | None = None


CANONICAL_HEADERS = ["INV Number", "INV Date", "Outstanding Amount"]
SUPPORTED_EXCEL_SUFFIXES = {".xlsx", ".xlsm", ".csv"}
HEADER_FILL = PatternFill("solid", fgColor="1F2937")
HEADER_FONT = Font(color="FFFFFF", bold=True)
THIN_BORDER = Border(
    left=Side(style="thin", color="D1D5DB"),
    right=Side(style="thin", color="D1D5DB"),
    top=Side(style="thin", color="D1D5DB"),
    bottom=Side(style="thin", color="D1D5DB"),
)
INVOICE_NUMBER_ALIASES = (
    "invoice number",
    "invoice no",
    "invoice #",
    "invoice",
    "inv number",
    "inv no",
    "inv #",
    "inv#",
    "document no",
    "document number",
    "num",
    "number",
    "ref no",
    "reference no",
)
INVOICE_DATE_ALIASES = (
    "invoice date",
    "inv date",
    "date",
    "bill date",
    "txn date",
    "transaction date",
)
AMOUNT_ALIASES = (
    "outstanding amount",
    "outstanding",
    "open balance",
    "balance due",
    "balance",
    "amount due",
    "total due",
    "amount",
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def convert_msg_to_excel(msg_path: str | Path, output_dir: str | Path | None = None) -> Path:
    result = extract_msg_to_rows(msg_path)
    output_path = next_available_output_path(Path(msg_path), output_dir=output_dir)
    write_rows_to_workbook(result.rows, output_path)
    result.output_path = output_path
    return output_path


def extract_msg_to_rows(msg_path: str | Path) -> ExtractionResult:
    msg_file = Path(msg_path).expanduser().resolve()
    validate_msg_path(msg_file)
    message = open_message(msg_file)
    try:
        vendor_hint = extract_vendor_hint(message)

        extractors = (
            extract_rows_from_excel_attachments,
            extract_rows_from_pdf_attachments,
            extract_rows_from_message_body,
        )
        for extractor in extractors:
            result = extractor(message)
            if result.rows:
                result.vendor_hint = vendor_hint
                return result
    finally:
        # Close the file handle so Windows can delete the temp .msg file afterwards.
        try:
            message.close()
        except Exception:
            pass

    raise MsgConversionError(
        "No usable invoice details were found in the email body or supported attachments."
    )


def workbook_bytes_from_msg(msg_path: str | Path) -> tuple[ExtractionResult, bytes]:
    result = extract_msg_to_rows(msg_path)
    return result, workbook_bytes_from_rows(result.rows)


def workbook_bytes_from_rows(rows: list[CanonicalRow]) -> bytes:
    workbook = build_workbook(rows)
    buffer = BytesIO()
    workbook.save(buffer)
    workbook.close()
    return buffer.getvalue()


def rows_to_dicts(rows: list[CanonicalRow]) -> list[dict[str, str]]:
    return [
        {
            "invoice_number": row.invoice_number,
            "invoice_date": row.invoice_date,
            "outstanding_amount": row.outstanding_amount,
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Vendor hint
# ---------------------------------------------------------------------------

def extract_vendor_hint(message) -> str:
    sender = str(getattr(message, "sender", "") or "")
    display_match = re.match(r"^([^<@\n]+)", sender)
    if display_match:
        name = display_match.group(1).strip().rstrip("<").strip()
        if name and "@" not in name and len(name) > 2:
            return name
    return str(getattr(message, "subject", "") or "")[:80]


# ---------------------------------------------------------------------------
# Validation / message opening
# ---------------------------------------------------------------------------

def validate_msg_path(msg_path: Path) -> None:
    if not msg_path.exists():
        raise MsgConversionError(f"File not found: {msg_path}")
    if msg_path.suffix.lower() != ".msg":
        raise MsgConversionError("Only .msg files are supported.")


def open_message(msg_path: Path):
    try:
        return extract_msg.Message(str(msg_path))
    except Exception as exc:
        raise MsgConversionError(f"Unable to open .msg file: {exc}") from exc


# ---------------------------------------------------------------------------
# Source extractors
# ---------------------------------------------------------------------------

def extract_rows_from_message_body(message) -> ExtractionResult:
    html_body = getattr(message, "htmlBody", None)
    if not html_body:
        return empty_result("body", "email_body", "Email did not contain an HTML body.")

    html_str = (
        html_body.decode("utf-8", errors="replace")
        if isinstance(html_body, bytes)
        else html_body
    )
    current_html = extract_current_email_html(html_str)

    best_rows: list[CanonicalRow] = []
    best_name = "html_table"
    for index, table in enumerate(extract_html_tables(current_html), start=1):
        rows = canonicalize_table(table)
        if len(rows) > len(best_rows):
            best_rows = rows
            best_name = f"html_table_{index}"

    if not best_rows:
        return empty_result(
            "body",
            "email_body",
            "Email body contained HTML but no table mapped to invoice/date/amount.",
        )
    return ExtractionResult(
        rows=best_rows,
        source_type="body",
        source_name=best_name,
        source_details="Extracted from the largest usable HTML table in the current email body.",
    )


def extract_current_email_html(html: str) -> str:
    pattern = re.compile(
        r'<div[^>]+id\s*=\s*["\'](?:x_)*divRplyFwdMsg["\']', re.IGNORECASE
    )
    match = pattern.search(html)
    if match:
        return html[: match.start()]
    return html


def extract_rows_from_excel_attachments(message) -> ExtractionResult:
    best_rows: list[CanonicalRow] = []
    best_name = ""
    best_details = ""
    best_score: float = float("-inf")

    for attachment in getattr(message, "attachments", []) or []:
        filename = get_attachment_filename(attachment)
        suffix = Path(filename).suffix.lower()
        if suffix not in SUPPORTED_EXCEL_SUFFIXES:
            continue

        file_bytes = getattr(attachment, "data", None)
        if not isinstance(file_bytes, (bytes, bytearray)) or not file_bytes:
            continue

        try:
            if suffix in {".xlsx", ".xlsm"}:
                rows, detail, score = _extract_excel_scored(bytes(file_bytes))
            else:
                rows, detail = extract_rows_from_csv_bytes(bytes(file_bytes))
                score = float(len(rows))
        except Exception as exc:
            log.warning("Failed to extract rows from Excel attachment %s: %s", filename, exc)
            continue

        if score > best_score:
            best_score = score
            best_rows = rows
            best_name = filename
            best_details = detail

    if not best_rows:
        return empty_result(
            "excel_attachment",
            "attachment_scan",
            "No supported Excel attachment produced mapped invoice rows.",
        )
    return ExtractionResult(
        rows=best_rows,
        source_type="excel_attachment",
        source_name=best_name,
        source_details=best_details,
    )


def extract_rows_from_pdf_attachments(message) -> ExtractionResult:
    best_rows: list[CanonicalRow] = []
    best_name = ""
    best_details = ""

    for attachment in getattr(message, "attachments", []) or []:
        filename = get_attachment_filename(attachment)
        if not filename.lower().endswith(".pdf"):
            continue

        pdf_bytes = getattr(attachment, "data", None)
        if not isinstance(pdf_bytes, (bytes, bytearray)) or not pdf_bytes:
            continue

        try:
            rows, detail = extract_rows_from_pdf_bytes(bytes(pdf_bytes))
        except Exception as exc:
            log.warning("Failed to extract rows from PDF attachment %s: %s", filename, exc)
            continue

        if len(rows) > len(best_rows):
            best_rows = rows
            best_name = filename
            best_details = detail

    if not best_rows:
        return empty_result(
            "pdf_attachment",
            "attachment_scan",
            "No PDF attachment produced mapped invoice rows.",
        )
    return ExtractionResult(
        rows=best_rows,
        source_type="pdf_attachment",
        source_name=best_name,
        source_details=best_details,
    )


def empty_result(source_type: str, source_name: str, source_details: str) -> ExtractionResult:
    return ExtractionResult(
        rows=[],
        source_type=source_type,
        source_name=source_name,
        source_details=source_details,
    )


# ---------------------------------------------------------------------------
# Attachment helpers
# ---------------------------------------------------------------------------

def get_attachment_filename(attachment) -> str:
    for attr in ("longFilename", "shortFilename", "displayName", "name"):
        value = getattr(attachment, attr, None)
        if value:
            return str(value)
    try:
        return str(attachment.getFilename())
    except Exception:
        return "attachment"


# ---------------------------------------------------------------------------
# HTML parsing
# ---------------------------------------------------------------------------

def extract_html_tables(html_body: bytes | str) -> list[ExtractedTable]:
    soup = BeautifulSoup(html_body, "html.parser")
    parsed_tables: list[ExtractedTable] = []
    for table in soup.find_all("table"):
        parsed = parse_html_table(table)
        if parsed and parsed.rows:
            parsed_tables.append(parsed)
    return parsed_tables


# ---------------------------------------------------------------------------
# PDF extraction
# ---------------------------------------------------------------------------

def extract_rows_from_pdf_bytes(pdf_bytes: bytes) -> tuple[list[CanonicalRow], str]:
    best_rows: list[CanonicalRow] = []
    best_details = "No usable PDF rows found."
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            for table_index, raw_table in enumerate(page.extract_tables() or [], start=1):
                table = extracted_table_from_matrix(raw_table)
                rows = canonicalize_table(table)
                if len(rows) > len(best_rows):
                    best_rows = rows
                    best_details = (
                        f"PDF table extraction from page {page_number}, table {table_index}."
                    )

            words = page.extract_words(x_tolerance=5, y_tolerance=5) or []
            rows = extract_rows_from_pdf_words(words)
            if len(rows) > len(best_rows):
                best_rows = rows
                best_details = f"PDF word-level extraction from page {page_number}."

    return best_rows, best_details


def extract_rows_from_pdf_words(words: list[dict]) -> list[CanonicalRow]:
    if not words:
        return []
    from collections import defaultdict

    lines_by_y: dict[int, list[dict]] = defaultdict(list)
    for word in words:
        y_bucket = int(word["top"] / 3) * 3
        lines_by_y[y_bucket].append(word)

    rows = []
    for y in sorted(lines_by_y):
        line_words = sorted(lines_by_y[y], key=lambda w: w["x0"])
        line_text = " ".join(w["text"] for w in line_words)
        cleaned = clean_cell_text(line_text)
        if not cleaned:
            continue

        date_match = re.search(
            r"\b(?:\d{1,2}/\d{1,2}/\d{2,4}|\d{4}-\d{2}-\d{2})\b", cleaned
        )
        amount_matches = re.findall(r"\$?\d[\d,]*\.\d{2}\b", cleaned)
        invoice_number = invoice_number_from_text_line(
            cleaned, date_match.group(0) if date_match else ""
        )

        if not date_match or not amount_matches or not invoice_number:
            continue

        rows.append(
            CanonicalRow(
                invoice_number=normalize_invoice_number(invoice_number),
                invoice_date=normalize_date(date_match.group(0)),
                outstanding_amount=normalize_amount(amount_matches[-1]),
            )
        )

    return dedupe_canonical_rows(
        [r for r in rows if r.invoice_number and r.outstanding_amount]
    )


# ---------------------------------------------------------------------------
# Excel / CSV extraction
# ---------------------------------------------------------------------------

def extract_rows_from_excel_bytes(file_bytes: bytes) -> tuple[list[CanonicalRow], str]:
    rows, detail, _ = _extract_excel_scored(file_bytes)
    return rows, detail


def _extract_excel_scored(
    file_bytes: bytes,
) -> tuple[list[CanonicalRow], str, float]:
    workbook = load_workbook(BytesIO(file_bytes), read_only=True, data_only=True)
    best_rows: list[CanonicalRow] = []
    best_details = "No usable worksheet rows found."
    best_score: float = float("-inf")
    try:
        for sheet_name in workbook.sheetnames:
            worksheet = workbook[sheet_name]
            matrix: list[list[str]] = []
            for row in worksheet.iter_rows(values_only=True):
                cleaned = [clean_cell_text(value) for value in row]
                if any(cell for cell in cleaned):
                    matrix.append(cleaned)
            table = extracted_table_from_matrix(matrix)
            rows = canonicalize_table(table)
            score = float(score_excel_sheet_candidate(sheet_name, table, rows))
            if score > best_score:
                best_score = score
                best_rows = rows
                best_details = (
                    f"Excel attachment extraction from worksheet '{sheet_name}'."
                )
    finally:
        workbook.close()
    return best_rows, best_details, best_score


def extract_rows_from_csv_bytes(file_bytes: bytes) -> tuple[list[CanonicalRow], str]:
    text = decode_text_bytes(file_bytes)
    reader = csv.reader(text.splitlines())
    matrix: list[list[str]] = []
    for row in reader:
        cleaned = [clean_cell_text(value) for value in row]
        if any(cell for cell in cleaned):
            matrix.append(cleaned)
    table = extracted_table_from_matrix(matrix)
    return canonicalize_table(table), "CSV attachment extraction."


def decode_text_bytes(file_bytes: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return file_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return file_bytes.decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Table building / parsing
# ---------------------------------------------------------------------------

def canonicalize_table(table: ExtractedTable | None) -> list[CanonicalRow]:
    if table is None:
        return []
    mapping = resolve_canonical_mapping(table.headers)
    if mapping.get("invoice_number") is None or mapping.get("outstanding_amount") is None:
        return []

    results: list[CanonicalRow] = []
    for row in table.rows:
        invoice_number = normalize_invoice_number(
            get_row_value(row, mapping.get("invoice_number"))
        )
        invoice_date = normalize_date(get_row_value(row, mapping.get("invoice_date")))
        outstanding_amount = normalize_amount(
            get_row_value(row, mapping.get("outstanding_amount"))
        )

        if not invoice_number or not outstanding_amount:
            continue

        results.append(
            CanonicalRow(
                invoice_number=invoice_number,
                invoice_date=invoice_date,
                outstanding_amount=outstanding_amount,
            )
        )
    return dedupe_canonical_rows(results)


def extracted_table_from_matrix(
    raw_table: list[list[str | None]],
) -> ExtractedTable | None:
    normalized = []
    for row in raw_table:
        cleaned = [clean_cell_text(cell) for cell in row]
        if any(cell for cell in cleaned):
            normalized.append(cleaned)

    if len(normalized) < 2:
        return None

    width = max(len(row) for row in normalized)
    normalized_rows = [pad_row(row, width) for row in normalized]
    header_index = find_header_row(normalized_rows)
    if header_index is None or header_index == len(normalized_rows) - 1:
        return None

    headers = dedupe_headers(normalized_rows[header_index])
    rows = [
        row
        for row in normalized_rows[header_index + 1:]
        if any(cell.strip() for cell in row)
    ]
    if not rows:
        return None
    return ExtractedTable(headers=headers, rows=rows)


def parse_html_table(table) -> ExtractedTable | None:
    grid: list[list[str]] = []
    span_map: dict[tuple[int, int], str] = {}
    row_index = 0

    for tr in table.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        if not cells:
            continue

        row: list[str] = []
        col_index = 0

        while (row_index, col_index) in span_map:
            row.append(span_map.pop((row_index, col_index)))
            col_index += 1

        for cell in cells:
            while (row_index, col_index) in span_map:
                row.append(span_map.pop((row_index, col_index)))
                col_index += 1

            value = clean_cell_text(cell.get_text(" ", strip=True))
            colspan = parse_span(cell.get("colspan"))
            rowspan = parse_span(cell.get("rowspan"))

            for _ in range(colspan):
                row.append(value)
                if rowspan > 1:
                    for offset in range(1, rowspan):
                        span_map[(row_index + offset, col_index)] = value
                col_index += 1

        while (row_index, col_index) in span_map:
            row.append(span_map.pop((row_index, col_index)))
            col_index += 1

        if any(cell.strip() for cell in row):
            grid.append(row)
        row_index += 1

    if not grid:
        return None

    width = max(len(row) for row in grid)
    normalized_rows = [pad_row(row, width) for row in grid]
    header_index = find_header_row(normalized_rows)
    if header_index is None or header_index == len(normalized_rows) - 1:
        return None

    headers = dedupe_headers(normalized_rows[header_index])
    data_rows = [
        row
        for row in normalized_rows[header_index + 1:]
        if any(cell.strip() for cell in row)
    ]
    if not data_rows:
        return None
    return ExtractedTable(headers=headers, rows=data_rows)


def parse_span(value: str | None) -> int:
    if not value:
        return 1
    try:
        return max(int(value), 1)
    except ValueError:
        return 1


def pad_row(row: list[str], width: int) -> list[str]:
    if len(row) >= width:
        return row[:]
    return row + [""] * (width - len(row))


def find_header_row(rows: list[list[str]]) -> int | None:
    best_index = None
    best_score = -1
    all_aliases = (
        set(INVOICE_NUMBER_ALIASES)
        | set(INVOICE_DATE_ALIASES)
        | set(AMOUNT_ALIASES)
    )

    for idx, row in enumerate(rows[:-1]):
        non_empty = [cell for cell in row if cell.strip()]
        if len(non_empty) < 2:
            continue

        text_like = sum(1 for cell in non_empty if has_letters(cell))
        unique_ratio = len(set(cell.lower() for cell in non_empty)) / max(
            len(non_empty), 1
        )

        normalized_cells = {normalize_header(cell) for cell in non_empty}
        alias_hit = any(normalize_header(a) in normalized_cells for a in all_aliases)
        alias_bonus = 20 if alias_hit else 0

        score = (text_like * 5) + int(unique_ratio * 10) + alias_bonus
        if score > best_score:
            best_score = score
            best_index = idx

    return best_index


def has_letters(value: str) -> bool:
    return any(char.isalpha() for char in value)


def dedupe_headers(headers: Iterable[str]) -> list[str]:
    seen: dict[str, int] = {}
    cleaned_headers: list[str] = []

    for idx, header in enumerate(headers, start=1):
        base = clean_header_name(header, idx)
        count = seen.get(base, 0) + 1
        seen[base] = count
        cleaned_headers.append(base if count == 1 else f"{base}_{count}")

    return cleaned_headers


def clean_header_name(value: str, position: int) -> str:
    cleaned = clean_cell_text(value)
    if not cleaned:
        return f"Column_{position}"
    return re.sub(r"\s+", " ", cleaned).strip()


def score_excel_sheet_candidate(
    sheet_name: str, table: ExtractedTable | None, rows: list[CanonicalRow]
) -> int:
    if not rows:
        return -10_000

    score = len(rows)
    normalized_name = normalize_header(sheet_name)

    if "vendor soa" in normalized_name:
        score += 5_000
    elif (
        normalized_name == "soa"
        or normalized_name.endswith(" soa")
        or normalized_name.startswith("soa ")
    ):
        score += 2_500
    elif "statement" in normalized_name and "account" in normalized_name:
        score += 1_500
    elif "ar aging" in normalized_name or "a r aging" in normalized_name:
        score += 1_000
    elif "aging detail" in normalized_name or "aging report" in normalized_name:
        score += 500

    for noisy_name in ("waiting", "credit term"):
        if noisy_name in normalized_name:
            score -= 2_000

    if "aging" in normalized_name and table is not None:
        normalized_headers = {normalize_header(h) for h in table.headers}
        is_bt_sheet = (
            "bt label" in normalized_headers
            and "request sent to" in normalized_headers
        )
        if is_bt_sheet:
            score -= 2_000

    if table is not None:
        mapping = resolve_canonical_mapping(table.headers)
        invoice_header = (
            normalize_header(table.headers[mapping["invoice_number"]])
            if mapping.get("invoice_number") is not None
            else ""
        )
        date_header = (
            normalize_header(table.headers[mapping["invoice_date"]])
            if mapping.get("invoice_date") is not None
            else ""
        )
        amount_header = (
            normalize_header(table.headers[mapping["outstanding_amount"]])
            if mapping.get("outstanding_amount") is not None
            else ""
        )

        if invoice_header in {
            "inv number", "invoice number", "document number", "num", "number",
        }:
            score += 400
        if date_header in {"inv date", "invoice date", "date", "txn date"}:
            score += 150
        if amount_header in {
            "outstanding amount", "open balance", "amount due", "total due", "amount",
        }:
            score += 250

        normalized_headers = {normalize_header(h) for h in table.headers}
        if "bt label" in normalized_headers and "request sent to" in normalized_headers:
            score -= 3_000

    return score


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

def clean_cell_text(value) -> str:
    if value is None:
        return ""
    text = unescape(str(value)).replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_header(value: str) -> str:
    value = clean_cell_text(value).lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def find_best_header(headers: list[str], aliases: Iterable[str]) -> int | None:
    best_index = None
    best_score = -1
    for index, header in enumerate(headers):
        if not header:
            continue
        for alias in aliases:
            score = score_header_alias(header, alias)
            if score > best_score:
                best_score = score
                best_index = index
    if best_score < 50:
        return None
    return best_index


def score_header_alias(header: str, alias: str) -> int:
    alias_normalized = normalize_header(alias)
    if header == alias_normalized:
        return 100
    if alias_normalized in header or header in alias_normalized:
        return 90

    header_tokens = set(header.split())
    alias_tokens = set(alias_normalized.split())
    if not alias_tokens:
        return 0
    overlap = len(header_tokens & alias_tokens)
    return int((overlap / len(alias_tokens)) * 100)


def get_row_value(row: list[str], index: int | None) -> str:
    if index is None or index >= len(row):
        return ""
    return clean_cell_text(row[index])


def resolve_canonical_mapping(headers: list[str]) -> dict[str, int | None]:
    normalized_headers = [normalize_header(header) for header in headers]
    return {
        "invoice_number": find_best_header(normalized_headers, INVOICE_NUMBER_ALIASES),
        "invoice_date": find_best_header(normalized_headers, INVOICE_DATE_ALIASES),
        "outstanding_amount": find_best_header(normalized_headers, AMOUNT_ALIASES),
    }


def normalize_invoice_number(value: str) -> str:
    value = clean_cell_text(value)
    if not value:
        return ""
    value = re.sub(r"\.0$", "", value)
    return value


def normalize_amount(value: str) -> str:
    value = clean_cell_text(value)
    if not value:
        return ""

    value = re.sub(r"[£€¥₹]", "", value)
    value = re.sub(r"^\((.*)\)$", r"-\1", value.strip()).strip()

    eu_decimal = re.search(r",(\d{2})(?:\D|$)", value)
    us_decimal = re.search(r"\.(\d{2})(?:\D|$)", value)

    if eu_decimal and not us_decimal:
        cleaned = value.replace(".", "").replace(",", ".")
    elif us_decimal:
        cleaned = value.replace(",", "")
    else:
        cleaned = value.replace(",", "")

    match = re.search(r"-?\$?\d+(?:\.\d+)?", cleaned)
    if not match:
        return ""
    number = match.group(0).replace("$", "")
    try:
        return f"{float(number):.2f}"
    except ValueError:
        return ""


def normalize_date(value: str) -> str:
    value = clean_cell_text(value)
    if not value:
        return ""

    try:
        as_int = int(value)
        if 1 <= as_int <= 99999:
            from openpyxl.utils.datetime import from_excel
            return from_excel(as_int).strftime("%Y-%m-%d")
    except (ValueError, TypeError, ImportError):
        pass

    for pattern in (
        "%m/%d/%Y",
        "%m/%d/%y",
        "%Y-%m-%d",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y",
        "%d-%b-%Y",
        "%d-%B-%Y",
        "%d.%m.%Y",
    ):
        try:
            return datetime.strptime(value, pattern).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return value


# ---------------------------------------------------------------------------
# PDF text fallback (line-by-line)
# ---------------------------------------------------------------------------

def extract_rows_from_pdf_text(text: str) -> list[CanonicalRow]:
    rows: list[CanonicalRow] = []
    for line in text.splitlines():
        cleaned = clean_cell_text(line)
        if not cleaned:
            continue
        if "invoice" in cleaned.lower() and "balance" in cleaned.lower():
            continue

        date_match = re.search(
            r"\b(?:\d{1,2}/\d{1,2}/\d{2,4}|\d{4}-\d{2}-\d{2})\b", cleaned
        )
        amount_matches = re.findall(r"\$?\d[\d,]*\.\d{2}\b", cleaned)
        invoice_number = invoice_number_from_text_line(
            cleaned, date_match.group(0) if date_match else ""
        )

        if not date_match or not amount_matches or not invoice_number:
            continue

        rows.append(
            CanonicalRow(
                invoice_number=normalize_invoice_number(invoice_number),
                invoice_date=normalize_date(date_match.group(0)),
                outstanding_amount=normalize_amount(amount_matches[-1]),
            )
        )
    return dedupe_canonical_rows(
        [row for row in rows if row.invoice_number and row.outstanding_amount]
    )


def dedupe_canonical_rows(rows: list[CanonicalRow]) -> list[CanonicalRow]:
    seen: set[tuple[str, str, str]] = set()
    deduped: list[CanonicalRow] = []
    for row in rows:
        key = (row.invoice_number, row.invoice_date, row.outstanding_amount)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def invoice_number_from_text_line(line: str, date_value: str) -> str:
    if not date_value:
        return ""

    prefix = line.split(date_value, 1)[0].strip()
    if not prefix:
        return ""

    tokens = re.findall(r"[A-Z0-9][A-Z0-9\-\/]*", prefix, flags=re.IGNORECASE)
    if not tokens:
        return ""

    preferred = [token for token in tokens if any(char.isdigit() for char in token)]
    if preferred:
        return preferred[-1]
    return tokens[-1]


# ---------------------------------------------------------------------------
# Output path
# ---------------------------------------------------------------------------

def next_available_output_path(
    msg_path: Path, output_dir: str | Path | None = None
) -> Path:
    import uuid
    target_dir = (
        Path(output_dir).expanduser().resolve()
        if output_dir
        else Path(__file__).resolve().parent
    )
    return target_dir / f"{msg_path.stem}_vendor_soa_{uuid.uuid4().hex[:8]}.xlsx"


def write_rows_to_workbook(rows: list[CanonicalRow], output_path: Path) -> None:
    workbook = build_workbook(rows)
    workbook.save(output_path)
    workbook.close()


def build_workbook(rows: list[CanonicalRow]) -> Workbook:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Vendor SOA"

    sheet.append(CANONICAL_HEADERS)
    for row in rows:
        sheet.append([row.invoice_number, row.invoice_date, row.outstanding_amount])

    for cell in sheet[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.border = THIN_BORDER

    for row in sheet.iter_rows(min_row=2):
        for cell in row:
            cell.border = THIN_BORDER

    autosize_columns(sheet)
    return workbook


def autosize_columns(sheet) -> None:
    for column_cells in sheet.columns:
        letter = column_cells[0].column_letter
        width = max(len(str(cell.value or "")) for cell in column_cells)
        sheet.column_dimensions[letter].width = min(max(width + 2, 10), 45)
