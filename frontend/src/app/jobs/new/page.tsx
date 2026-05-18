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

  // .msg extraction preview (independent — no job needed)
  const [msgPreview, setMsgPreview] = useState<MsgPreviewResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const msgPreviewRef = useRef<HTMLDivElement>(null);

  // Job creation state
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Creating…");
  const [err, setErr] = useState<string | null>(null);
  const [jobPreview, setJobPreview] = useState<{ headers: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [pendingJobId, setPendingJobId] = useState<number | null>(null);
  const jobPreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [vs, ls, bs] = await Promise.all([
        api.get("/api/vendors?limit=10000"),
        api.get("/api/snapshots/logisys"),
        api.get("/api/snapshots/bt"),
      ]);
      setVendors(vs); setLogisys(ls); setBt(bs);
      if (ls.length) setLogId(ls[0].id);
      if (bs.length) setBtId(bs[0].id);
    })();
  }, []);

  useEffect(() => {
    if (msgPreview && msgPreviewRef.current) {
      msgPreviewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [msgPreview]);

  useEffect(() => {
    if (jobPreview && jobPreviewRef.current) {
      jobPreviewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [jobPreview]);

  const filtered = vendorQ
    ? vendors.filter(v => v.organization.toLowerCase().includes(vendorQ.toLowerCase())).slice(0, 50)
    : vendors.slice(0, 50);

  async function previewMsg() {
    if (!file) return;
    setPreviewBusy(true); setPreviewErr(null); setMsgPreview(null);
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
      setErr("Pick a vendor, both snapshots, and the SOA file.");
      return;
    }
    setBusy(true); setErr(null); setBusyLabel("Creating job…");
    try {
      const job = await api.post("/api/jobs", {
        vendor_id: vendorId, logisys_snapshot_id: logId, bt_snapshot_id: btId,
      });
      setBusyLabel("Converting .msg to Excel…");
      const fd = new FormData();
      fd.append("file", file);
      const mapping = await api.postForm(`/api/jobs/${job.id}/soa`, fd);
      setPendingJobId(job.id);
      setJobPreview({ headers: mapping.headers ?? [], rows: mapping.preview ?? [] });
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const selectedVendor = vendors.find(v => v.id === vendorId);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">New Reconciliation Job</h1>
        <p className="text-sm text-slate-500 mt-1">Pick a vendor, choose snapshots, and upload that vendor's SOA.</p>
      </div>

      <div className="card p-5 space-y-5">
        <div>
          <div className="label mb-1.5">Vendor</div>
          <input
            value={vendorQ}
            onChange={(e) => setVendorQ(e.target.value)}
            placeholder="Type to search…"
            className="w-full px-3 py-2 border rounded text-sm"
          />
          <div className="mt-2 border rounded max-h-56 overflow-y-auto bg-white">
            {filtered.map(v => (
              <button
                key={v.id}
                onClick={() => setVendorId(v.id)}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100 ${vendorId === v.id ? "bg-amber-50 border-l-4 border-amber-400" : ""}`}
              >
                <div className="font-medium">{v.organization}</div>
                <div className="text-xs text-slate-500">{v.country || "—"} · credit {v.credit_days}d · {v.gl_group || "—"}</div>
              </button>
            ))}
            {filtered.length === 0 && <div className="text-sm text-slate-500 px-3 py-3">No matches</div>}
          </div>
          {selectedVendor && (
            <div className="text-sm mt-2 text-slate-700">
              Selected: <span className="font-medium">{selectedVendor.organization}</span> · credit {selectedVendor.credit_days}d
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Logisys snapshot"
            value={logId}
            onChange={setLogId}
            options={logisys.map(s => ({ id: s.id, label: `${s.filename} (${s.row_count} rows)` }))}
          />
          <Select
            label="BT snapshot"
            value={btId}
            onChange={setBtId}
            options={bt.map(s => ({ id: s.id, label: `${s.filename} (${s.row_count} rows)` }))}
          />
        </div>

        <div>
          <div className="label mb-1.5">Vendor SOA (.msg)</div>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".msg"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setMsgPreview(null);
                setPreviewErr(null);
                setJobPreview(null);
                setPendingJobId(null);
              }}
              className="block text-sm"
            />
            {file && (
              <button
                onClick={previewMsg}
                disabled={previewBusy}
                className="px-3 py-1.5 text-xs border rounded hover:bg-slate-50 whitespace-nowrap"
              >
                {previewBusy ? "Extracting…" : "Preview extraction"}
              </button>
            )}
          </div>
          {file && <div className="text-xs text-slate-500 mt-1">{file.name}</div>}
          {previewErr && <div className="text-xs text-red-600 mt-1">{previewErr}</div>}
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <div>
          <button onClick={go} disabled={busy || jobPreview !== null} className="btn-primary">
            {busy ? busyLabel : "Create Job & Detect Mapping"}
          </button>
        </div>
      </div>

      {/* Standalone .msg extraction preview */}
      {msgPreview && (
        <div ref={msgPreviewRef} className="card p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold text-sm">Extraction preview — {msgPreview.row_count} row{msgPreview.row_count !== 1 ? "s" : ""} found</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Source: <span className="font-medium">{msgPreview.source_type}</span>
                {msgPreview.source_name ? ` · ${msgPreview.source_name}` : ""}
                {msgPreview.vendor_hint ? ` · Vendor hint: "${msgPreview.vendor_hint}"` : ""}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{msgPreview.source_details}</p>
            </div>
            <button
              onClick={() => setMsgPreview(null)}
              className="text-xs text-slate-400 hover:text-slate-700 ml-4"
            >
              ✕
            </button>
          </div>

          {msgPreview.rows.length === 0 ? (
            <p className="text-sm text-slate-500">No rows were extracted from this file.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-slate-200">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {PREVIEW_COLS.map(h => (
                      <th key={h} className="text-left px-3 py-2 bg-slate-800 text-white font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {msgPreview.rows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      {PREVIEW_COLS.map(h => (
                        <td key={h} className="px-3 py-1.5 border-b border-slate-100 whitespace-nowrap">
                          {row[h] ?? ""}
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

      {/* Post-job-creation mapping preview */}
      {jobPreview && pendingJobId && (
        <div ref={jobPreviewRef} className="card p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-sm">Extracted from .msg — verify before continuing</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing first {jobPreview.rows.length} row{jobPreview.rows.length !== 1 ? "s" : ""} extracted from the email.
              If the data looks correct, continue to confirm the column mapping.
            </p>
          </div>
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {jobPreview.headers.map(h => (
                    <th key={h} className="text-left px-3 py-2 bg-slate-800 text-white font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(jobPreview.rows ?? []).map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    {jobPreview.headers.map(h => (
                      <td key={h} className="px-3 py-1.5 border-b border-slate-100 whitespace-nowrap">
                        {String(row[h] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/jobs/${pendingJobId}`)}
              className="btn-primary"
            >
              Looks good — continue to mapping
            </button>
            <button
              onClick={() => { setJobPreview(null); setPendingJobId(null); }}
              className="px-4 py-2 text-sm border rounded hover:bg-slate-50"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string; value: number | null; onChange: (n: number | null) => void;
  options: { id: number; label: string }[];
}) {
  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="w-full px-3 py-2 border rounded text-sm bg-white"
      >
        <option value="">— select —</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}
