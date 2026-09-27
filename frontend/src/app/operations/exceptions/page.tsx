"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type OperationalException } from "@/lib/api";

export default function OperationsExceptionsPage() {
  const [items, setItems] = useState<OperationalException[]>([]); const [error, setError] = useState<string | null>(null);
  const load = () => api.get("/api/operations/exceptions").then(x => setItems(x.items)).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  async function resolve(id: number) { await api.patch(`/api/operations/exceptions/${id}`, { state: "resolved" }); load(); }
  return <div className="space-y-6 max-w-[1160px] mx-auto"><div><p className="label">Operations</p><h1 className="text-3xl font-bold text-slate-900">Exceptions</h1><p className="text-sm text-slate-500 mt-1">Cross-document issues with source evidence and assigned action.</p></div>{error && <div className="card p-3 text-red-600">{error}</div>}<div className="space-y-3">{items.map(item => <div key={item.id} className="card p-5 flex flex-wrap gap-4 justify-between"><div><div className="flex gap-2 items-center"><span className={`text-xs font-bold px-2 py-1 rounded-full ${item.severity === "High" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{item.severity}</span><h2 className="font-semibold text-slate-900">{item.title}</h2></div><p className="text-sm text-slate-500 mt-2">{item.description}</p><p className="text-xs text-slate-400 mt-2">{item.evidence.length} linked evidence observation{item.evidence.length === 1 ? "" : "s"}</p></div><div className="flex items-center gap-3">{item.shipment_id && <Link className="text-cyan-700 text-sm font-semibold" href={`/shipments/${item.shipment_id}`}>Open shipment</Link>}{item.state !== "resolved" && <button className="btn-secondary" onClick={() => resolve(item.id)}>Resolve</button>}</div></div>)}{!items.length && <div className="card p-10 text-center text-slate-400">No operational exceptions.</div>}</div></div>;
}
