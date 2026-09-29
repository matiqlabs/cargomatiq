"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";
import { api, type InboxItem } from "@/lib/api";

const statusClass: Record<string, string> = {
  processed: "bg-emerald-50 text-emerald-700", processing: "bg-cyan-50 text-cyan-700",
  received: "bg-slate-100 text-slate-600", needs_review: "bg-amber-50 text-amber-700", failed: "bg-red-50 text-red-700",
};

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.get("/api/operations/inbox").then((x) => setItems(x.items)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function replay(file: File) {
    setBusy(true); setError(null);
    try { const form = new FormData(); form.append("file", file); await api.postForm("/api/operations/inbox/replay", form); load(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function demo() { setBusy(true); try { await api.post("/api/operations/demo/replay"); load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }

  return <div className="space-y-6 max-w-[1280px] mx-auto">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="label">Operations</p><h1 className="text-3xl font-bold text-slate-900">Inbox</h1><p className="text-sm text-slate-500 mt-1">Email evidence entering the shipment workspace.</p></div>
      <div className="flex gap-2"><button className="btn-secondary" disabled={busy} onClick={demo}>Replay demo</button><label className="btn-primary cursor-pointer">{busy ? "Processing…" : "Replay .eml"}<input className="hidden" type="file" accept=".eml" onChange={(e: ChangeEvent<HTMLInputElement>) => e.target.files?.[0] && replay(e.target.files[0])}/></label></div></div>
    {error && <div className="card p-3 text-red-600">{error}</div>}
    <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="tbl-head"><th>Sender & subject</th><th>Documents</th><th>Status</th><th>Match logic</th><th>Shipment</th></tr></thead><tbody className="tbl-body">{items.map((item) => <tr key={item.id}><td><div className="font-medium text-slate-800">{item.sender || "Unknown sender"}</div><div className="text-slate-500">{item.subject || "(no subject)"}</div></td><td><div className="text-slate-600">{item.attachments.length} attachment{item.attachments.length === 1 ? "" : "s"}</div><div className="text-xs text-slate-400">{item.documents.map(d => d.document_type.replaceAll("_", " ")).join(", ") || "No classified documents"}</div></td><td><span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusClass[item.status] || statusClass.received}`}>{item.status.replaceAll("_", " ")}</span>{item.error_message && <div className="text-xs text-red-500 mt-1">{item.error_message}</div>}</td><td><MatchLogic item={item} /></td><td>{item.shipment_id ? <Link className="text-cyan-700 font-semibold whitespace-nowrap" href={`/shipments/${item.shipment_id}`}>Open workspace →</Link> : <span className="text-amber-600">{item.resolution_status?.replaceAll("_", " ") || "Unresolved"}</span>}</td></tr>)}{!items.length && <tr><td colSpan={5} className="p-10 text-center text-slate-400">No email evidence yet. Replay the demo or upload an .eml file.</td></tr>}</tbody></table></div>
  </div>;
}

function MatchLogic({ item }: { item: InboxItem }) {
  const match = item.match;
  if (!match || match.decision === "needs_review") {
    return <div className="min-w-[180px]"><div className="font-medium text-amber-700">No automatic match</div><div className="text-xs text-slate-400">{match?.reason === "ambiguous_references" ? "More than one Shipment matched." : "No extractable reference was found."}</div></div>;
  }
  const target = match.target;
  const label = match.decision === "new_job" ? "No existing Shipment matched" : "Matched against";
  const references = match.candidates.flatMap((candidate) => candidate.references).length ? match.candidates.flatMap((candidate) => candidate.references) : match.extracted_references;
  return <div className="min-w-[205px]"><div className="font-medium text-slate-700">{label}</div>{target ? <Link href={`/shipments/${target.id}`} className="text-cyan-700 font-semibold text-xs">{target.job_code}</Link> : <span className="text-xs text-slate-400">Shipment unavailable</span>}{match.decision === "new_job" && <div className="text-xs text-emerald-600">Created from extracted reference</div>}{references.length > 0 && <details className="mt-1"><summary className="cursor-pointer text-xs text-slate-500">Show matching references</summary><div className="mt-1 text-xs text-slate-500 space-y-0.5">{references.map((reference, index) => <div key={`${reference.type}-${reference.value}-${index}`}><span className="capitalize">{reference.type.replaceAll("_", " ")}</span>: <span className="font-medium text-slate-700">{reference.value}</span></div>)}</div></details>}</div>;
}
