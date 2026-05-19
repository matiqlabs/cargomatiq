const LABELS: Record<string, string> = {
  ok_to_pay: "OK to Pay",
  not_due: "Not Due",
  pending_in_bt: "Pending in Queue",
  to_be_booked: "To Be Booked",
  missing_in_vendor: "Missing in Statement",
  amount_dispute: "Amount Dispute",
  paid: "Paid",
  reconciled: "Reconciled",
  mapping_pending: "Mapping Pending",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-semibold tracking-wide border status-${status}`}
    >
      {LABELS[status] || status}
    </span>
  );
}
