import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function paiseToCurrency(paise: number): string {
  const inr = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(inr);
}

export function formatAddress(address: string): string {
  if (!address || address.length < 14) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

export function txTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    tnx_sendINR: "Send INR",
    tnx_bid_stock: "IPO Bid",
    tnx_buy_stock: "Buy Stock",
    tnx_sell_stock: "Sell Stock",
    tnx_transfer_stock: "Transfer Stock",
    tnx_upload_drhp: "Upload DRHP",
    tnx_upload_rhp: "Upload RHP",
    tnx_update_rhp: "Update RHP",
    tnx_initiate_stock: "Initiate Stock",
    tnx_open_ipo: "Open IPO",
    tnx_cancel_ipo: "Cancel IPO",
    tnx_allocate_ipo: "Allocate IPO",
    tnx_dividend: "Dividend",
    tnx_corporate_action: "Corporate Action",
    tnx_new_contract: "New Contract",
    tnx_vote_contract: "Vote Contract",
    tnx_reject_drhp: "Reject DRHP",
    tnx_freeze_account: "Freeze Account",
    tnx_unfreeze_account: "Unfreeze Account",
    tnx_flag_account: "Flag Account",
    tnx_mandate: "Issue Mandate",
    tnx_update_stake: "Update Stake",
    tnx_slash_proposal: "Slash Proposal",
    tnx_vote_slash: "Vote Slash",
    VALIDATOR_JOIN: "Validator Join",
    VALIDATOR_EXIT: "Validator Exit",
  };
  return labels[type] || type;
}

export function ipoStatusLabel(status: string): { label: string; color: "green" | "amber" | "blue" | "red" | "gray" } {
  const map: Record<string, { label: string; color: "green" | "amber" | "blue" | "red" | "gray" }> = {
    pending: { label: "Pending", color: "amber" },
    bidding: { label: "Bidding Open", color: "green" },
    allocating: { label: "Allocating", color: "blue" },
    completed: { label: "Completed", color: "gray" },
    cancelled: { label: "Cancelled", color: "red" },
    rejected: { label: "Rejected", color: "red" },
  };
  return map[status] ?? { label: status, color: "gray" };
}
