"use client";

import { useEffect, useState } from "react";
import { api, type Vendor } from "@/lib/api";
import UploadBox from "@/components/UploadBox";

export default function MasterPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    const v = await api.get(`/api/vendors?limit=200${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    setVendors(v);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q]);

  async function upload(file: File) {
    const form = new FormData();
    form.append("file", file);
    const r = await api.postForm("/api/master/upload", form);
    setStatus(`Vendor master uploaded: ${r.inserted} new, ${r.updated} updated.`);
    await load();
  }

  return (
    <div className="space-y-6 max-w-[1160px] mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)", color: "#22D3EE" }}
            >
              Freight finance workspace
            </span>
          </div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-[-0.02em]">Vendor Directory</h1>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            Manage vendors, credit terms, countries, and GL groups used during reconciliation.
          </p>
        </div>
      </div>

      {/* Upload + stats */}
      <div className="grid md:grid-cols-2 gap-4 items-start">
        <UploadBox
          label="Upload Vendor Master"
          hint="Upload the vendor master with organization, country, credit days, and GL group."
          onUpload={upload}
        />
        <div className="card p-6 flex flex-col gap-3 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 70%)" }}
          />
          <div className="label">Directory summary</div>
          <div className="flex items-end gap-2">
            <span className="text-5xl font-bold text-slate-900 tabular-nums leading-none">{vendors.length}</span>
            <span className="text-sm text-slate-500 mb-1">vendors loaded</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
            Upload an Excel vendor master to populate or refresh this directory. Each row should include
            organization name, country, credit days, and GL group.
          </p>
        </div>
      </div>

      {status && (
        <div
          className="card px-4 py-3 text-sm font-medium text-teal-700"
          style={{ background: "rgba(240,253,250,0.8)", borderColor: "rgba(94,234,212,0.4)" }}
        >
          {status}
        </div>
      )}

      {/* Vendor table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-4 rounded-full" style={{ background: "#22D3EE" }} />
            <h2 className="text-[13px] font-semibold text-slate-800">All Vendors</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search vendors..."
                className="aurora-input pl-8 w-52"
              />
            </div>
            <span className="text-[11px] font-medium text-slate-400">{vendors.length} shown</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="tbl-head">
                <th>Organization</th>
                <th>Country</th>
                <th>Credit Days</th>
                <th>GL Group</th>
              </tr>
            </thead>
            <tbody className="tbl-body">
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td className="font-semibold text-slate-800">{v.organization}</td>
                  <td className="text-slate-500">{v.country || "—"}</td>
                  <td className="tabular-nums text-slate-500">{v.credit_days}d</td>
                  <td className="text-slate-500">{v.gl_group || "—"}</td>
                </tr>
              ))}
              {vendors.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="flex flex-col items-center justify-center py-14 text-center">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-3"
                        style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.15)", color: "#22D3EE" }}
                      >
                        ⊙
                      </div>
                      <div className="text-sm font-semibold text-slate-700">No vendors yet</div>
                      <div className="text-xs text-slate-400 mt-1">
                        Upload the vendor master Excel file above to seed the directory.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
