import { format, parseISO } from "date-fns";

export const CHANNELS: { value: string; label: string }[] = [
  { value: "in_person", label: "In Person" },
  { value: "show", label: "Show" },
  { value: "online", label: "Online" },
  { value: "other", label: "Other" },
];

export const SALE_PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit Card" },
];

export const CONDITIONS: string[] = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
];

// Trade-percent quick picks shared by the transaction default row and the
// per-row override selector. "custom" opens a free numeric entry.
export const TRADE_PERCENT_OPTIONS: { value: number; label: string }[] = [
  { value: 0.7, label: "70%" },
  { value: 0.8, label: "80%" },
  { value: 0.85, label: "85%" },
  { value: 0.9, label: "90%" },
];

export function channelLabel(value: string | null | undefined): string {
  return CHANNELS.find(c => c.value === value)?.label ?? "—";
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return "$" + Number(n).toFixed(2);
}

/**
 * Format a rounded print price (whole-dollar integer from Math.ceil).
 * Returns "Pending" when the price is null (priceSource === "pending").
 * Used in OutgoingPicker rows and the sale total auto-calc.
 */
export function fmtPrintPrice(p: number | null | undefined): string {
  if (p === null || p === undefined) return "Pending";
  return "$" + Number(p).toFixed(0);
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return format(parseISO(d), "MMM d, yyyy"); } catch { return d; }
}

export function fmtPercent(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${Math.round(Number(p) * 100)}%`;
}

// Cash taken in for a transaction. Straight sales count their full price;
// trade_plus_cash contributes its cash delta. Pure trades bring in no cash.
export function txnCashIn(tx: any): number {
  if (tx.type === "sale") return tx.cashAmount ?? 0;
  if (tx.paymentMethod === "trade_plus_cash") return tx.cashAmount ?? 0;
  return 0;
}

// Headline value shown in the list — sale price for sales, credit received
// (plus any cash delta) for trades.
export function txnTotalValue(tx: any): number {
  if (tx.type === "sale") {
    if (tx.cashAmount != null) return tx.cashAmount;
    return (tx.items ?? []).reduce((s: number, i: any) => s + (i.allocatedPrice ?? 0), 0);
  }
  const credit = (tx.incomingItems ?? []).reduce(
    (s: number, r: any) => s + (r.tradeCreditValue ?? 0) * (r.quantity ?? 1),
    0,
  );
  return credit + (tx.paymentMethod === "trade_plus_cash" ? tx.cashAmount ?? 0 : 0);
}

export function txnItemCount(tx: any): number {
  return (tx.items?.length ?? 0) + (tx.incomingItems?.length ?? 0);
}

export function pendingIncomingCount(tx: any): number {
  return (tx.incomingItems ?? []).filter((r: any) => r.status === "pending").length;
}
