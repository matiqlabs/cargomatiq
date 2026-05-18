"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";

const REPORTS = [
  {
    key: "aging",
    name: "Aging Summary",
    desc: "Per vendor across all reconciled jobs: 0-30, 31-60, 61-90, 90+ buckets.",
    href: "/api/reports/aging.xlsx",
    jsonHref: "/api/reports/aging.json",
  },
  {
    key: "disputes",
    name: "Dispute Log",
    desc: "Lines flagged pending_in_bt or amount_dispute, with BT context.",
    href: "/api/reports/disputes.xlsx",
    jsonHref: "/api/reports/disputes.json",
  },
  {
    key: "payment",
    name: "Payment Release Packet",
    desc: "ok_to_pay lines grouped by vendor, with subtotals.",
    href: "/api/reports/payment_packet.xlsx",
    jsonHref: "/api/reports/payment_packet.json",
  },
];

type ReportData = { columns: string[]; rows: Record<string, unknown>[] };

export default function ReportsPage() {
  const [viewing, setViewing] = useState<{ key: string; name: string; data: ReportData } | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [viewErr, setViewErr] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  async function viewReport(key: string, name: string, jsonHref: string) {
    if (viewing?.key === key) {
      setViewing(null);
      return;
    }
    setLoadingKey(key); setViewErr(null);
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
    typeof v === "number" ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v ?? "");

  const isNum = (col: string) =>
    ["0-30", "31-60", "61-90", "90+", "Total", "Amount", "Diff", "Credit Term"].includes(col);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-slate-500 mt-1">Generated from all reconciled jobs. Each exports an Excel file.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {REPORTS.map(r => (
          <div key={r.key} className={`card p-5 flex flex-col ${viewing?.key === r.key ? "ring-2 ring-amber-400" : ""}`}>
            <div className="font-semibold text-slate-900">{r.name}</div>
            <div className="text-sm text-slate-500 mt-1 flex-1">{r.desc}</div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => viewReport(r.key, r.name, r.jsonHref)}
                disabled={loadingKey === r.key}
                className="px-3 py-1.5 text-sm border rounded hover:bg-slate-50"
              >
                {loadingKey === r.key ? "Loading…" : viewing?.key === r.key ? "Hide" : "View"}
              </button>
              <a href={api.fileUrl(r.href)} className="btn-primary text-sm self-start">
                Download .xlsx
              </a>
            </div>
          </div>
        ))}
      </div>

      {viewErr && (
        <div className="card p-4 text-sm text-red-600">{viewErr}</div>
      )}

      {viewing && (
        <div ref={tableRef} className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">{viewing.name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{viewing.data.rows.length} row{viewing.data.rows.length !== 1 ? "s" : ""}</p>
            </div>
            <button
              onClick={() => setViewing(null)}
              className="text-sm text-slate-400 hover:text-slate-700"
            >
              ✕ Close
            </button>
          </div>

          {viewing.data.rows.length === 0 ? (
            <p className="text-sm text-slate-500">No data available yet — reconcile some jobs first.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-slate-200">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {viewing.data.columns.map(col => (
                      <th
                        key={col}
                        className={`px-3 py-2 bg-slate-800 text-white font-medium whitespace-nowrap ${isNum(col) ? "text-right" : "text-left"}`}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewing.data.rows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      {viewing.data.columns.map(col => (
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

      <div className="card p-5">
        <div className="font-semibold mb-1">Per-vendor recon reports</div>
        <p className="text-sm text-slate-500">
          Open a specific job from the <a href="/" className="text-amber-600">Dashboard</a> and click <em>Download Recon</em> in the header.
        </p>
      </div>
    </div>
  );
}
