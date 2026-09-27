"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Shipment } from "@/lib/api";

export default function ShipmentsPage() {
  const [items, setItems] = useState<Shipment[]>([]); const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.get("/api/operations/shipments").then(x => setItems(x.items)).catch(e => setError(e.message)); }, []);
  return <div className="space-y-6 max-w-[1160px] mx-auto"><div><p className="label">Operations</p><h1 className="text-3xl font-bold text-slate-900">Shipments</h1><p className="text-sm text-slate-500 mt-1">Canonical operational state, backed by source evidence.</p></div>{error && <div className="card p-3 text-red-600">{error}</div>}<div className="grid gap-4 md:grid-cols-2">{items.map(job => <Link href={`/shipments/${job.id}`} key={job.id} className="card card-hover p-5"><div className="flex justify-between"><div><p className="text-xs font-bold tracking-wider text-cyan-700">{job.job_code}</p><h2 className="font-semibold text-slate-900 mt-1">{job.canonical_facts.pol || "Origin"} → {job.canonical_facts.pod || "Destination"}</h2></div><span className="text-xs bg-slate-100 rounded-full px-2 py-1 h-fit capitalize">{job.transport_mode}</span></div><div className="grid grid-cols-2 gap-2 mt-4 text-xs text-slate-500"><span>Booking: {job.canonical_facts.booking_number || "—"}</span><span>Container: {job.canonical_facts.container_number || "—"}</span><span>ETD: {job.canonical_facts.etd || "—"}</span><span className={job.exception_count ? "text-red-600 font-semibold" : ""}>{job.exception_count} exception{job.exception_count === 1 ? "" : "s"}</span></div></Link>)}{!items.length && <div className="card p-10 text-center text-slate-400 md:col-span-2">Replay the Operations Inbox demo to create the first shipment.</div>}</div></div>;
}
