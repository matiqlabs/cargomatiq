"use client";

import { useRef, useState } from "react";

type Props = {
  label: string;
  hint?: string;
  accept?: string;
  onUpload: (file: File) => Promise<void>;
};

export default function UploadBox({ label, hint, accept = ".xlsx,.xlsm", onUpload }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function go(file: File) {
    setBusy(true);
    setErr(null);
    try {
      await onUpload(file);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-4">
        <div className="font-semibold text-slate-800 text-sm">{label}</div>
        {hint && <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{hint}</div>}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) go(f);
        }}
        onClick={() => ref.current?.click()}
        className="border-2 border-dashed rounded-xl py-8 px-4 text-center cursor-pointer transition-all duration-200"
        style={{
          borderColor: dragging ? "#22D3EE" : busy ? "rgba(226,232,240,0.8)" : "rgba(226,232,240,0.8)",
          background: dragging
            ? "rgba(34,211,238,0.04)"
            : busy
            ? "rgba(248,250,252,0.5)"
            : "rgba(248,250,252,0.4)",
          boxShadow: dragging ? "0 0 0 3px rgba(34,211,238,0.1)" : undefined,
        }}
      >
        <input
          ref={ref}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) go(f);
          }}
        />
        <div className="flex justify-center mb-2.5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.15)" }}
          >
            {busy ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#22D3EE" strokeWidth="2">
                <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="3" />
                <path className="opacity-75" fill="#22D3EE" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
              </svg>
            )}
          </div>
        </div>
        <div className="text-sm text-slate-600">
          {busy
            ? "Uploading…"
            : <>Drop file or <span className="font-semibold" style={{ color: "#22D3EE" }}>browse</span></>}
        </div>
        <div className="text-[11px] text-slate-400 mt-1">{accept}</div>
      </div>

      {err && (
        <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          {err}
        </div>
      )}
    </div>
  );
}
