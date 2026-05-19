"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Vendor, type Snapshot } from "@/lib/api";

type MsgPreviewResult = {
  vendor_hint: string;
  source_type: string;
  source_name: string;
  source_details: string;
  row_count: number;
  rows: { "INV Number": string; "INV Date": string; "Outstanding Amount": string }[];
};

const PREVIEW_COLS = ["INV Number", "INV Date", "Outstanding Amount"] as const;

const STEPS = [
  { n: 1, label: "Select Partner" },
  { n: 2, label: "Source Files" },
  { n: 3, label: "Vendor Statement" },
  { n: 4, label: "Create & Map" },
];

export default function NewJobPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [logisys, setLogisys] = useState<Snapshot[]>([]);
  const [bt, setBt] = useState<Snapshot[]>([]);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [vendorQ, setVendorQ] = useState("");
  const [logId, setLogId] = useState<number | null>(null);
  const [btId, setBtId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const [msgPreview, setMsgPreview] = useState<MsgPreviewResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const msgPreviewRef = useRef<HTMLDivElement>(null);

  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Creating...");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [vs, ls, bs] = await Promise.all([
        api.get("/api/vendors?limit=10000"),
        api.get("/api/snapshots/logisys"),
        api.get("/api/snapshots/bt"),
      ]);
      setVendors(vs);
      setLogisys(ls);
      setBt(bs);
      if (ls.length) setLogId(ls[0].id);
      if (bs.length) setBtId(bs[0].id);
    })();
  }, []);

  useEffect(() => {
    if (msgPreview && msgPreviewRef.current)
      msgPreviewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [msgPreview]);

  const filtered = vendorQ
    ? vendors.filter((v) => v.organization.toLowerCase().includes(vendorQ.toLowerCase())).slice(0, 50)
    : vendors.slice(0, 50);

  async function previewMsg() {
    if (!file) return;
    setPreviewBusy(true);
    setPreviewErr(null);
    setMsgPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await api.postForm("/api/jobs/msg-preview", fd);
      setMsgPreview(result);
    } catch (e: any) {
      setPreviewErr(e.message || String(e));
    } finally {
      setPreviewBusy(false);
    }
  }

  async function go() {
    if (!vendorId || !logId || !btId || !file) {
      setErr("Pick a partner, both source snapshots, and the vendor statement file.");
      return;
    }
    setBusy(true);
    setErr(null);
    setBusyLabel("Creating reconciliation run...");
    try {
      const job = await api.post("/api/jobs", {
        vendor_id: vendorId, logisys_snapshot_id: logId, bt_snapshot_id: btId,
      });
      setBusyLabel("Converting .msg to Excel...");
      const fd = new FormData();
      fd.append("file", file);
      await api.postForm(`/api/jobs/${job.id}/soa`, fd);
      router.push(`/jobs/${job.id}`);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const selectedVendor = vendors.find((v) => v.id === vendorId);
  const currentStep = !vendorId ? 1 : !logId || !btId ? 2 : !file ? 3 : 4;

  return (
    <div className="space-y-5 max-w-[960px] mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#8B5CF6" }}
            >
              Reconciliation workflow
            </span>
          </div>
          <h1 className="text-[26px] font-bold text-slate-900 tracking-[-0.02em]">New Reconciliation</h1>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            Select a partner, choose source files, and upload the vendor statement to detect matches and exceptions.
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STEPS.map((s, i) => {
          const done = currentStep > s.n;
          const active = currentStep === s.n;
          return (
            <div key={s.n} className="flex items-center gap-1.5">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  active ? "text-white" : done ? "text-teal-700" : "text-slate-400"
                }`}
                style={
                  active
                    ? { background: "#070B1A", border: "1px solid #1E293B", color: "white" }
                    : done
                    ? { background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.25)" }
                    : { background: "rgba(226,232,240,0.5)", border: "1px solid rgba(226,232,240,0.8)" }
                }
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={
                    done
                      ? { background: "#2DD4BF", color: "white" }
                      : active
                      ? { background: "#22D3EE", color: "#070B1A" }
                      : { background: "rgba(226,232,240,0.8)", color: "#94A3B8" }
                  }
                >
                  {done ? "✓" : s.n}
                </span>
                {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <div className="w-5 h-px" style={{ background: done ? "#2DD4BF" : "rgba(226,232,240,0.8)" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Two-column main layout */}
      <div className="grid grid-cols-[1fr_320px] gap-4 items-start">

        {/* Left — Step 1: Partner selection */}
        <div className="card p-6 space-y-3">
          <StepLabel n={1} done={!!vendorId} label="Select Partner" />
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ zIndex: 1 }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={vendorQ}
              onChange={(e) => setVendorQ(e.target.value)}
              placeholder="Search partners..."
              className="aurora-input"
              style={{ paddingLeft: "2.25rem" }}
            />
          </div>
          <div className="border border-slate-200/80 rounded-xl max-h-[300px] overflow-y-auto" style={{ background: "rgba(255,255,255,0.85)" }}>
            {filtered.map((v) => (
              <button
                key={v.id}
                onClick={() => setVendorId(v.id)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-slate-50/80 border-b border-slate-100/60 last:border-0 ${
                  vendorId === v.id ? "border-l-2 border-l-cyan-400 bg-cyan-50/60" : ""
                }`}
              >
                <div className="font-semibold text-slate-800">{v.organization}</div>
                <div className="text-xs text-slate-400 mt-0.5">{v.country || "—"} · credit {v.credit_days}d · {v.gl_group || "—"}</div>
              </button>
            ))}
            {filtered.length === 0 && <div className="text-sm text-slate-400 px-4 py-4">No matches found</div>}
          </div>
          {selectedVendor && (
            <div
              className="flex items-center gap-2 text-xs rounded-xl px-3 py-2"
              style={{ background: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.2)", color: "#2DD4BF" }}
            >
              <span>✓</span>
              <span className="font-semibold text-slate-700">{selectedVendor.organization}</span>
              <span className="text-slate-400">· credit {selectedVendor.credit_days}d</span>
            </div>
          )}
        </div>

        {/* Right — Steps 2, 3, 4 */}
        <div className="space-y-4">

          {/* Step 2 — Source files */}
          <div className="card p-5 space-y-3">
            <StepLabel n={2} done={!!(logId && btId)} label="Choose Source Files" />
            <StepSelect
              label="Books / TMS Snapshot"
              value={logId}
              onChange={setLogId}
              options={logisys.map((s) => ({ id: s.id, label: `${s.filename} (${s.row_count} rows)` }))}
            />
            <StepSelect
              label="Pending Queue Snapshot"
              value={btId}
              onChange={setBtId}
              options={bt.map((s) => ({ id: s.id, label: `${s.filename} (${s.row_count} rows)` }))}
            />
          </div>

          {/* Step 3 + 4 — Upload & Create */}
          <div className="card p-5 space-y-4">
            <div className="space-y-3">
              <StepLabel n={3} done={!!file} label="Upload Vendor Statement" />
              <div className="flex items-center gap-2 flex-wrap">
                <label className="btn-secondary cursor-pointer">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                  </svg>
                  Choose .msg file
                  <input
                    type="file"
                    accept=".msg"
                    className="hidden"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] || null);
                      setMsgPreview(null);
                      setPreviewErr(null);
                    }}
                  />
                </label>
                {file && (
                  <button onClick={previewMsg} disabled={previewBusy} className="btn-secondary">
                    {previewBusy ? "Extracting..." : "Preview"}
                  </button>
                )}
              </div>
              {file && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="truncate max-w-[220px]">{file.name}</span>
                </div>
              )}
              {previewErr && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {previewErr}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100" />

            <div className="space-y-3">
              <StepLabel n={4} done={false} label="Create & Detect Mapping" />
              {err && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {err}
                </div>
              )}
              <button onClick={go} disabled={busy} className="btn-primary w-full justify-center">
                {busy ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    {busyLabel}
                  </>
                ) : "Create Reconciliation"}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* MSG extraction preview */}
      {msgPreview && (
        <div ref={msgPreviewRef} className="card p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold text-sm text-slate-900">
                Extraction preview — {msgPreview.row_count} row{msgPreview.row_count !== 1 ? "s" : ""} found
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Source: <span className="font-medium">{msgPreview.source_type}</span>
                {msgPreview.source_name ? ` · ${msgPreview.source_name}` : ""}
                {msgPreview.vendor_hint ? ` · Partner hint: "${msgPreview.vendor_hint}"` : ""}
              </p>
              {msgPreview.source_details && <p className="text-xs text-slate-400 mt-0.5">{msgPreview.source_details}</p>}
            </div>
            <button onClick={() => setMsgPreview(null)} className="text-xs text-slate-400 hover:text-slate-600 ml-4">✕</button>
          </div>
          {msgPreview.rows.length === 0 ? (
            <p className="text-sm text-slate-500">No rows were extracted from this file.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {PREVIEW_COLS.map((h) => (
                      <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap text-white" style={{ background: "#070B1A" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {msgPreview.rows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                      {PREVIEW_COLS.map((h) => (
                        <td key={h} className="px-3 py-1.5 border-b border-slate-100 whitespace-nowrap">{row[h] ?? ""}</td>
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

function StepLabel({ n, done, label }: { n: number; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
        style={
          done
            ? { background: "#2DD4BF", color: "white" }
            : { background: "rgba(226,232,240,0.8)", color: "#64748B" }
        }
      >
        {done ? "✓" : n}
      </div>
      <span className="text-[13px] font-semibold text-slate-800">{label}</span>
    </div>
  );
}

function StepSelect({
  label, value, onChange, options,
}: {
  label: string; value: number | null; onChange: (n: number | null) => void;
  options: { id: number; label: string }[];
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="aurora-select"
      >
        <option value="">— select —</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}
