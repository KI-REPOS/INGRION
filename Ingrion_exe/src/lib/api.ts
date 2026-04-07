/**
 * INGRION API Client
 * All RPC calls to the blockchain node
 */
import type {
  NodeStatus, AccountBalance, RHPStatus, ValidatorInfo,
  ValidatorScore, SlashProposal, IPOBids, FrozenAccount,
  Mandate, Contract, AuditInfo, PeerInfo, StakeRewards,
  Transaction, Block, StockHolder
} from "@/types";
import { useAppStore } from "@/store";

/**
 * Normalizes Go's RHPMetadata JSON field names to consistent TS aliases.
 * Go sends: companyAddr, qibPercentage, nibPercentage, retailPercentage
 * Frontend uses: companyAddress, qibPct, nibPct, retailPct
 */
function normalizeRHP(raw: any): RHPStatus {
  return {
    ...raw,
    companyAddr: raw.companyAddr ?? "",
    companyAddress: raw.companyAddr ?? raw.companyAddress ?? "",
    qibPercentage: raw.qibPercentage ?? 0,
    nibPercentage: raw.nibPercentage ?? 0,
    retailPercentage: raw.retailPercentage ?? 0,
    qibPct: raw.qibPercentage ?? raw.qibPct ?? 0,
    nibPct: raw.nibPercentage ?? raw.nibPct ?? 0,
    retailPct: raw.retailPercentage ?? raw.retailPct ?? 0,
  };
}

function getConfig() {
  const store = useAppStore.getState();
  return {
    baseUrl: store.config?.node.url || "http://127.0.0.1:4001",
    apiKey: store.config?.node.apiKey || "",
    address: store.keystore?.address || "",
  };
}

async function apiGet<T>(path: string, requiresRole = false): Promise<T> {
  const { baseUrl, apiKey, address } = getConfig();
  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
  };
  if (requiresRole && address) {
    headers["X-Caller-Address"] = address;
  }

  const resp = await fetch(`${baseUrl}${path}`, { headers });
  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(err || `HTTP ${resp.status}`);
  }
  return resp.json();
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const { baseUrl, apiKey, address } = getConfig();
  const resp = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      "X-Caller-Address": address,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(err || `HTTP ${resp.status}`);
  }
  return resp.json();
}

// ---- Status & Network ----
export const getStatus = () => apiGet<NodeStatus>("/status");
export const getNetwork = () => apiGet<{ peers: PeerInfo[] }>("/network");
export const getValidators = () => apiGet<{ validators: ValidatorInfo[] }>("/validators");

// ---- Account ----
export const getBalance = (address: string) =>
  apiGet<AccountBalance>(`/api/balance/${address}`, true);
export const getTxHistory = (address: string, page = 0, limit = 50) =>
  apiGet<{ transactions: Transaction[] }>(`/api/account/txhistory/${address}?page=${page}&limit=${limit}`, true);

// ---- Blocks ----
export const getBlock = (height: number) =>
  apiGet<Block>(`/api/block/${height}`, true);
export const getMempool = () =>
  apiGet<{ transactions: Transaction[] }>("/api/mempool", true);

// ---- Stocks / IPO ----
export const getRHPStatus = async (stock: string): Promise<RHPStatus> => {
  const raw = await apiGet<any>(`/api/rhp/${stock}/status`, true);
  return normalizeRHP(raw);
};
// All RHPs regardless of status — for DRHP/RHP browser
export const getRHPAll = async (): Promise<{ count: number; rhps: RHPStatus[] }> => {
  const raw = await apiGet<{ count: number; rhps: any[] }>("/api/rhp/all", true);
  return { count: raw.count, rhps: (raw.rhps || []).map(normalizeRHP) };
};
// All bidding-phase IPOs — for IPO Bidding page discovery
export const getIPOActive = async (): Promise<{ count: number; ipos: RHPStatus[] }> => {
  const raw = await apiGet<{ count: number; ipos: any[] }>("/api/ipo/active", true);
  return { count: raw.count, ipos: (raw.ipos || []).map(normalizeRHP) };
};
export const getIPOLive = (stock: string) =>
  apiGet<{ subscriptionRate: number; bids: Record<string, number>; totalBids: number; bidsReceived: number; priceBandLower: number; priceBandUpper: number; blocksRemaining: number; biddingEndSlot: number }>(`/api/ipo-live/${stock}`, true);
export const getIPOBids = (stock: string) =>
  apiGet<IPOBids>(`/api/ipo/${stock}/bids`, true);
export const getAllocation = (stock: string) =>
  apiGet<{
    stock: string; cutoffPrice: number; totalShares: number; allocated: number; status: string;
    categoryQuotas: Record<string, { reservedShares: number; demandShares: number; allocatedShares: number }>;
    allocations: Array<{ bidder: string; category: string; bidPrice: number; bidShares: number; allocShares: number; amountToPay: number; refundAmount: number }>;
  }>(`/api/allocation/${stock}`, true);
export const getStockHolders = (stock: string) =>
  apiGet<{ holders: StockHolder[]; totalSupply: number }>(`/api/stocks/holders/${stock}`, true);
export const getAllIPOs = () =>
  apiGet<{ ipos: RHPStatus[] }>("/api/ipo/all", true);
// Portfolio: node returns { address, balancePaise, blockedPaise, stocks: {SYMBOL: shares} }
export const getPortfolio = (address: string) =>
  apiGet<{ address: string; balancePaise: number; blockedPaise: number; stocks: Record<string, number> }>(`/api/stocks/portfolio/${address}`, true);
// Per-stock price: { stock, pricePaise, atHeight }
export const getStockPrice = (stock: string) =>
  apiGet<{ stock: string; pricePaise: number; atHeight: number }>(`/api/stocks/price/${stock}`, true);

// ---- Regulator ----
export const getPendingRHPs = () =>
  apiGet<{ count: number; rhps: RHPStatus[] }>("/api/rhp/pending", true);

// DRHPs awaiting regulator review — stocks with a drhp_ key but no approved rhp_ yet
export const getDRHPPending = () =>
  apiGet<{ count: number; drhps: Array<{
    stock: string;
    companyAddr: string;
    payload: string;   // raw JSON string of DRHP metadata
    rhpStatus: string; // "" | "pending" | "bidding" | etc.
    rejected: boolean;
  }> }>("/api/drhp/pending", true);
export const getContracts = () =>
  apiGet<{ contracts: Contract[] }>("/api/contracts", true);
export const getFrozenAccounts = () =>
  apiGet<{ frozen: FrozenAccount[] }>("/api/frozen-accounts", true);
export const getAudit = (address: string) =>
  apiGet<AuditInfo>(`/api/audit/${address}`, true);
export const getActiveMandates = () =>
  apiGet<{ mandates: Mandate[] }>("/api/mandate/active", true);

// ---- Validator ----
export const getValidatorScore = (address: string) =>
  apiGet<ValidatorScore>(`/api/validator/${address}/score`, true);
export const getValidatorHistory = (address: string) =>
  apiGet<{ history: Array<{ date: string; proposed: number; missed: number }> }>(`/api/validator/${address}/history`, true);
export const getSlashProposals = () =>
  apiGet<{ proposals: SlashProposal[] }>("/api/slash/proposals", true);
export const getStakeRewards = (address: string) =>
  apiGet<StakeRewards>(`/api/stake/rewards/${address}`, true);

// ---- Submit Transaction ----
export async function submitTx(tx: Record<string, unknown>): Promise<{ status: string; txHash?: string; error?: string }> {
  const { baseUrl, apiKey, address } = getConfig();
  const resp = await fetch(`${baseUrl}/api/submitTx`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      "X-Caller-Address": address,
    },
    body: JSON.stringify(tx),
  });

  // Node returns plain text on errors (http.Error), JSON on success
  const contentType = resp.headers.get("content-type") || "";
  if (!resp.ok) {
    const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
    throw new Error(errText.trim() || `HTTP ${resp.status}`);
  }

  if (contentType.includes("application/json")) {
    const data = await resp.json();
    if (!data.status?.toLowerCase().includes("accepted")) {
      throw new Error(data.error || data.message || "Transaction rejected");
    }
    return data;
  }

  // Fallback: treat non-JSON 2xx as accepted
  return { status: "accepted" };
}

// ---- Test Connection ----
export async function testConnection(url: string, apiKey: string): Promise<NodeStatus> {
  const resp = await fetch(`${url}/status`, {
    headers: { "X-API-Key": apiKey },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`Node returned HTTP ${resp.status}`);
  return resp.json();
}