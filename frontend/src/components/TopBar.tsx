"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/master": "Vendors",
  "/snapshots": "Data Sources",
  "/jobs/new": "New Reconciliation",
  "/jobs": "Recon Jobs",
  "/exceptions": "Exception Workbench",
  "/history": "History",
  "/reports": "Finance Reports",
};

function getTitle(path: string): string {
  if (path === "/") return "Dashboard";
  if (path.startsWith("/jobs/new")) return "New Reconciliation";
  if (path.startsWith("/jobs/")) return "Reconciliation Run";
  if (PAGE_TITLES[path]) return PAGE_TITLES[path];
  return "Cargomatiq";
}

export default function TopBar({ collapsed: _collapsed }: { collapsed: boolean }) {
  const path = usePathname() ?? "/";
  const title = getTitle(path);

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-8"
      style={{
        height: 68,
        background: "rgba(248,250,252,0.88)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(226,232,240,0.7)",
      }}
    >
      {/* Left — breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm min-w-0">
        <span className="text-slate-400 font-medium whitespace-nowrap">Cargomatiq</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="flex-shrink-0"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="font-semibold text-slate-800 whitespace-nowrap">{title}</span>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-3">
        {/* Demo workspace pill */}
        <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          Demo Workspace
        </span>

        {/* New Reconciliation */}
        <Link href="/jobs/new" className="btn-primary hidden sm:inline-flex">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Reconciliation
        </Link>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0 cursor-pointer select-none text-slate-500 hover:bg-slate-200 transition-colors"
          title="Demo User"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </div>
      </div>
    </header>
  );
}
