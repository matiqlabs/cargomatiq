from io import BytesIO

from sqlalchemy.orm import Session

from app.db import models
from app.reports.excel_export import autosize, new_workbook, write_body_cell, write_header_row
from app.recon.currency import currency_from_country

BUCKETS = ["0-30", "31-60", "61-90", "90+"]
COLUMNS = ["Vendor", "Country", "Currency"] + BUCKETS + ["Total"]


def _bucket(age: int | None) -> str:
    age = max(0, int(age or 0))
    if age <= 30:
        return "0-30"
    if age <= 60:
        return "31-60"
    if age <= 90:
        return "61-90"
    return "90+"


def build_rows(db: Session) -> list[dict]:
    jobs = db.query(models.ReconJob).filter(models.ReconJob.status == "reconciled").all()
    grouped: dict = {}
    vendor_meta: dict = {}
    for job in jobs:
        v = job.vendor
        for r in job.results:
            if r.status not in ("ok_to_pay", "not_due", "pending_in_bt", "amount_dispute"):
                continue
            currency = r.vendor_currency or currency_from_country(v.country)
            key = (v.organization, currency)
            vendor_meta[key] = {"country": v.country or "", "currency": currency}
            amt = r.vendor_amount or 0.0
            b = _bucket(r.vendor_age_days)
            grouped.setdefault(key, {x: 0.0 for x in BUCKETS})
            grouped[key][b] += amt

    rows = []
    for vendor, currency in sorted(grouped):
        meta = vendor_meta[(vendor, currency)]
        buckets = grouped[(vendor, currency)]
        rows.append({
            "Vendor": vendor,
            "Country": meta["country"],
            "Currency": meta["currency"],
            "0-30": round(buckets["0-30"], 2),
            "31-60": round(buckets["31-60"], 2),
            "61-90": round(buckets["61-90"], 2),
            "90+": round(buckets["90+"], 2),
            "Total": round(sum(buckets.values()), 2),
        })
    return rows


def build(db: Session) -> bytes:
    wb = new_workbook()
    ws = wb.create_sheet("Aging")
    write_header_row(ws, 1, COLUMNS, widths=[30, 18, 10, 12, 12, 12, 12, 14])

    row = 2
    for data in build_rows(db):
        vals = [data[col] for col in COLUMNS]
        for j, val in enumerate(vals, 1):
            fmt = "#,##0.00" if j >= 4 else None
            write_body_cell(ws.cell(row=row, column=j), val, status="ok_to_pay", fmt=fmt)
        row += 1

    ws.freeze_panes = "A2"
    autosize(ws, len(COLUMNS))
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
