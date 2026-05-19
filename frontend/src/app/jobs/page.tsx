"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, money, type JobBrief, type Vendor } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";

export default function ReconJobsPage() {
  const [jobs, setJobs] = useState<JobBrief[]>([]);
  const [vendors, setVendors] = useState<Record<number, Vendor>>({});
  const [err, setErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function load() {
    try {
      const [js, vs] = await Promise.all([
        api.get("/api/jobs"),
        api.get("/api/vendors?limit=10000"),
      ]);
      const pending = (js as JobBrief[]).filter((j) => j.status !== "reconciled");
      setJobs(pending);
      const m: Record<number, Vendor> = {};
      for (const v of vs as Vendor[]) m[v.id] = v;
      setVendors(m);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: number, vendorName: string) {
    if (!confirm(`Delete reconciliation job #${id} for "${vendorName}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/jobs/${id}`);
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDeletingId(null);
    }
  }

  const statusOrder = ["draft", "mapping_pending", "review_pending"];

  return (
    <div className="space-y-6 max-w-[1100px] mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#F59E0B" }}
            >
              Active workspace
            </span>
          </div>
          <h1 className="text-[26px] font-bold text-slate-900 tracking-[-0.02em]">Reconciliation Jobs</h1>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            All pending and in-progress reconciliation jobs. Open a job to continue where you left off.
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
          <button onClick={() => setErr(null)} className="ml-3 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Summary pills */}
      <div className="flex items-center gap-3 flex-wrap">
        {statusOrder.map((s) => {
          const count = jobs.filter((j) => j.status === s).length;
          return (
            <div key={s} className="flex items-center gap-1.5">
              <StatusBadge status={s} />
              <span className="text-xs font-semibold text-slate-500 tabular-nums">{count}</span>
            </div>
          );
        })}
        <span className="text-xs text-slate-400 ml-2">{jobs.length} total pending</span>
      </div>

      {/* Jobs table */}
      <div className="card overflow-hidden">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-4"
              style={{ background: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.15)", color: "#2DD4BF" }}
            >
              ✓
            </div>
            <div className="text-sm font-semibold text-slate-700">No pending jobs</div>
            <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
              All reconciliations are complete. Start a new one or check History for past runs.
            </p>
            <Link href="/jobs/new" className="mt-4 btn-primary text-xs px-4 py-2">
              New Reconciliation
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="tbl-head">
                  <th>#</th>
                  <th>Partner</th>
                  <th>Status</th>
                  <th>Country</th>
                  <th>Credit Days</th>
                  <th>Created</th>
                  <th>Next Step</th>
                  <th />
                </tr>
              </thead>
              <tbody className="tbl-body">
                {jobs.map((j) => {
                  const vendor = vendors[j.vendor_id];
                  const nextStep =
                    j.status === "draft" ? "Upload statement" :
                    j.status === "mapping_pending" ? "Confirm mapping" :
                    j.status === "review_pending" ? "Review & reconcile" : "Open";
                  return (
                    <tr key={j.id}>
                      <td className="text-slate-400 font-mono text-xs w-12">{j.id}</td>
                      <td>
                        <div className="font-semibold text-slate-800">{vendor?.organization || "—"}</div>
                        {vendor?.gl_group && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{vendor.gl_group}</div>
                        )}
                      </td>
                      <td><StatusBadge status={j.status} /></td>
                      <td className="text-slate-500 text-xs">{vendor?.country || "—"}</td>
                      <td className="text-slate-500 text-xs tabular-nums">{vendor?.credit_days ?? "—"}d</td>
                      <td className="text-slate-400 text-xs whitespace-nowrap">
                        {new Date(j.created_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="text-xs text-slate-500 italic">{nextStep}</td>
                      <td>
                        <div className="flex items-center gap-2 justify-end">
                          <Link
                            href={j.status === "review_pending" ? `/jobs/${j.id}/review-extraction` : `/jobs/${j.id}`}
                            className="btn-primary text-xs px-3 py-1.5"
                            style={{ height: "auto" }}
                          >
                            Open →
                          </Link>
                          <button
                            onClick={() => handleDelete(j.id, vendor?.organization || String(j.id))}
                            disabled={deletingId === j.id}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-40"
                            title="Delete job"
                          >
                            {deletingId === j.id ? (
                              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                              </svg>
                            ) : (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            )}
                          </button>
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
