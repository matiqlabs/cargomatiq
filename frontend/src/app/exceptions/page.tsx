"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, money, type ExceptionCase, type ExceptionWorkbenchData } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";

const STATES = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_vendor", label: "Waiting Vendor" },
  { value: "resolved", label: "Resolved" },
] as const;

const STATE_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_vendor: "Waiting Vendor",
  resolved: "Resolved",
};

const STATE_STYLES: Record<string, { bg: string; border: string; color: string }> = {
  open: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.18)", color: "#DC2626" },
  in_progress: { bg: "rgba(34,211,238,0.09)", border: "rgba(34,211,238,0.22)", color: "#0891B2" },
  waiting_vendor: { bg: "rgba(245,158,11,0.09)", border: "rgba(245,158,11,0.22)", color: "#D97706" },
  resolved: { bg: "rgba(45,212,191,0.09)", border: "rgba(45,212,191,0.22)", color: "#0F766E" },
};

function displayDate(value: string | null | undefined) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : String(value);
}

function stateBadge(state: string) {
  const style = STATE_STYLES[state] || STATE_STYLES.open;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.color }}
    >
      {STATE_LABELS[state] || state}
    </span>
  );
}

function priorityBadge(priority: string) {
  const style =
    priority === "High"
      ? { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.18)", color: "#DC2626" }
      : priority === "Medium"
      ? { bg: "rgba(245,158,11,0.09)", border: "rgba(245,158,11,0.22)", color: "#D97706" }
      : { bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.18)", color: "#475569" };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.color }}
    >
      {priority}
    </span>
  );
}

export default function ExceptionWorkbenchPage() {
  const [data, setData] = useState<ExceptionWorkbenchData | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    state: "open",
    owner: "",
    priority: "Medium",
    due_date: "",
    note: "",
    resolution: "",
  });

  async function load() {
    try {
      const payload: ExceptionWorkbenchData = await api.get("/api/exceptions");
      setData(payload);
      setSelectedId((current) => current ?? payload.cases[0]?.id ?? null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  const selected = useMemo(
    () => data?.cases.find((c) => c.id === selectedId) || null,
    [data, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setForm({
      state: selected.state,
      owner: selected.owner || "",
      priority: selected.priority,
      due_date: selected.due_date || "",
      note: selected.note || "",
      resolution: selected.resolution || "",
    });
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const rows = data?.cases || [];
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const stateMatch = stateFilter === "all" || row.state === stateFilter;
      if (!stateMatch) return false;
      if (!q) return true;
      return [
        row.vendor,
        row.invoice_no,
        row.status,
        row.owner,
        row.queue_label,
        row.books_txn_no,
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [data, stateFilter, search]);

  async function saveCase(next?: Partial<typeof form>) {
    if (!selected) return;
    const payload = { ...form, ...next };
    setSaving(true);
    setErr(null);
    try {
      const updated: ExceptionCase = await api.patch(`/api/exceptions/${selected.id}`, payload);
      setData((prev) => {
        if (!prev) return prev;
        const cases = prev.cases.map((item) => (item.id === updated.id ? updated : item));
        return { ...prev, cases, summary: recalcSummary(cases) };
      });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6 max-w-[1280px] mx-auto">
      <div className="flex items-start justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{ background: "rgba(34,211,238,0.10)", border: "1px solid rgba(34,211,238,0.24)", color: "#0891B2" }}
            >
              Exception operations
            </span>
          </div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-[-0.02em]">Exception Workbench</h1>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            Triage reconciliation exceptions, assign owners, track SLAs, and close actions from one operations queue.
          </p>
        </div>
        <button onClick={load} className="btn-secondary">Refresh</button>
      </div>

      {err && (
        <div className="card px-4 py-3 text-sm text-red-600" style={{ background: "rgba(254,242,242,0.8)", borderColor: "rgba(252,165,165,0.4)" }}>
          {err}
          <button onClick={() => setErr(null)} className="ml-3 text-red-400 hover:text-red-600">x</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Metric label="Open Value" value={money(summary?.total_amount)} accent="#0F172A" />
        <Metric label="Open" value={summary?.open ?? 0} accent="#DC2626" />
        <Metric label="In Progress" value={summary?.in_progress ?? 0} accent="#0891B2" />
        <Metric label="Waiting Vendor" value={summary?.waiting_vendor ?? 0} accent="#D97706" />
        <Metric label="High Priority" value={summary?.high_priority ?? 0} accent="#DC2626" />
        <Metric label="Due Soon" value={summary?.due_soon ?? 0} accent="#8B5CF6" />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.25fr)_420px] gap-5 items-start">
        <div className="space-y-4 min-w-0">
          <div className="card p-4">
            <div className="space-y-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendor, invoice, owner, status..."
                className="aurora-input w-full"
              />
              <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
                {STATES.map((item) => {
                  const active = stateFilter === item.value;
                  const count =
                    item.value === "all"
                      ? data?.cases.length ?? 0
                      : data?.cases.filter((c) => c.state === item.value).length ?? 0;
                  return (
                    <button
                      key={item.value}
                      onClick={() => setStateFilter(item.value)}
                      className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-150 flex-shrink-0"
                      style={
                        active
                          ? { background: "#070B1A", color: "white", border: "1px solid #1E293B" }
                          : { background: "rgba(255,255,255,0.9)", color: "#64748B", border: "1px solid rgba(226,232,240,0.9)" }
                      }
                    >
                      {item.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            {!data ? (
              <div className="py-16 text-center text-sm text-slate-400">Loading exceptions...</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <div className="text-sm font-semibold text-slate-700">No exception cases found</div>
                <p className="text-xs text-slate-400 mt-1">Run a reconciliation or change the filters above.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="tbl-head">
                      <th>Case</th>
                      <th>Vendor</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Owner</th>
                      <th className="text-right">Amount</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody className="tbl-body">
                    {filtered.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        className="cursor-pointer"
                        style={selectedId === row.id ? { background: "rgba(34,211,238,0.05)" } : undefined}
                      >
                        <td>
                          <div className="font-mono text-xs text-slate-400">EX-{row.id}</div>
                          <div className="font-semibold text-slate-800 mt-0.5">{row.invoice_no || "No invoice"}</div>
                          <div className="text-[11px] text-slate-400">Run #{row.job_id}</div>
                        </td>
                        <td>
                          <div className="font-semibold text-slate-800">{row.vendor}</div>
                          <div className="text-[11px] text-slate-400">{row.vendor_country || ""}</div>
                        </td>
                        <td>
                          <div className="space-y-1">
                            <StatusBadge status={row.status} />
                            {stateBadge(row.state)}
                          </div>
                        </td>
                        <td>{priorityBadge(row.priority)}</td>
                        <td className="text-xs text-slate-500">{row.owner || "Unassigned"}</td>
                        <td className="text-right tabular-nums font-semibold text-slate-700">
                          {row.currency ? `${row.currency} ` : ""}{money(row.amount)}
                        </td>
                        <td className="text-xs text-slate-500 whitespace-nowrap">{displayDate(row.due_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <aside className="card p-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          {!selected ? (
            <div className="py-16 text-center text-sm text-slate-400">Select an exception case.</div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono text-slate-400">EX-{selected.id} · Run #{selected.job_id}</div>
                    <h2 className="text-lg font-bold text-slate-900 mt-1">{selected.invoice_no || "No invoice number"}</h2>
                    <div className="text-sm text-slate-500 mt-0.5">{selected.vendor}</div>
                  </div>
                  {priorityBadge(selected.priority)}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <StatusBadge status={selected.status} />
                  {stateBadge(selected.state)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Info label="Amount" value={`${selected.currency || ""} ${money(selected.amount)}`.trim()} />
                <Info label="Difference" value={selected.diff !== null && selected.diff !== undefined ? money(selected.diff) : "-"} />
                <Info label="Invoice Date" value={displayDate(selected.invoice_date) || "-"} />
                <Info label="Books Txn" value={selected.books_txn_no || "-"} />
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4">
                <div className="label mb-1">Why It Needs Attention</div>
                <p className="text-sm text-slate-700 leading-relaxed">{selected.reason}</p>
                <div className="label mt-4 mb-1">Recommended Action</div>
                <p className="text-sm text-slate-700 leading-relaxed">{selected.recommended_action}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="label block mb-1">State</span>
                  <select
                    value={form.state}
                    onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                    className="aurora-select"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="waiting_vendor">Waiting Vendor</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </label>
                <label>
                  <span className="label block mb-1">Priority</span>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                    className="aurora-select"
                  >
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </label>
                <label>
                  <span className="label block mb-1">Owner</span>
                  <input
                    value={form.owner}
                    onChange={(e) => setForm((p) => ({ ...p, owner: e.target.value }))}
                    className="aurora-input"
                    placeholder="AP owner"
                  />
                </label>
                <label>
                  <span className="label block mb-1">Target Date</span>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                    className="aurora-input"
                  />
                </label>
              </div>

              <label className="block">
                <span className="label block mb-1">Action Note</span>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                  className="aurora-input min-h-[84px] resize-y"
                  placeholder="Capture follow-up, dispute evidence, or booking request details."
                />
              </label>

              <label className="block">
                <span className="label block mb-1">Resolution</span>
                <textarea
                  value={form.resolution}
                  onChange={(e) => setForm((p) => ({ ...p, resolution: e.target.value }))}
                  className="aurora-input min-h-[72px] resize-y"
                  placeholder="How was this case closed?"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => saveCase()} disabled={saving} className="btn-primary">
                  {saving ? "Saving..." : "Save Case"}
                </button>
                <button
                  onClick={() => saveCase({ state: "in_progress" })}
                  disabled={saving}
                  className="btn-secondary"
                >
                  Start Work
                </button>
                <button
                  onClick={() => saveCase({ state: "resolved", resolution: form.resolution || "Resolved from Exception Workbench." })}
                  disabled={saving}
                  className="btn-secondary"
                  style={{ color: "#0F766E" }}
                >
                  Mark Resolved
                </button>
                {selected.queue_link && (
                  <a href={selected.queue_link} target="_blank" rel="noreferrer" className="btn-secondary">
                    Open Queue
                  </a>
                )}
                <Link href={`/jobs/${selected.job_id}`} className="btn-secondary">View Run</Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="card p-4">
      <div className="label mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: accent }}>{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3">
      <div className="label mb-1">{label}</div>
      <div className="text-sm font-semibold text-slate-800 truncate">{value}</div>
    </div>
  );
}

function recalcSummary(cases: ExceptionCase[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 2);
  return cases.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.state === "open") acc.open += 1;
      if (item.state === "in_progress") acc.in_progress += 1;
      if (item.state === "waiting_vendor") acc.waiting_vendor += 1;
      if (item.state === "resolved") acc.resolved += 1;
      if (item.priority === "High" && item.state !== "resolved") acc.high_priority += 1;
      if (item.due_date && item.state !== "resolved") {
        const due = new Date(`${item.due_date.slice(0, 10)}T00:00:00`);
        if (!Number.isNaN(due.getTime()) && due <= soon) acc.due_soon += 1;
      }
      if (item.state !== "resolved") acc.total_amount += item.amount || 0;
      acc.total_amount = Math.round(acc.total_amount * 100) / 100;
      return acc;
    },
    { total: 0, open: 0, in_progress: 0, waiting_vendor: 0, resolved: 0, high_priority: 0, due_soon: 0, total_amount: 0 },
  );
}
