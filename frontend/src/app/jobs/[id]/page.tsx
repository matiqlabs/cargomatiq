"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, money, type JobDetail, type MappingSuggest } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";

const CANONICAL = ["invoice_no", "invoice_date", "amount"] as const;
const FIELD_LABELS: Record<string, string> = {
  invoice_no: "Invoice Number",
  invoice_date: "Invoice Date",
  amount: "Amount",
};

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [suggest, setSuggest] = useState<MappingSuggest | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  async function refresh() {
    const j = await api.get(`/api/jobs/${id}`);
    setJob(j);
  }

  useEffect(() => { refresh(); }, [id]);

  useEffect(() => {
    if (!job) return;
    if (job.status === "mapping_pending" && job.mapping && job.mapping._suggested) {
      const s = job.mapping._suggested;
      const headers = Array.from(new Set(
        Object.values(s).flatMap((f: any) => (f.candidates || []).map((c: any) => c.header))
      )) as string[];
      setSuggest({ headers, preview: [], suggested: s, cached: false });
      const init: Record<string, string | null> = {};
      for (const f of CANONICAL) init[f] = s[f]?.header || null;
      setMapping(init);
    }
  }, [job?.status]);

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      const m: Record<string, string> = {};
      for (const f of CANONICAL) if (mapping[f]) m[f] = mapping[f]!;
      const j = await api.post(`/api/jobs/${id}/mapping/confirm`, { mapping: m });
      setJob(j);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function rerun() {
    setBusy(true); setErr(null);
    try {
      const j = await api.post(`/api/jobs/${id}/rerun`);
      setJob(j);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const filteredLines = useMemo(() => {
    if (!job) return [];
    if (filter === "all") return job.results;
    return job.results.filter((r) => r.status === filter);
  }, [job, filter]);

  if (!job) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading reconciliation run...
        </div>
      </div>
    );
  }

  const counts = (job.summary?.counts || {}) as Record<string, number>;
  const isClosed = job.status === "reconciled" && job.closed;
  const hasResidual = job.status === "reconciled" && !job.closed;

  return (
    <div className="space-y-6 max-w-[1160px] mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between gap-6 pb-1">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs text-slate-400 font-mono">Run #{job.id}</span>
            <span className="text-slate-200">·</span>
            <span className="text-xs text-slate-400">{job.vendor.country || "—"}</span>
            <span className="text-slate-200">·</span>
            <span className="text-xs text-slate-400">credit {job.vendor.credit_days}d</span>
          </div>
          <h1 className="text-[26px] font-bold text-slate-900 tracking-[-0.02em]">{job.vendor.organization}</h1>
          <div className="flex items-center gap-2.5 mt-2 flex-wrap">
            <StatusBadge status={job.status} />
            {job.vendor.gl_group && (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                {job.vendor.gl_group}
              </span>
            )}
            {isClosed && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.25)", color: "#2DD4BF" }}
              >
                ✓ Balanced
              </span>
            )}
            {hasResidual && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#F59E0B" }}
              >
                ⚠ Residual gap
              </span>
            )}
          </div>
        </div>
        {job.status === "reconciled" && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={rerun} disabled={busy} className="btn-secondary">Re-run</button>
            <a className="btn-primary" href={api.fileUrl(`/api/reports/recon/${job.id}.xlsx`)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Report
            </a>
          </div>
        )}
      </div>

      {err && (
        <div className="card px-4 py-3 text-sm text-red-600" style={{ background: "rgba(254,242,242,0.8)", borderColor: "rgba(252,165,165,0.4)" }}>
          {err}
        </div>
      )}

      {/* Mapping pending */}
      {job.status === "mapping_pending" && suggest && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ background: "#F59E0B", boxShadow: "0 0 6px rgba(245,158,11,0.5)" }} />
            <h2 className="font-bold text-slate-900">Confirm Column Mapping</h2>
          </div>
          <p className="text-sm text-slate-500 mb-5 leading-relaxed">
            {suggest.cached ? "Loaded from cached mapping for this vendor format. " : ""}
            Auto-detected columns from your vendor statement — override any that look wrong, then run reconciliation.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="w-full text-sm">
              <thead>
                <tr className="tbl-head">
                  <th>Canonical Field</th><th>Suggested</th><th>Confidence</th><th>Override</th>
                </tr>
              </thead>
              <tbody className="tbl-body">
                {CANONICAL.map((f) => {
                  const s = suggest.suggested[f];
                  const candidates = s?.candidates || [];
                  const headerOptions = Array.from(new Set([
                    ...candidates.map((c) => c.header),
                    ...suggest.headers,
                  ])).filter(Boolean) as string[];
                  return (
                    <tr key={f}>
                      <td className="font-semibold text-slate-800">{FIELD_LABELS[f]}</td>
                      <td className="font-mono text-xs text-slate-500">{s?.header || <span className="text-slate-300">(none)</span>}</td>
                      <td><Confidence score={s?.score ?? 0} /></td>
                      <td>
                        <select
                          value={mapping[f] || ""}
                          onChange={(e) => setMapping((prev) => ({ ...prev, [f]: e.target.value || null }))}
                          className="aurora-select max-w-[260px]"
                          style={{ paddingTop: "6px", paddingBottom: "6px" }}
                        >
                          <option value="">— pick column —</option>
                          {headerOptions.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button onClick={confirm} disabled={busy} className="btn-primary">
              {busy ? "Running..." : "Confirm & Reconcile"}
            </button>
            <span className="text-xs text-slate-400">
              SOA: <span className="text-slate-600 font-medium">{job.soa_filename}</span>
            </span>
          </div>
        </div>
      )}

      {/* Reconciled view */}
      {job.status === "reconciled" && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <ReconStat label="Statement Total" value={money(job.summary?.vendor_total)} />
            <ReconStat label="Books Total" value={money(job.summary?.ajww_total)} />
            <ReconStat label="Matched Total" value={money(job.summary?.reconstructed_total)} />
            <ReconStat
              label="Residual Gap"
              value={money(job.summary?.residual)}
              accent={job.closed ? "#2DD4BF" : "#EF4444"}
              bg={job.closed ? "rgba(45,212,191,0.07)" : "rgba(239,68,68,0.06)"}
              border={job.closed ? "rgba(45,212,191,0.2)" : "rgba(239,68,68,0.2)"}
            />
            <ReconStat
              label="Closed"
              value={job.closed ? "YES" : "NO"}
              accent={job.closed ? "#2DD4BF" : "#EF4444"}
              bg={job.closed ? "rgba(45,212,191,0.07)" : "rgba(239,68,68,0.06)"}
              border={job.closed ? "rgba(45,212,191,0.2)" : "rgba(239,68,68,0.2)"}
            />
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-2 items-center">
            <FilterPill label={`All (${job.results.length})`} value="all" filter={filter} set={setFilter} />
            {Object.entries(counts).map(([k, v]) => (
              <FilterPill key={k} label={`${k.replace(/_/g, " ")} (${v})`} value={k} filter={filter} set={setFilter} />
            ))}
          </div>

          {/* Results table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="tbl-head">
                    {[
                      "Status", "Match",
                      "Stmt Inv", "Stmt Date", "Stmt Amt", "Age",
                      "Books Inv", "Books Txn", "Books Date", "Books Amt", "Diff",
                      "Queue Label", "Queue Owner", "Queue Link",
                    ].map((h) => (
                      <th key={h} className="whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tbl-body">
                  {filteredLines.map((r) => (
                    <tr key={r.id}>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="text-xs text-slate-400 whitespace-nowrap">{r.match_method || ""}</td>
                      <td className="font-mono text-xs whitespace-nowrap">{r.vendor_inv_no || ""}</td>
                      <td className="text-xs whitespace-nowrap">{r.vendor_date || ""}</td>
                      <td className="text-right tabular-nums whitespace-nowrap font-medium">{money(r.vendor_amount)}</td>
                      <td className="text-right tabular-nums">{r.vendor_age_days ?? ""}</td>
                      <td className="font-mono text-xs whitespace-nowrap">{r.ajww_inv_no || ""}</td>
                      <td className="font-mono text-xs whitespace-nowrap">{r.ajww_txn_no || ""}</td>
                      <td className="text-xs whitespace-nowrap">{r.ajww_date || ""}</td>
                      <td className="text-right tabular-nums whitespace-nowrap font-medium">{money(r.ajww_amount)}</td>
                      <td className={`text-right tabular-nums whitespace-nowrap ${r.diff !== null && r.diff !== 0 ? "text-amber-600 font-semibold" : "text-slate-400"}`}>
                        {r.diff !== null && r.diff !== undefined ? money(r.diff) : ""}
                      </td>
                      <td className="max-w-[140px] truncate text-xs">{r.bt_label || ""}</td>
                      <td className="text-xs whitespace-nowrap">{r.bt_owner || ""}</td>
                      <td>
                        {r.bt_link ? (
                          <a href={r.bt_link} target="_blank" rel="noreferrer" className="text-xs font-semibold" style={{ color: "#22D3EE" }}>
                            open ↗
                          </a>
                        ) : ""}
                      </td>
                    </tr>
                  ))}
                  {filteredLines.length === 0 && (
                    <tr>
                      <td colSpan={14} className="text-center py-10 text-sm text-slate-400">
                        No lines match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ReconStat({
  label, value, accent, bg, border,
}: {
  label: string; value: any; accent?: string; bg?: string; border?: string;
}) {
  return (
    <div
      className="card p-4"
      style={bg ? { background: bg, borderColor: border } : undefined}
    >
      <div className="label mb-1">{label}</div>
      <div
        className="text-xl font-bold mt-1 tabular-nums"
        style={{ color: accent || "#0F172A" }}
      >
        {value}
      </div>
    </div>
  );
}

function Confidence({ score }: { score: number }) {
  const color = score >= 90 ? "#2DD4BF" : score >= 70 ? "#F59E0B" : "#EF4444";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 rounded-full h-1.5" style={{ background: "rgba(226,232,240,0.8)" }}>
        <div
          className="h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${Math.max(5, Math.min(100, score))}%`, background: color }}
        />
      </div>
      <span className="text-xs tabular-nums" style={{ color: "#94A3B8" }}>{score}</span>
    </div>
  );
}

function FilterPill({
  label, value, filter, set,
}: {
  label: string; value: string; filter: string; set: (s: string) => void;
}) {
  const active = filter === value;
  return (
    <button
      onClick={() => set(value)}
      className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-150 capitalize"
      style={
        active
          ? { background: "#070B1A", color: "white", border: "1px solid #1E293B" }
          : { background: "rgba(255,255,255,0.9)", color: "#64748B", border: "1px solid rgba(226,232,240,0.9)" }
      }
    >
      {label}
    </button>
  );
}
