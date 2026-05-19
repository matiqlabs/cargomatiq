"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, money, type JobBrief, type Vendor } from "@/lib/api";

export default function HistoryPage() {
  const [jobs, setJobs] = useState<JobBrief[]>([]);
  const [vendors, setVendors] = useState<Record<number, Vendor>>({});
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "closed" | "open">("all");

  useEffect(() => {
    (async () => {
      try {
        const [js, vs] = await Promise.all([
          api.get("/api/jobs"),
          api.get("/api/vendors?limit=10000"),
        ]);
        const reconciled = (js as JobBrief[]).filter((j) => j.status === "reconciled");
        setJobs(reconciled);
        const m: Record<number, Vendor> = {};
        for (const v of vs as Vendor[]) m[v.id] = v;
        setVendors(m);
      } catch (e: any) {
        setErr(e.message);
      }
    })();
  }, []);

  const filtered =
    filter === "all" ? jobs :
    filter === "closed" ? jobs.filter((j) => j.closed) :
    jobs.filter((j) => !j.closed);

  const closedCount = jobs.filter((j) => j.closed).length;
  const openGapCount = jobs.filter((j) => !j.closed).length;

  return (
    <div className="space-y-6 max-w-[1100px] mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{ background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.25)", color: "#2DD4BF" }}
            >
              Completed runs
            </span>
          </div>
          <h1 className="text-[26px] font-bold text-slate-900 tracking-[-0.02em]">Reconciliation History</h1>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            All completed reconciliation runs. Download the Excel report for any run.
          </p>
        </div>
        <Link href="/jobs/new" className="btn-primary shrink-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Reconciliation
        </Link>
      </div>

      {err && (
        <div className="card px-4 py-3 text-sm text-red-600" style={{ background: "rgba(254,242,242,0.8)", borderColor: "rgba(252,165,165,0.4)" }}>
          {err}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="label mb-1">Total Runs</div>
          <div className="text-3xl font-bold text-slate-900 tabular-nums mt-1">{jobs.length}</div>
        </div>
        <div className="card p-5" style={{ background: "rgba(45,212,191,0.05)", borderColor: "rgba(45,212,191,0.2)" }}>
          <div className="label mb-1" style={{ color: "#2DD4BF" }}>Balanced</div>
          <div className="text-3xl font-bold tabular-nums mt-1" style={{ color: "#2DD4BF" }}>{closedCount}</div>
        </div>
        <div className="card p-5" style={{ background: "rgba(245,158,11,0.05)", borderColor: "rgba(245,158,11,0.2)" }}>
          <div className="label mb-1" style={{ color: "#F59E0B" }}>Residual Gaps</div>
          <div className="text-3xl font-bold tabular-nums mt-1" style={{ color: "#F59E0B" }}>{openGapCount}</div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {(["all", "closed", "open"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-150 capitalize"
            style={
              filter === f
                ? { background: "#070B1A", color: "white", border: "1px solid #1E293B" }
                : { background: "rgba(255,255,255,0.9)", color: "#64748B", border: "1px solid rgba(226,232,240,0.9)" }
            }
          >
            {f === "all" ? `All (${jobs.length})` : f === "closed" ? `Balanced (${closedCount})` : `Gaps (${openGapCount})`}
          </button>
        ))}
      </div>

      {/* History table */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-4"
              style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", color: "#8B5CF6" }}
            >
              ⊙
            </div>
            <div className="text-sm font-semibold text-slate-700">
              {jobs.length === 0 ? "No reconciliation runs yet" : "No runs match this filter"}
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
              {jobs.length === 0
                ? "Complete a reconciliation to see it here."
                : "Try switching the filter above."}
            </p>
            {jobs.length === 0 && (
              <Link href="/jobs/new" className="mt-4 btn-primary text-xs px-4 py-2">
                Start Reconciliation
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="tbl-head">
                  <th>#</th>
                  <th>Partner</th>
                  <th>Run Date</th>
                  <th className="text-right">Stmt Total</th>
                  <th className="text-right">Books Total</th>
                  <th className="text-right">Residual</th>
                  <th>Balanced</th>
                  <th>SOA File</th>
                  <th />
                </tr>
              </thead>
              <tbody className="tbl-body">
                {filtered.map((j) => {
                  const vendor = vendors[j.vendor_id];
                  return (
                    <tr key={j.id}>
                      <td className="text-slate-400 font-mono text-xs w-12">{j.id}</td>
                      <td>
                        <div className="font-semibold text-slate-800">{vendor?.organization || "—"}</div>
                        {vendor?.country && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{vendor.country}</div>
                        )}
                      </td>
                      <td className="text-slate-400 text-xs whitespace-nowrap">
                        {new Date(j.updated_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="text-right tabular-nums font-medium text-slate-700">—</td>
                      <td className="text-right tabular-nums font-medium text-slate-700">—</td>
                      <td className={`text-right tabular-nums font-semibold ${j.closed ? "text-teal-600" : "text-amber-600"}`}>
                        {money(j.residual)}
                      </td>
                      <td>
                        {j.closed ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            style={{ background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.25)", color: "#2DD4BF" }}
                          >
                            ✓ YES
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#F59E0B" }}
                          >
                            ⚠ GAP
                          </span>
                        )}
                      </td>
                      <td className="text-xs text-slate-400 max-w-[140px] truncate">—</td>
                      <td>
                        <div className="flex items-center gap-2 justify-end">
                          <Link
                            href={`/jobs/${j.id}`}
                            className="text-xs font-semibold transition-colors whitespace-nowrap"
                            style={{ color: "#22D3EE" }}
                          >
                            View →
                          </Link>
                          <a
                            href={api.fileUrl(`/api/reports/recon/${j.id}.xlsx`)}
                            className="inline-flex items-center gap-1.5 btn-secondary text-xs px-3"
                            style={{ height: "30px" }}
                            title="Download Excel report"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Report
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
