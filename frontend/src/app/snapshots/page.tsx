"use client";

import { useEffect, useState } from "react";
import { api, type Snapshot } from "@/lib/api";
import UploadBox from "@/components/UploadBox";

export default function SnapshotsPage() {
  const [logisys, setLogisys] = useState<Snapshot[]>([]);
  const [bt, setBt] = useState<Snapshot[]>([]);

  async function load() {
    const [l, b] = await Promise.all([
      api.get("/api/snapshots/logisys"),
      api.get("/api/snapshots/bt"),
    ]);
    setLogisys(l);
    setBt(b);
  }
  useEffect(() => { load(); }, []);

  async function uploadLogisys(f: File) {
    const fd = new FormData();
    fd.append("file", f);
    await api.postForm("/api/snapshots/logisys", fd);
    await load();
  }
  async function uploadBt(f: File) {
    const fd = new FormData();
    fd.append("file", f);
    await api.postForm("/api/snapshots/bt", fd);
    await load();
  }

  return (
    <div className="space-y-6 max-w-[1160px] mx-auto">

      {/* Page header */}
      <div className="pb-1">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.25)", color: "#2DD4BF" }}
          >
            Source files
          </span>
        </div>
        <h1 className="text-[28px] font-bold text-slate-900 tracking-[-0.02em]">Data Sources</h1>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">
          Upload accounting/TMS exports and pending invoice queue files used for reconciliation.
        </p>
      </div>

      {/* Upload cards */}
      <div className="grid md:grid-cols-2 gap-5">
        <UploadBox
          label="Books / TMS Export"
          hint="Upload the company books or TMS export used as the source of truth."
          onUpload={uploadLogisys}
        />
        <UploadBox
          label="Pending Invoice Queue"
          hint="Upload the pending approval or processing queue export."
          onUpload={uploadBt}
        />
      </div>

      {/* Snapshot lists */}
      <div className="grid md:grid-cols-2 gap-5">
        <SnapshotList
          title="Books / TMS Snapshots"
          items={logisys}
          accent="#2DD4BF"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
          }
        />
        <SnapshotList
          title="Pending Queue Snapshots"
          items={bt}
          accent="#F59E0B"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

function SnapshotList({
  title, items, accent, icon,
}: {
  title: string; items: Snapshot[]; accent: string; icon: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${accent}14`, border: `1px solid ${accent}25` }}
          >
            {icon}
          </div>
          <h2 className="text-[13px] font-semibold text-slate-800">{title}</h2>
        </div>
        <span className="text-[11px] font-semibold text-slate-400 bg-slate-100/80 px-2 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="tbl-head">
              <th>ID</th>
              <th>Filename</th>
              <th>Rows</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody className="tbl-body">
            {items.map((s) => (
              <tr key={s.id}>
                <td className="text-slate-400 font-mono text-xs">{s.id}</td>
                <td className="font-medium text-slate-800 max-w-[180px] truncate">{s.filename}</td>
                <td className="tabular-nums text-slate-500">{s.row_count.toLocaleString()}</td>
                <td className="text-slate-400 text-xs">{new Date(s.uploaded_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-base mb-2"
                      style={{ background: `${accent}10`, border: `1px solid ${accent}20`, color: accent }}
                    >
                      ↑
                    </div>
                    <div className="text-xs text-slate-400">None uploaded yet.</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
