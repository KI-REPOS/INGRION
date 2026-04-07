// ============================================================
// INGRION - Global Type Definitions
// ============================================================

export type Role = "user" | "validator" | "regulator" | "company";
export type Category = "qib" | "nib" | "retail" | null;

// ---- Keystore ----
export interface Keystore {
  version: "1";
  address: string; // hex Ed25519 public key
  role: Role;
  category: Category;
  encrypted_key: string; // base64 AES-256-GCM ciphertext
  salt: string;          // base64 32-byte random salt
  iv: string;            // base64 12-byte GCM nonce
  pbkdf2_iterations: number;
  created_at: string;
}

// ---- Config ----
export interface NodeConfig {
  url: string;
  apiKey: string;
  backupUrls?: string[];
}

export interface AppConfig {
  node: NodeConfig;
  theme: "light" | "dark" | "system";
  refreshInterval: 5 | 10 | 30;
  largeTransferThreshold: number; // INR
  notifyBlocks: boolean;
  notifyTransfers: boolean;
  notifyIPO: boolean;
}

// ---- Blockchain Types ----
export interface Transaction {
  type: TxType;
  from: string;
  to?: string;
  amountPaise?: number;
  nonce: number;
  stock?: string;
  bidPricePaise?: number;
  bidShares?: number;
  category?: string;
  rhpHash?: string;
  meta?: Record<string, string>;
  timestamp: number;
  sig: string;
  shares?: number;
  pricePaise?: number;
  reason?: string;
  mandateType?: string;
  actionType?: string;
  ratio?: string;
  proposalId?: string;
}

export type TxType =
  | "tnx_sendINR"
  | "tnx_bid_stock"
  | "tnx_buy_stock"
  | "tnx_sell_stock"
  | "tnx_transfer_stock"
  | "tnx_upload_drhp"
  | "tnx_upload_rhp"
  | "tnx_update_rhp"
  | "tnx_initiate_stock"
  | "tnx_open_ipo"
  | "tnx_cancel_ipo"
  | "tnx_allocate_ipo"
  | "tnx_dividend"
  | "tnx_corporate_action"
  | "tnx_new_contract"
  | "tnx_vote_contract"
  | "tnx_reject_drhp"
  | "tnx_freeze_account"
  | "tnx_unfreeze_account"
  | "tnx_flag_account"
  | "tnx_mandate"
  | "tnx_update_stake"
  | "tnx_slash_proposal"
  | "tnx_vote_slash"
  | "VALIDATOR_JOIN"
  | "VALIDATOR_EXIT";

export interface Block {
  header: {
    prevHash: string;
    proposer: string;
    height: number;
    txCount: number;
    timestamp: number;
    gasUsed: number;
    stateRoot: string;
    validatorRoot: string;
    allocCount: number;
    allocCursor?: string;
  };
  transactions: Transaction[];
  allocationOps?: AllocationOperation[];
  proposerSig: string;
  blockHash: string;
}

export interface AllocationOperation {
  stock: string;
  address: string;
  shares: number;
  amountPaise: number;
  category: string;
}

// ---- API Response Types ----
export interface AccountBalance {
  address: string;
  balancePaise: number;
  blockedPaise: number;
  stakePaise: number;
  role: string;
  nonce: number;
  isFrozen?: boolean;
  isFlagged?: boolean;
}

export interface NodeStatus {
  height: number;
  chainId: string;
  syncing: boolean;
  mempoolSize: number;
  validatorCount: number;
  peersCount: number;
  genesisHash: string;
}

export interface RHPStatus {
  stock: string;
  status: "pending" | "bidding" | "allocating" | "completed" | "cancelled" | "rejected";
  totalShares: number;
  priceBandLower: number;
  priceBandUpper: number;
  faceValue: number;
  biddingStartSlot: number;
  biddingEndSlot: number;
  qibPct: number;
  nibPct: number;
  retailPct: number;
  retailLotSize: number;
  minRetailBid: number;
  maxRetailBid: number;
  companyAddress: string;
  rhpHash: string;
  drhpHash: string;
}

export interface ValidatorInfo {
  address: string;
  stake: number;
  active: boolean;
  proposerIndex: number;
  score?: number;
  participation?: number;
}

export interface ValidatorScore {
  address: string;
  score: number;
  participation: number;
  blocksProposed: number;
  missedBlocks: number;
  slashEvents: number;
}

export interface SlashProposal {
  proposalId: string;
  proposer: string;
  target: string;
  amountPaise: number;
  reason: string;
  votesFor: number;
  votesAgainst: number;
  status: "pending" | "passed" | "rejected";
  createdAt: number;
}

export interface IPOBids {
  stock: string;
  totalBids: number;
  qibBids: number;
  nibBids: number;
  retailBids: number;
  bids: Array<{
    address: string;
    category: string;
    pricePaise: number;
    shares: number;
    timestamp: number;
  }>;
}

export interface FrozenAccount {
  address: string;
  reason: string;
  frozenAtBlock: number;
}

export interface Mandate {
  mandateType: string;
  target?: string;
  reason: string;
  issuedAtBlock: number;
  regulatorAddress: string;
}

export interface Contract {
  name: string;
  batch: string;
  payloadHash: string;
  status: "pending" | "approved";
  submittedBy: string;
  submittedAtBlock: number;
  payload?: string;
}

export interface AuditInfo {
  address: string;
  balance: AccountBalance;
  flagHistory: Array<{ reason: string; block: number }>;
  freezeHistory: Array<{ reason: string; block: number; unfrozen?: boolean }>;
  txCount: number;
  largeTransferCount: number;
}

// ---- Local DB types ----
export interface LocalBlock {
  height: number;
  hash: string;
  proposer: string;
  txCount: number;
  timestamp: number;
  rawJson: string;
}

export interface LocalTx {
  txHash: string;
  blockHeight: number;
  type: TxType;
  fromAddr: string;
  toAddr?: string;
  amountPaise?: number;
  stock?: string;
  extraJson: string;
  timestamp: number;
  isOwn: boolean;
  status: "pending" | "confirmed";
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  timestamp: number;
  isRead: boolean;
  pageLink?: string;
}

export interface HashHistoryEntry {
  id: string;
  fileName: string;
  fileHash: string;
  timestamp: number;
  fileType: "pdf" | "json";
}

// ---- Portfolio types ----
export interface StockHolding {
  stock: string;
  sharesHeld: number;
  allocatedPrice: number;
  currentMarketPrice?: number;
  unrealisedPL?: number;
  changePercent?: number;
}

export interface StockHolder {
  address: string;
  sharesHeld: number;
  percentage: number;
  acquiredVia: "ipo" | "secondary" | "transfer";
}

// ---- Analytics ----
export interface DailyAnalytics {
  date: string;
  totalVolumePaise: number;
  txCount: number;
  activeAddresses: number;
  newAddresses: number;
  validatorParticipation: number;
}

export interface HolderSnapshot {
  stock: string;
  date: string;
  topHolders: Array<{ address: string; shares: number }>;
  giniCoefficient: number;
  totalSupply: number;
}

// ---- Peer info ----
export interface PeerInfo {
  address: string;
  nodeId: string;
  height: number;
  lastSeen: number;
  connected: boolean;
}

// ---- Stake rewards ----
export interface StakeRewards {
  address: string;
  totalRewardsPaise: number;
  pendingRewardsPaise: number;
  lastRewardBlock: number;
}
