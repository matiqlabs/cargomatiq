"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, money, type JobBrief, type Vendor, type Snapshot } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";

export default function Dashboard() {
  const [jobs, setJobs] = useState<JobBrief[]>([]);
  const [vendors, setVendors] = useState<Record<number, Vendor>>({});
  const [logisys, setLogisys] = useState<Snapshot[]>([]);
  const [bt, setBt] = useState<Snapshot[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [j, vs, ls, bs] = await Promise.all([
          api.get("/api/jobs"),
          api.get("/api/vendors?limit=10000"),
          api.get("/api/snapshots/logisys"),
          api.get("/api/snapshots/bt"),
        ]);
        setJobs(j);
        setLogisys(ls);
        setBt(bs);
        const m: Record<number, Vendor> = {};
        for (const v of vs as Vendor[]) m[v.id] = v;
        setVendors(m);
      } catch (e: any) {
        setErr(e.message);
      }
    })();
  }, []);

  const open = jobs.filter((j) => j.status !== "reconciled");
  const closed = jobs.filter((j) => j.status === "reconciled");
  const residualUnsolved = closed.filter((j) => !j.closed);

  return (
    <div className="space-y-6 max-w-[1160px] mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{
                background: "rgba(45,212,191,0.1)",
                border: "1px solid rgba(45,212,191,0.25)",
                color: "#2DD4BF",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              Live workspace
            </span>
          </div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-[-0.02em]">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-lg leading-relaxed">
            Monitor reconciliation runs, open exceptions, source files, and payment-ready items across your freight finance workflow.
          </p>
        </div>
      </div>

      {err && (
        <div className="card px-4 py-3 text-sm text-red-600" style={{ background: "rgba(254,242,242,0.8)", borderColor: "rgba(252,165,165,0.5)" }}>
          {err}
        </div>
      )}

      {/* ── Bento row 1: Hero + 4 stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        {/* Hero card — 2 cols */}
        <div
          className="card col-span-2 p-6 flex flex-col justify-between overflow-hidden relative"
          style={{ minHeight: 160 }}
        >
          {/* Decorative aurora orb */}
          <div
            aria-hidden
            className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 70%)" }}
          />
          <div
            aria-hidden
            className="absolute bottom-0 right-16 w-24 h-24 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)" }}
          />
          <div className="relative">
            <div className="label mb-1.5">Freight finance overview</div>
            <h2 className="text-[18px] font-bold text-slate-900 tracking-tight">
              {jobs.length === 0
                ? "No reconciliation runs yet"
                : `${open.length} open · ${closed.length} reconciled`}
            </h2>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              {residualUnsolved.length > 0
                ? `${residualUnsolved.length} run${residualUnsolved.length !== 1 ? "s" : ""} have an unresolved residual gap.`
                : closed.length > 0
                ? "All reconciled runs are balanced."
                : "Upload vendor data and start a reconciliation to begin."}
            </p>
          </div>
        </div>

        <AuroraStatCard
          label="Vendors"
          value={Object.keys(vendors).length}
          href="/master"
          accent="#22D3EE"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          }
        />
        <AuroraStatCard
          label="Books Snapshots"
          value={logisys.length}
          href="/snapshots"
          accent="#2DD4BF"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          }
        />
      </div>

      {/* ── Row 2: 4 more stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AuroraStatCard
          label="Queue Snapshots"
          value={bt.length}
          href="/snapshots"
          accent="#F59E0B"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
          }
        />
        <AuroraStatCard
          label="Recon Runs"
          value={jobs.length}
          href="/"
          accent="#8B5CF6"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          }
        />
        <AuroraStatCard
          label="Open Exceptions"
          value={open.length}
          href="/"
          accent="#EF4444"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          }
        />
        <AuroraStatCard
          label="Unresolved Gaps"
          value={residualUnsolved.length}
          href="/"
          accent="#F59E0B"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          }
        />
      </div>

      {/* ── Row 3: Two bento section cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <BentoSection
          title="Open & Pending Runs"
          count={open.length}
          accentColor="#F59E0B"
        >
          {open.length === 0 ? (
            <AuroraEmpty icon="✓" accent="#2DD4BF" title="All clear" desc="No runs currently need attention." />
          ) : (
            <div className="max-h-[270px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10"><tr className="tbl-head">
                  <th>Vendor</th><th>Status</th><th>Created</th><th />
                </tr></thead>
                <tbody className="tbl-body">
                  {open.map((j) => (
                    <tr key={j.id}>
                      <td className="font-medium text-slate-800">{vendors[j.vendor_id]?.organization || "—"}</td>
                      <td><StatusBadge status={j.status} /></td>
                      <td className="text-slate-400 text-xs">{new Date(j.created_at).toLocaleDateString()}</td>
                      <td>
                        <Link href={`/jobs/${j.id}`} className="text-xs font-semibold transition-colors" style={{ color: "#22D3EE" }}>
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </BentoSection>

        <BentoSection
          title="Recently Reconciled"
          count={closed.length}
          accentColor="#2DD4BF"
        >
          {closed.length === 0 ? (
            <AuroraEmpty
              icon="⊙"
              accent="#8B5CF6"
              title="No reconciled runs yet"
              desc="Complete a reconciliation to see results here."
            />
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="tbl-head">
                <th>Vendor</th><th>Residual Gap</th><th>Closed</th><th />
              </tr></thead>
              <tbody className="tbl-body">
                {closed.slice(0, 5).map((j) => (
                  <tr key={j.id}>
                    <td className="font-medium text-slate-800">{vendors[j.vendor_id]?.organization || "—"}</td>
                    <td className={`font-semibold tabular-nums ${j.closed ? "text-teal-600" : "text-red-500"}`}>
                      {money(j.residual)}
                    </td>
                    <td>
                      {j.closed
                        ? <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">YES</span>
                        : <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">NO</span>
                      }
                    </td>
                    <td>
                      <Link href={`/jobs/${j.id}`} className="text-xs font-semibold transition-colors" style={{ color: "#22D3EE" }}>
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </BentoSection>
      </div>

      {/* Residual gap alert */}
      {residualUnsolved.length > 0 && (
        <BentoSection title="Unresolved Residual Gaps" count={residualUnsolved.length} accentColor="#EF4444">
          <table className="w-full text-sm">
            <thead><tr className="tbl-head">
              <th>#</th><th>Vendor</th><th>Residual Gap</th><th />
            </tr></thead>
            <tbody className="tbl-body">
              {residualUnsolved.map((j) => (
                <tr key={j.id}>
                  <td className="text-slate-400 font-mono text-xs">{j.id}</td>
                  <td className="font-medium text-slate-800">{vendors[j.vendor_id]?.organization || "—"}</td>
                  <td className="text-red-500 font-semibold tabular-nums">{money(j.residual)}</td>
                  <td>
                    <Link href={`/jobs/${j.id}`} className="text-xs font-semibold" style={{ color: "#22D3EE" }}>
                      Review →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </BentoSection>
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function AuroraStatCard({
  label, value, href, icon, accent,
}: {
  label: string; value: number; href: string; icon: React.ReactNode; accent: string;
}) {
  return (
    <Link
      href={href}
      className="card card-hover p-5 flex flex-col gap-3 group"
    >
      <div className="flex items-center justify-between">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}15`, border: `1px solid ${accent}25`, color: accent }}
        >
          {icon}
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-100 transition-opacity">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
      <div>
        <div className="text-[30px] font-bold text-slate-900 leading-none tabular-nums">{value}</div>
        <div className="text-[11px] text-slate-500 mt-1 font-medium">{label}</div>
      </div>
      {/* Accent rail at bottom */}
      <div className="h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(90deg, ${accent} 0%, transparent 100%)` }} />
    </Link>
  );
}

function BentoSection({
  title, count, children, accentColor,
}: {
  title: string; count: number; children: React.ReactNode; accentColor: string;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-4 rounded-full" style={{ background: accentColor }} />
          <h2 className="text-[13px] font-semibold text-slate-800">{title}</h2>
        </div>
        <span className="text-[11px] font-semibold text-slate-400 bg-slate-100/80 px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function AuroraEmpty({
  icon, title, desc, cta, accent,
}: {
  icon: string; title: string; desc: string;
  cta?: { label: string; href: string };
  accent: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg mb-3"
        style={{ background: `${accent}12`, border: `1px solid ${accent}20`, color: accent }}
      >
        {icon}
      </div>
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">{desc}</div>
      {cta && (
        <Link href={cta.href} className="mt-3 text-xs font-semibold transition-colors" style={{ color: "#22D3EE" }}>
          {cta.label}
        </Link>
      )}
    </div>
  );
}
