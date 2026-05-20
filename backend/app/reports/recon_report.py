"""Per-vendor reconciliation report with user-facing export labels."""
from io import BytesIO

from sqlalchemy.orm import Session

from app.db import models
from app.reports.excel_export import (
    BODY_FONT,
    BOLD_BODY_FONT,
    SUBHEAD_FILL,
    SUBHEAD_FONT,
    autosize,
    new_workbook,
    write_body_cell,
    write_header_row,
)

COLUMNS = [
    "Status", "Match", "Statement Inv No", "Statement Date", "Statement Amount", "Currency", "Statement Age (days)",
    "Books Inv No", "Books Txn No", "Books Date", "Books Amount", "Diff",
    "Queue Label", "Queue Labels", "Queue Note", "Queue Link", "Queue Owner",
]


STATUS_ORDER = [
    "ok_to_pay", "amount_dispute", "not_due",
    "pending_in_bt", "to_be_booked",
    "missing_in_vendor", "paid",
]


def _display_date(value):
    if not value:
        return ""
    text = str(value)
    return text[:10] if len(text) >= 10 and text[4:5] == "-" and text[7:8] == "-" else text


def build(db: Session, job: models.ReconJob) -> bytes:
    wb = new_workbook()
    ws = wb.create_sheet("Reconciliation Report")

    summary = job.summary or {}
    v = job.vendor
    meta_rows = [
        ("Vendor", v.organization),
        ("Country", v.country or ""),
        ("Credit Term (days)", v.credit_days or 0),
        ("GL Group", v.gl_group or ""),
        ("Books / TMS Snapshot", job.logisys_snapshot.filename if job.logisys_snapshot else ""),
        ("Pending Queue Snapshot", job.bt_snapshot.filename if job.bt_snapshot else ""),
        ("Statement Total", summary.get("vendor_total", 0)),
        ("Books Total", summary.get("ajww_total", 0)),
        ("Matched Total", summary.get("reconstructed_total", 0)),
        ("Residual Gap", summary.get("residual", 0)),
        ("Closed", "YES" if summary.get("closed") else "NO"),
    ]
    for i, (k, val) in enumerate(meta_rows, 1):
        kc = ws.cell(row=i, column=1, value=k)
        kc.font = SUBHEAD_FONT
        kc.fill = SUBHEAD_FILL
        vc = ws.cell(row=i, column=2, value=val)
        vc.font = BOLD_BODY_FONT
        if isinstance(val, (int, float)) and k in ("Statement Total", "Books Total", "Matched Total", "Residual Gap"):
            vc.number_format = "#,##0.00"
    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 40

    header_row = len(meta_rows) + 2
    widths = [16, 11, 16, 13, 14, 10, 9, 16, 16, 13, 14, 10, 14, 22, 35, 28, 20]
    write_header_row(ws, header_row, COLUMNS, widths=widths)

    results = sorted(
        job.results,
        key=lambda r: (
            STATUS_ORDER.index(r.status) if r.status in STATUS_ORDER else 99,
            r.vendor_inv_no or "",
        ),
    )
    row = header_row + 1
    for r in results:
        vals = [
            r.status,
            r.match_method or "",
            r.vendor_inv_no or "",
            _display_date(r.vendor_date),
            r.vendor_amount,
            r.vendor_currency or "",
            r.vendor_age_days if r.vendor_age_days is not None else "",
            r.ajww_inv_no or "",
            r.ajww_txn_no or "",
            _display_date(r.ajww_date),
            r.ajww_amount,
            r.diff,
            r.bt_label or "",
            r.bt_labels or "",
            r.bt_note or "",
            r.bt_link or "",
            r.bt_owner or "",
        ]
        for j, val in enumerate(vals, 1):
            cell = ws.cell(row=row, column=j)
            fmt = None
            if j in (5, 11, 12):
                fmt = "#,##0.00"
            write_body_cell(cell, val, status=r.status, fmt=fmt)
        row += 1

    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    autosize(ws, len(COLUMNS))

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
