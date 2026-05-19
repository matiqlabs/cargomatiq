type BadgeStyle = { bg: string; color: string; border: string };

const STYLES: Record<string, BadgeStyle> = {
  // Job-level
  draft:           { bg: "rgba(241,245,249,0.9)",  color: "#64748B", border: "#CBD5E1" },
  mapping_pending: { bg: "rgba(139,92,246,0.1)",   color: "#7C3AED", border: "#C4B5FD" },
  review_pending:  { bg: "rgba(59,130,246,0.1)",   color: "#1D4ED8", border: "#BFDBFE" },
  reconciled:      { bg: "rgba(45,212,191,0.1)",   color: "#0F766E", border: "#99F6E4" },
  // Recon line — match results
  matched:         { bg: "rgba(16,185,129,0.1)",   color: "#065F46", border: "#A7F3D0" },
  partial:         { bg: "rgba(245,158,11,0.1)",   color: "#92400E", border: "#FDE68A" },
  partial_match:   { bg: "rgba(245,158,11,0.1)",   color: "#92400E", border: "#FDE68A" },
  unmatched:       { bg: "rgba(239,68,68,0.1)",    color: "#991B1B", border: "#FECACA" },
  // Classifier outcomes
  ok_to_pay:       { bg: "rgba(45,212,191,0.1)",   color: "#0F766E", border: "#99F6E4" },
  not_due:         { bg: "rgba(14,165,233,0.1)",   color: "#0C4A6E", border: "#BAE6FD" },
  pending_in_bt:   { bg: "rgba(245,158,11,0.1)",   color: "#92400E", border: "#FDE68A" },
  to_be_booked:    { bg: "rgba(34,211,238,0.1)",   color: "#164E63", border: "#A5F3FC" },
  missing_in_vendor: { bg: "rgba(148,163,184,0.15)", color: "#475569", border: "#CBD5E1" },
  amount_dispute:  { bg: "rgba(239,68,68,0.1)",    color: "#991B1B", border: "#FECACA" },
  paid:            { bg: "rgba(16,185,129,0.1)",   color: "#065F46", border: "#A7F3D0" },
};

const FALLBACK: BadgeStyle = { bg: "rgba(226,232,240,0.7)", color: "#475569", border: "#CBD5E1" };

const LABELS: Record<string, string> = {
  draft:             "Draft",
  mapping_pending:   "Mapping Pending",
  review_pending:    "Review Pending",
  reconciled:        "Reconciled",
  matched:           "Matched",
  partial:           "Partial Match",
  partial_match:     "Partial Match",
  unmatched:         "Unmatched",
  ok_to_pay:         "OK to Pay",
  not_due:           "Not Due",
  pending_in_bt:     "Pending in Queue",
  to_be_booked:      "To Be Booked",
  missing_in_vendor: "Missing in Statement",
  amount_dispute:    "Amount Dispute",
  paid:              "Paid",
};

export default function StatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? FALLBACK;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        backgroundColor: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {LABELS[status] || status.replace(/_/g, " ")}
    </span>
  );
}
