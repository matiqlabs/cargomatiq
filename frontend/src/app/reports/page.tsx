"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";

const REPORTS = [
  {
    key: "aging",
    name: "Aging Summary",
    desc: "Per partner across all reconciled runs: 0-30, 31-60, 61-90, 90+ buckets.",
    href: "/api/reports/aging.xlsx",
    jsonHref: "/api/reports/aging.json",
    accent: "#22D3EE",
    gradStart: "rgba(34,211,238,0.12)",
    gradEnd: "rgba(34,211,238,0.04)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    ),
  },
  {
    key: "disputes",
    name: "Dispute Log",
    desc: "Lines flagged as pending in queue or amount disputes, with owner and follow-up context.",
    href: "/api/reports/disputes.xlsx",
    jsonHref: "/api/reports/disputes.json",
    accent: "#EF4444",
    gradStart: "rgba(239,68,68,0.10)",
    gradEnd: "rgba(239,68,68,0.03)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    key: "payment",
    name: "Payment Release Packet",
    desc: "OK to Pay lines grouped by partner, with subtotals.",
    href: "/api/reports/payment_packet.xlsx",
    jsonHref: "/api/reports/payment_packet.json",
    accent: "#2DD4BF",
    gradStart: "rgba(45,212,191,0.12)",
    gradEnd: "rgba(45,212,191,0.04)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
];

type ReportData = { columns: string[]; rows: Record<string, unknown>[] };

export default function ReportsPage() {
  const [viewing, setViewing] = useState<{ key: string; name: string; data: ReportData } | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [viewErr, setViewErr] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  async function viewReport(key: string, name: string, jsonHref: string) {
    if (viewing?.key === key) { setViewing(null); return; }
    setLoadingKey(key);
    setViewErr(null);
    try {
      const data: ReportData = await api.get(jsonHref);
      setViewing({ key, name, data });
      setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e: any) {
      setViewErr(e.message || String(e));
    } finally {
      setLoadingKey(null);
    }
  }

  const numFmt = (v: unknown) =>
    typeof v === "number"
      ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(v ?? "");

  const isNum = (col: string) =>
    ["0-30", "31-60", "61-90", "90+", "Total", "Amount", "Diff", "Credit Term"].includes(col);

  return (
    <div className="space-y-6 max-w-[1160px] mx-auto">

      {/* Page header */}
      <div className="pb-1">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#8B5CF6" }}
          >
            Finance reporting
          </span>
        </div>
        <h1 className="text-[28px] font-bold text-slate-900 tracking-[-0.02em]">Finance Reports</h1>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">
          Export aging summaries, dispute logs, payment packets, and reconciliation reports for finance review.
        </p>
      </div>

      {/* Report bento cards */}
      <div className="grid md:grid-cols-3 gap-5">
        {REPORTS.map((r) => (
          <div
            key={r.key}
            className="card card-hover p-5 flex flex-col overflow-hidden relative"
            style={viewing?.key === r.key ? { boxShadow: `0 0 0 2px ${r.accent}40, 0 12px 40px rgba(15,23,42,0.10)` } : undefined}
          >
            {/* Subtle gradient corner */}
            <div
              aria-hidden
              className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle, ${r.gradStart} 0%, ${r.gradEnd} 60%, transparent 80%)` }}
            />

            {/* Icon container */}
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4 relative"
              style={{ background: r.gradStart, border: `1px solid ${r.accent}25` }}
            >
              {r.icon}
            </div>

            <div className="font-bold text-slate-900 text-[14px]">{r.name}</div>
            <div className="text-xs text-slate-500 mt-1 flex-1 leading-relaxed">{r.desc}</div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => viewReport(r.key, r.name, r.jsonHref)}
                disabled={loadingKey === r.key}
                className="btn-secondary"
              >
                {loadingKey === r.key
                  ? "Loading..."
                  : viewing?.key === r.key
                  ? "Hide"
                  : "Preview"}
              </button>
              <a href={api.fileUrl(r.href)} className="btn-primary self-start">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export .xlsx
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Per-partner note */}
      <div className="card p-5 flex items-start gap-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div>
          <div className="text-[13px] font-semibold text-slate-800">Per-partner reconciliation reports</div>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Open a specific reconciliation run from the{" "}
            <a href="/" className="font-semibold" style={{ color: "#22D3EE" }}>Command Center</a>
            {" "}and click <span className="font-semibold text-slate-700">Download Report</span> in the page header.
          </p>
        </div>
      </div>

      {viewErr && (
        <div className="card px-4 py-3 text-sm text-red-600" style={{ background: "rgba(254,242,242,0.8)", borderColor: "rgba(252,165,165,0.4)" }}>
          {viewErr}
        </div>
      )}

      {/* Preview table */}
      {viewing && (
        <div ref={tableRef} className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900">{viewing.name}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{viewing.data.rows.length} row{viewing.data.rows.length !== 1 ? "s" : ""}</p>
            </div>
            <button onClick={() => setViewing(null)} className="text-sm text-slate-400 hover:text-slate-600 font-semibold">
              ✕ Close
            </button>
          </div>

          {viewing.data.rows.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg mb-3"
                style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", color: "#8B5CF6" }}
              >
                ⊙
              </div>
              <div className="text-sm font-semibold text-slate-700">No data yet</div>
              <div className="text-xs text-slate-400 mt-1">Reconcile some runs first to generate this report.</div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {viewing.data.columns.map((col) => (
                      <th
                        key={col}
                        className={`px-3 py-2.5 font-semibold whitespace-nowrap text-[11px] ${isNum(col) ? "text-right" : "text-left"}`}
                        style={{ background: "#070B1A", color: "#CBD5E1" }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewing.data.rows.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "white" : "rgba(248,250,252,0.7)" }}>
                      {viewing.data.columns.map((col) => (
                        <td
                          key={col}
                          className={`px-3 py-1.5 border-b border-slate-100 whitespace-nowrap ${isNum(col) ? "text-right font-mono" : ""}`}
                        >
                          {isNum(col) ? numFmt(row[col]) : String(row[col] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
