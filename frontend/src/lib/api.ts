"use client";

const BASE = "";

async function handle(res: Response) {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      try { detail = await res.text(); } catch {}
    }
    throw new Error(detail);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res;
}

export const api = {
  get: (path: string) => fetch(`${BASE}${path}`, { cache: "no-store" }).then(handle),
  post: (path: string, body?: any) =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    }).then(handle),
  put: (path: string, body?: any) =>
    fetch(`${BASE}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    }).then(handle),
  patch: (path: string, body?: any) =>
    fetch(`${BASE}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    }).then(handle),
  postForm: (path: string, form: FormData) =>
    fetch(`${BASE}${path}`, { method: "POST", body: form, cache: "no-store" }).then(handle),
  delete: (path: string) =>
    fetch(`${BASE}${path}`, { method: "DELETE", cache: "no-store" }).then((res) => {
      if (res.status === 204) return null;
      return handle(res);
    }),
  fileUrl: (path: string) => `${BASE}${path}`,
};

export type Vendor = {
  id: number; organization: string; country: string | null;
  credit_days: number; gl_group: string | null;
};
export type Snapshot = { id: number; filename: string; uploaded_at: string; row_count: number };
export type JobBrief = {
  id: number; vendor_id: number; logisys_snapshot_id: number; bt_snapshot_id: number;
  status: string; residual: number | null; closed: boolean | null;
  created_at: string; updated_at: string;
};
export type MappingCandidate = { header: string; score: number };
export type MappingField = { header: string | null; score: number; candidates: MappingCandidate[] };
export type MappingSuggest = {
  headers: string[]; preview: any[]; suggested: Record<string, MappingField>; cached: boolean;
};
export type ReconLine = {
  id: number; status: string; match_method: string | null;
  vendor_inv_no: string | null; vendor_date: string | null;
  vendor_amount: number | null; vendor_currency: string | null; vendor_age_days: number | null;
  ajww_inv_no: string | null; ajww_txn_no: string | null;
  ajww_date: string | null; ajww_amount: number | null; diff: number | null;
  bt_label: string | null; bt_labels: string | null;
  bt_note: string | null; bt_link: string | null; bt_owner: string | null;
};
export type JobDetail = {
  id: number; status: string; residual: number | null; closed: boolean | null;
  summary: Record<string, any> | null;
  vendor: Vendor; logisys_snapshot: Snapshot; bt_snapshot: Snapshot;
  results: ReconLine[]; mapping: Record<string, any> | null; soa_filename: string | null;
};

export type ExtractionReviewRow = {
  id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  amount: number | null;
  currency: string;
  due_date: string | null;
  reference: string | null;
  description: string | null;
  confidence: string;
  ignored: boolean;
  source: string;
  edited: boolean;
};

export type ExtractionReviewData = {
  job_id: number;
  vendor_name: string;
  vendor_credit_days: number;
  soa_filename: string | null;
  document_source_type: string | null;
  document_source_name: string | null;
  document_source_details: string | null;
  document_download_url: string | null;
  row_count: number;
  rows: ExtractionReviewRow[];
  review_status: string | null;
};

export type ExceptionCase = {
  id: number;
  job_id: number;
  vendor: string;
  vendor_country: string | null;
  status: string;
  reason: string;
  recommended_action: string;
  invoice_no: string | null;
  invoice_date: string | null;
  currency: string | null;
  amount: number | null;
  diff: number | null;
  books_txn_no: string | null;
  queue_label: string | null;
  queue_owner: string | null;
  queue_link: string | null;
  age_days: number | null;
  state: "open" | "in_progress" | "waiting_vendor" | "resolved";
  owner: string | null;
  priority: "High" | "Medium" | "Low";
  due_date: string | null;
  note: string | null;
  resolution: string | null;
  created_at: string;
};

export type ExceptionSummary = {
  total: number;
  open: number;
  in_progress: number;
  waiting_vendor: number;
  resolved: number;
  high_priority: number;
  due_soon: number;
  total_amount: number;
};

export type ExceptionWorkbenchData = {
  summary: ExceptionSummary;
  cases: ExceptionCase[];
};

export function money(n: number | null | undefined) {
  if (n === null || n === undefined) return "";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
