"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type ExtractionReviewRow, type ExtractionReviewData } from "@/lib/api";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];

function addDaysIso(dateValue: string | null | undefined, days: number) {
  if (!dateValue) return null;
  const match = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function makeRow(currency = "USD"): ExtractionReviewRow {
  return {
    id: crypto.randomUUID(),
    invoice_no: null,
    invoice_date: null,
    amount: null,
    currency,
    due_date: null,
    reference: null,
    description: null,
    confidence: "Manual",
    ignored: false,
    source: "manual",
    edited: true,
  };
}

export default function ReviewExtractionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [meta, setMeta] = useState<Omit<ExtractionReviewData, "rows"> | null>(null);
  const [rows, setRows] = useState<ExtractionReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [valErrors, setValErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<ExtractionReviewRow | null>(null);

  useEffect(() => {
    api.get(`/api/jobs/${id}/extraction-review`)
      .then((data: ExtractionReviewData) => {
        const { rows: r, ...rest } = data;
        setMeta(rest);
        setRows(r);
      })
      .catch((e: any) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    for (const row of rows) {
      if (row.ignored) continue;
      if (!row.invoice_no?.trim()) errs[`${row.id}__invoice_no`] = "Required";
      if (row.amount === null || row.amount === undefined || isNaN(Number(row.amount))) {
        errs[`${row.id}__amount`] = "Required";
      }
    }
    setValErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function updateRow(rowId: string, field: keyof ExtractionReviewRow, value: any) {
    setRows(prev =>
      prev.map(r => {
        if (r.id !== rowId) return r;
        const next = { ...r, [field]: value, edited: r.source === "extracted" ? true : r.edited };
        if (field === "invoice_date") {
          next.due_date = addDaysIso(value, meta?.vendor_credit_days ?? 0);
        }
        return next;
      })
    );
    setValErrors(prev => {
      const next = { ...prev };
      delete next[`${rowId}__${field}`];
      return next;
    });
    setSaved(false);
  }

  function addRow() {
    const defaultCurrency = rows.find(r => !r.ignored && r.currency)?.currency || "USD";
    setRows(prev => [...prev, makeRow(defaultCurrency)]);
    setSaved(false);
  }

  function deleteRow(rowId: string) {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    setPendingDelete(row);
  }

  function confirmDeleteRow() {
    if (!pendingDelete) return;
    const rowId = pendingDelete.id;
    setRows(prev => prev.filter(r => r.id !== rowId));
    setValErrors(prev => {
      const next = { ...prev };
      Object.keys(next).filter(k => k.startsWith(rowId)).forEach(k => delete next[k]);
      return next;
    });
    setPendingDelete(null);
    setSaved(false);
  }

  function toggleIgnore(rowId: string) {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, ignored: !r.ignored } : r));
    setValErrors(prev => {
      const next = { ...prev };
      delete next[`${rowId}__invoice_no`];
      delete next[`${rowId}__amount`];
      return next;
    });
    setSaved(false);
  }

  async function doSave(): Promise<boolean> {
    if (!validate()) return false;
    setSaving(true);
    setErr(null);
    try {
      await api.put(`/api/jobs/${id}/extraction-review`, { rows });
      setSaved(true);
      return true;
    } catch (e: any) {
      setErr(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function continueToRecon() {
    if (!validate()) return;
    setReconciling(true);
    setErr(null);
    try {
      await api.put(`/api/jobs/${id}/extraction-review`, { rows });
      await api.post(`/api/jobs/${id}/continue-reconciliation`);
      router.push(`/jobs/${id}`);
    } catch (e: any) {
      setErr(e.message);
      setReconciling(false);
    }
  }

  const includedCount = rows.filter(r => !r.ignored).length;
  const ignoredCount = rows.filter(r => r.ignored).length;
  const hasErrors = Object.keys(valErrors).length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading extracted data...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)", color: "#22D3EE" }}
            >
              Review step
            </span>
          </div>
          <h1 className="text-[26px] font-bold text-slate-900 tracking-[-0.02em]">Review Extracted Data</h1>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            Review, correct, or ignore extracted vendor statement rows before running reconciliation.
          </p>
        </div>
        <button onClick={() => router.back()} className="btn-secondary shrink-0">
          ← Back
        </button>
      </div>

      {/* Metadata strip */}
      {meta && (
        <div className="card px-5 py-3.5 flex items-center gap-5 flex-wrap">
          <div>
            <span className="label block mb-0.5">Vendor</span>
            <span className="text-sm font-semibold text-slate-800">{meta.vendor_name}</span>
          </div>
          <div className="w-px h-8 bg-slate-200 flex-shrink-0" />
          <div>
            <span className="label block mb-0.5">Credit Period</span>
            <span className="text-sm font-semibold text-slate-800">{meta.vendor_credit_days} days</span>
          </div>
          <div className="w-px h-8 bg-slate-200 flex-shrink-0" />
          <div>
            <span className="label block mb-0.5">Statement</span>
            <span className="text-xs font-mono text-slate-600">{meta.soa_filename || "—"}</span>
          </div>
          <div className="w-px h-8 bg-slate-200 flex-shrink-0" />
          <div className="flex items-center gap-2">
            <StatusPill label={`${rows.length} total`} variant="slate" />
            <StatusPill label={`${includedCount} included`} variant="teal" />
            {ignoredCount > 0 && <StatusPill label={`${ignoredCount} ignored`} variant="amber" />}
          </div>
          {meta.review_status === "saved" && (
            <div className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-teal-600">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Draft saved
            </div>
          )}
        </div>
      )}

      {/* Banners */}
      {err && (
        <div className="card px-4 py-3 text-sm text-red-600" style={{ background: "rgba(254,242,242,0.8)", borderColor: "rgba(252,165,165,0.4)" }}>
          {err}
        </div>
      )}
      {hasErrors && (
        <div className="card px-4 py-3 text-sm text-amber-700" style={{ background: "rgba(254,243,199,0.8)", borderColor: "rgba(253,230,138,0.5)" }}>
          Fix the highlighted errors before continuing.
        </div>
      )}
      {saved && !hasErrors && !err && (
        <div className="card px-4 py-3 text-sm text-teal-700 flex items-center gap-2" style={{ background: "rgba(240,253,250,0.8)", borderColor: "rgba(94,234,212,0.4)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Changes saved successfully.
        </div>
      )}

      {/* Main table card */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-4 rounded-full" style={{ background: "#22D3EE" }} />
            <h2 className="text-[13px] font-semibold text-slate-800">Extracted Invoice Rows</h2>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-3"
              style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.15)", color: "#22D3EE" }}
            >
              ⊙
            </div>
            <div className="text-sm font-semibold text-slate-700">No rows detected</div>
            <div className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
              No rows were extracted from the vendor statement. Add rows manually or go back to re-upload.
            </div>
            <button onClick={addRow} className="btn-primary mt-5">Add First Row</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 960 }}>
              <thead>
                <tr className="tbl-head">
                  <th style={{ minWidth: 160 }}>Invoice No</th>
                  <th style={{ minWidth: 120 }}>Date</th>
                  <th style={{ minWidth: 110 }} className="text-right">Amount</th>
                  <th style={{ minWidth: 80 }}>Currency</th>
                  <th style={{ minWidth: 120 }}>Due Date</th>
                  <th style={{ minWidth: 130 }}>Comments</th>
                  <th style={{ minWidth: 95 }}>Status</th>
                  <th style={{ minWidth: 120 }} className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <ReviewRow
                    key={row.id}
                    row={row}
                    errors={valErrors}
                    onChange={updateRow}
                    onDelete={deleteRow}
                    onToggleIgnore={toggleIgnore}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-4 pb-6">
        <button onClick={addRow} className="btn-secondary">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Missing Row
        </button>
        <div className="flex items-center gap-3">
          <button onClick={doSave} disabled={saving || reconciling} className="btn-secondary">
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button
            onClick={continueToRecon}
            disabled={saving || reconciling || hasErrors}
            className="btn-primary"
          >
            {reconciling ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Running Reconciliation...
              </>
            ) : "Continue to Reconciliation →"}
          </button>
        </div>
      </div>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(15,23,42,0.38)", backdropFilter: "blur(6px)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-invoice-title"
        >
          <div className="card w-full max-w-[420px] p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626" }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 id="delete-invoice-title" className="text-base font-bold text-slate-900">Delete invoice?</h2>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                  This will remove {pendingDelete.invoice_no ? (
                    <span className="font-semibold text-slate-700">invoice {pendingDelete.invoice_no}</span>
                  ) : "this invoice"} from the review list.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setPendingDelete(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={confirmDeleteRow}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: "#DC2626", color: "white" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ReviewRow({
  row, errors, onChange, onDelete, onToggleIgnore,
}: {
  row: ExtractionReviewRow;
  errors: Record<string, string>;
  onChange: (id: string, field: keyof ExtractionReviewRow, value: any) => void;
  onDelete: (id: string) => void;
  onToggleIgnore: (id: string) => void;
}) {
  const ignored = row.ignored;
  const base = `px-3 py-2 border-b border-slate-100/80 align-top`;
  const dim = ignored ? " opacity-40" : "";

  return (
    <tr style={ignored ? { background: "rgba(248,250,252,0.7)" } : undefined}>
      {/* Invoice No */}
      <td className={base + dim}>
        <input
          value={row.invoice_no ?? ""}
          onChange={e => onChange(row.id, "invoice_no", e.target.value || null)}
          disabled={ignored}
          placeholder="e.g. INV-1234"
          className="aurora-input text-xs"
          style={{ paddingTop: 5, paddingBottom: 5, borderColor: errors[`${row.id}__invoice_no`] ? "#f87171" : undefined }}
        />
        {errors[`${row.id}__invoice_no`] && (
          <div className="text-[10px] text-red-500 mt-0.5">{errors[`${row.id}__invoice_no`]}</div>
        )}
      </td>
      {/* Date */}
      <td className={base + dim}>
        <input
          value={row.invoice_date ?? ""}
          onChange={e => onChange(row.id, "invoice_date", e.target.value || null)}
          disabled={ignored}
          placeholder="YYYY-MM-DD"
          className="aurora-input text-xs"
          style={{ paddingTop: 5, paddingBottom: 5 }}
        />
      </td>
      {/* Amount */}
      <td className={base + dim}>
        <input
          type="number"
          step="0.01"
          value={row.amount ?? ""}
          onChange={e => onChange(row.id, "amount", e.target.value === "" ? null : parseFloat(e.target.value))}
          disabled={ignored}
          placeholder="0.00"
          className="aurora-input text-xs text-right tabular-nums"
          style={{ paddingTop: 5, paddingBottom: 5, borderColor: errors[`${row.id}__amount`] ? "#f87171" : undefined }}
        />
        {errors[`${row.id}__amount`] && (
          <div className="text-[10px] text-red-500 mt-0.5 text-right">{errors[`${row.id}__amount`]}</div>
        )}
      </td>
      {/* Currency */}
      <td className={base + dim}>
        <select
          value={row.currency}
          onChange={e => onChange(row.id, "currency", e.target.value)}
          disabled={ignored}
          className="aurora-select text-xs"
          style={{ paddingTop: 5, paddingBottom: 5 }}
        >
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      {/* Due Date */}
      <td className={base + dim}>
        <input
          value={row.due_date ?? ""}
          onChange={e => onChange(row.id, "due_date", e.target.value || null)}
          disabled={ignored}
          placeholder="YYYY-MM-DD"
          className="aurora-input text-xs"
          style={{ paddingTop: 5, paddingBottom: 5 }}
        />
      </td>
      {/* Comments */}
      <td className={base + dim}>
        <input
          value={row.reference ?? ""}
          onChange={e => onChange(row.id, "reference", e.target.value || null)}
          disabled={ignored}
          placeholder="—"
          className="aurora-input text-xs"
          style={{ paddingTop: 5, paddingBottom: 5 }}
        />
      </td>
      {/* Status */}
      <td className={`${base} whitespace-nowrap` + dim}>
        <div className="flex flex-col gap-1 items-start">
          <InvoiceStatusBadge source={row.source} />
          {ignored && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-slate-100 text-slate-500 border-slate-200">
              Ignored
            </span>
          )}
          {!ignored && row.edited && row.source === "extracted" && (
            <span className="text-[9px] font-semibold text-amber-500 uppercase tracking-wide">edited</span>
          )}
        </div>
      </td>
      {/* Actions */}
      <td className={`${base} whitespace-nowrap`}>
        <div className="flex items-center gap-1.5 justify-end">
          <button
            onClick={() => onToggleIgnore(row.id)}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
            style={
              ignored
                ? { background: "rgba(226,232,240,0.6)", color: "#475569" }
                : { background: "rgba(245,158,11,0.08)", color: "#B45309", border: "1px solid rgba(245,158,11,0.25)" }
            }
          >
            {ignored ? "Unignore" : "Ignore"}
          </button>
          <button
            onClick={() => onDelete(row.id)}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
            style={{ background: "rgba(239,68,68,0.06)", color: "#DC2626", border: "1px solid rgba(239,68,68,0.2)" }}
            title="Delete invoice"
            aria-label="Delete invoice"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

function InvoiceStatusBadge({ source }: { source: string }) {
  const map: Record<string, string> = {
    extracted: "bg-sky-50 text-sky-700 border-sky-200",
    manual: "bg-slate-100 text-slate-700 border-slate-200",
  };
  const label = source === "manual" ? "Manual" : "Auto";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${map[source] ?? map.extracted}`}>
      {label}
    </span>
  );
}

function StatusPill({ label, variant }: { label: string; variant: "slate" | "teal" | "amber" }) {
  const map = {
    slate: "bg-slate-100 text-slate-600 border-slate-200",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${map[variant]}`}>
      {label}
    </span>
  );
}
