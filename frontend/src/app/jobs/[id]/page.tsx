"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, money, type JobDetail } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";

const CANONICAL = ["invoice_no", "invoice_date", "amount"] as const;

function displayDate(value: string | null | undefined) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : String(value);
}

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [autoConfirming, setAutoConfirming] = useState(false);
  const [autoConfirmAttempted, setAutoConfirmAttempted] = useState<number | null>(null);

  async function refresh() {
    const j = await api.get(`/api/jobs/${id}`);
    setJob(j);
  }

  useEffect(() => { refresh(); }, [id]);

  // Redirect to review page once mapping is confirmed
  useEffect(() => {
    if (job?.status === "review_pending") {
      router.push(`/jobs/${id}/review-extraction`);
    }
  }, [job?.status]);

  useEffect(() => {
    if (!job || job.status !== "mapping_pending" || autoConfirming || autoConfirmAttempted === job.id) return;
    const suggested = job.mapping?._suggested;
    setAutoConfirmAttempted(job.id);
    if (!suggested) {
      setErr("Could not auto-detect the statement columns. Please upload a cleaner vendor statement.");
      return;
    }

    const mapping: Record<string, string> = {};
    for (const field of CANONICAL) {
      const header = suggested[field]?.header;
      if (header) mapping[field] = header;
    }
    if (Object.keys(mapping).length !== CANONICAL.length) {
      setErr("Could not auto-detect invoice number, invoice date, and amount columns from this statement.");
      return;
    }

    setAutoConfirming(true);
    setBusy(true);
    setErr(null);
    api.post(`/api/jobs/${id}/mapping/confirm`, { mapping })
      .then((j) => setJob(j))
      .catch((e: any) => setErr(e.message))
      .finally(() => {
        setBusy(false);
        setAutoConfirming(false);
      });
  }, [job, id, autoConfirming, autoConfirmAttempted]);

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

      {job.status === "mapping_pending" && !err && (
        <div className="card px-4 py-3 text-sm text-slate-500">
          Reading statement columns and opening invoice review...
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
                      <td className="text-xs whitespace-nowrap">{displayDate(r.vendor_date)}</td>
                      <td className="text-right tabular-nums whitespace-nowrap font-medium">{money(r.vendor_amount)}</td>
                      <td className="text-right tabular-nums">{r.vendor_age_days ?? ""}</td>
                      <td className="font-mono text-xs whitespace-nowrap">{r.ajww_inv_no || ""}</td>
                      <td className="font-mono text-xs whitespace-nowrap">{r.ajww_txn_no || ""}</td>
                      <td className="text-xs whitespace-nowrap">{displayDate(r.ajww_date)}</td>
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
