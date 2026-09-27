"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type OperationalTask } from "@/lib/api";

export default function TasksPage() {
  const [items, setItems] = useState<OperationalTask[]>([]);
  const load = () => api.get("/api/operations/tasks").then(x => setItems(x.items));
  useEffect(() => { load(); }, []);
  async function done(id: number) { await api.patch(`/api/operations/tasks/${id}`, { state: "completed" }); load(); }
  return <div className="space-y-6 max-w-[900px] mx-auto"><div><p className="label">Operations</p><h1 className="text-3xl font-bold text-slate-900">Tasks</h1><p className="text-sm text-slate-500 mt-1">Human actions created from operational exceptions.</p></div><div className="card overflow-hidden"><table className="w-full text-sm"><thead><tr className="tbl-head"><th>Task</th><th>Shipment</th><th>State</th><th /></tr></thead><tbody className="tbl-body">{items.map(task => <tr key={task.id}><td className="font-medium text-slate-800">{task.title}</td><td>{task.shipment_id ? <Link className="text-cyan-700" href={`/shipments/${task.shipment_id}`}>Shipment #{task.shipment_id}</Link> : "—"}</td><td className="capitalize">{task.state}</td><td>{task.state !== "completed" && <button className="text-cyan-700 font-semibold" onClick={() => done(task.id)}>Complete</button>}</td></tr>)}{!items.length && <tr><td colSpan={4} className="p-10 text-center text-slate-400">No tasks yet.</td></tr>}</tbody></table></div></div>;
}
