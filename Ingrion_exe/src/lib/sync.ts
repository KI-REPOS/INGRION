/**
 * INGRION Background Block Sync Service
 * Continuously polls the node and builds local SQLite block database.
 */
import { getStatus, getBlock } from "@/lib/api";
import { insertBlock, insertTransaction, getLatestBlockHeight, upsertDailyAnalytics } from "@/lib/db";
import { useAppStore } from "@/store";
import type { Block, Transaction } from "@/types";

let syncInterval: ReturnType<typeof setInterval> | null = null;
let backoffMs = 5000;
const MAX_BACKOFF = 60000;

export function startSyncService(ownAddress: string) {
  if (syncInterval) return;

  const tick = async () => {
    try {
      const status = await getStatus();
      const store = useAppStore.getState();
      store.setNodeStatus(status, true);

      const localHeight = await getLatestBlockHeight();
      const chainHeight = status.height;

      if (chainHeight > localHeight) {
        const from = localHeight + 1;
        const to = Math.min(chainHeight, localHeight + 50); // batch of 50
        await syncRange(from, to, ownAddress);
      }

      backoffMs = 5000; // reset on success
    } catch (err) {
      console.error("[sync] error:", err);
      useAppStore.getState().setNodeStatus(null, false);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
    }
  };

  tick(); // run immediately
  const interval = useAppStore.getState().config?.refreshInterval ?? 10;
  syncInterval = setInterval(tick, interval * 1000);
}

export function stopSyncService() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

async function syncRange(from: number, to: number, ownAddress: string) {
  for (let h = from; h <= to; h++) {
    try {
      const block: Block = await getBlock(h);
      await persistBlock(block, ownAddress);
    } catch (e) {
      console.warn(`[sync] failed to fetch block ${h}:`, e);
    }
  }
}

async function persistBlock(block: Block, ownAddress: string) {
  // Guard: transactions and allocationOps may be null from Go's omitempty
  const txs: Transaction[] = Array.isArray(block.transactions) ? block.transactions : [];
  const allocOps = Array.isArray(block.allocationOps) ? block.allocationOps : [];

  await insertBlock({
    height: block.header.height,
    hash: block.blockHash,
    proposer: block.header.proposer,
    txCount: block.header.txCount,
    timestamp: block.header.timestamp,
    rawJson: JSON.stringify(block),
  });

  // Persist regular transactions
  for (const tx of txs) {
    const txHash = await computeTxHash(tx);
    const isOwn = tx.from === ownAddress || tx.to === ownAddress;

    await insertTransaction({
      txHash,
      blockHeight: block.header.height,
      type: tx.type,
      fromAddr: tx.from as string,
      toAddr: tx.to as string | undefined,
      amountPaise: tx.amountPaise,
      stock: tx.stock,
      extraJson: JSON.stringify(tx),
      timestamp: tx.timestamp,
      isOwn,
      status: "confirmed",
    });
  }

  // Persist allocation operations as synthetic "tnx_allocate_ipo" records
  // so they appear in the user's tx history and provide cost basis for Portfolio
  for (const op of allocOps) {
    const isOwn = op.bidder === ownAddress;
    // Deterministic hash from block height + bidder + stock (no duplicates on re-sync)
    const syntheticKey = `alloc_${block.header.height}_${op.bidder}_${op.stock}`;
    const txHash = await computeStringHash(syntheticKey);

    await insertTransaction({
      txHash,
      blockHeight: block.header.height,
      type: "tnx_allocate_ipo",
      fromAddr: op.bidder,
      toAddr: op.bidder,
      amountPaise: op.amountToPay,
      stock: op.stock,
      extraJson: JSON.stringify({
        ...op,
        // Embed per-share cutoff price so Portfolio can compute avg cost
        cutoffPricePaise: op.allocShares > 0
          ? Math.round(op.amountToPay / op.allocShares)
          : 0,
      }),
      timestamp: block.header.timestamp,
      isOwn,
      status: "confirmed",
    });
  }
}

async function computeTxHash(tx: Transaction): Promise<string> {
  const raw = JSON.stringify(tx);
  return computeStringHash(raw);
}

async function computeStringHash(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Immediately syncs any new blocks from the node into the local DB.
 * Call this right after submitting a transaction so the history page
 * updates as soon as the block is produced, without waiting for the
 * next background poll interval.
 *
 * Usage: await triggerImmediateSync(keystore.address)
 *        — or with a delay: setTimeout(() => triggerImmediateSync(addr), 4000)
 */
export async function triggerImmediateSync(ownAddress: string): Promise<void> {
  try {
    const status = await getStatus();
    const localHeight = await getLatestBlockHeight();
    const chainHeight = status.height;
    if (chainHeight > localHeight) {
      await syncRange(localHeight + 1, Math.min(chainHeight, localHeight + 50), ownAddress);
    }
    // Update node status in the store so the UI stays in sync
    useAppStore.getState().setNodeStatus(status, true);
  } catch (e) {
    console.warn("[sync] triggerImmediateSync failed:", e);
  }
}

/**
 * Trigger analytics aggregation for the past N days.
 * Run hourly or on-demand.
 */
export async function runAnalyticsAggregation() {
  try {
    const { getAllTransactionsForAnalytics } = await import("@/lib/db");
    const dayAgo = Date.now() / 1000 - 86400;
    const txs = await getAllTransactionsForAnalytics(dayAgo);

    const addresses = new Set<string>();
    let volume = 0;

    for (const tx of txs) {
      addresses.add(tx.fromAddr);
      if (tx.toAddr) addresses.add(tx.toAddr);
      volume += tx.amountPaise ?? 0;
    }

    const today = new Date().toISOString().slice(0, 10);
    await upsertDailyAnalytics({
      date: today,
      totalVolumePaise: volume,
      txCount: txs.length,
      activeAddresses: addresses.size,
      newAddresses: 0, // would require full history comparison
      validatorParticipation: 0, // fetched live
    });
  } catch (e) {
    console.warn("[analytics] aggregation failed:", e);
  }
}

// /**
//  * INGRION Background Block Sync Service
//  * Continuously polls the node and builds local SQLite block database.
//  */
// import { getStatus, getBlock } from "@/lib/api";
// import { insertBlock, insertTransaction, getLatestBlockHeight, upsertDailyAnalytics } from "@/lib/db";
// import { useAppStore } from "@/store";
// import type { Block, Transaction } from "@/types";

// let syncInterval: ReturnType<typeof setInterval> | null = null;
// let backoffMs = 5000;
// const MAX_BACKOFF = 60000;

// export function startSyncService(ownAddress: string) {
//   if (syncInterval) return;

//   const tick = async () => {
//     try {
//       const status = await getStatus();
//       const store = useAppStore.getState();
//       store.setNodeStatus(status, true);

//       const localHeight = await getLatestBlockHeight();
//       const chainHeight = status.height;

//       if (chainHeight > localHeight) {
//         const from = localHeight + 1;
//         const to = Math.min(chainHeight, localHeight + 50); // batch of 50
//         await syncRange(from, to, ownAddress);
//       }

//       backoffMs = 5000; // reset on success
//     } catch (err) {
//       console.error("[sync] error:", err);
//       useAppStore.getState().setNodeStatus(null, false);
//       backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
//     }
//   };

//   tick(); // run immediately
//   const interval = useAppStore.getState().config?.refreshInterval ?? 10;
//   syncInterval = setInterval(tick, interval * 1000);
// }

// export function stopSyncService() {
//   if (syncInterval) {
//     clearInterval(syncInterval);
//     syncInterval = null;
//   }
// }

// async function syncRange(from: number, to: number, ownAddress: string) {
//   for (let h = from; h <= to; h++) {
//     try {
//       const block: Block = await getBlock(h);
//       await persistBlock(block, ownAddress);
//     } catch (e) {
//       console.warn(`[sync] failed to fetch block ${h}:`, e);
//     }
//   }
// }

// async function persistBlock(block: Block, ownAddress: string) {
//   // Guard: transactions and allocationOps may be null from Go's omitempty
//   const txs: Transaction[] = Array.isArray(block.transactions) ? block.transactions : [];
//   const allocOps = Array.isArray(block.allocationOps) ? block.allocationOps : [];

//   await insertBlock({
//     height: block.header.height,
//     hash: block.blockHash,
//     proposer: block.header.proposer,
//     txCount: block.header.txCount,
//     timestamp: block.header.timestamp,
//     rawJson: JSON.stringify(block),
//   });

//   // Persist regular transactions
//   for (const tx of txs) {
//     const txHash = await computeTxHash(tx);
//     const isOwn = tx.from === ownAddress || tx.to === ownAddress;

//     await insertTransaction({
//       txHash,
//       blockHeight: block.header.height,
//       type: tx.type,
//       fromAddr: tx.from as string,
//       toAddr: tx.to as string | undefined,
//       amountPaise: tx.amountPaise,
//       stock: tx.stock,
//       extraJson: JSON.stringify(tx),
//       timestamp: tx.timestamp,
//       isOwn,
//       status: "confirmed",
//     });
//   }

//   // Persist allocation operations as synthetic "tnx_allocate_ipo" records
//   // so they appear in the user's tx history and provide cost basis for Portfolio
//   for (const op of allocOps) {
//     const isOwn = op.bidder === ownAddress;
//     // Deterministic hash from block height + bidder + stock (no duplicates on re-sync)
//     const syntheticKey = `alloc_${block.header.height}_${op.bidder}_${op.stock}`;
//     const txHash = await computeStringHash(syntheticKey);

//     await insertTransaction({
//       txHash,
//       blockHeight: block.header.height,
//       type: "tnx_allocate_ipo",
//       fromAddr: op.bidder,
//       toAddr: op.bidder,
//       amountPaise: op.amountToPay,
//       stock: op.stock,
//       extraJson: JSON.stringify({
//         ...op,
//         // Embed per-share cutoff price so Portfolio can compute avg cost
//         cutoffPricePaise: op.allocShares > 0
//           ? Math.round(op.amountToPay / op.allocShares)
//           : 0,
//       }),
//       timestamp: block.header.timestamp,
//       isOwn,
//       status: "confirmed",
//     });
//   }
// }

// async function computeTxHash(tx: Transaction): Promise<string> {
//   const raw = JSON.stringify(tx);
//   return computeStringHash(raw);
// }

// async function computeStringHash(input: string): Promise<string> {
//   const buf = new TextEncoder().encode(input);
//   const hash = await crypto.subtle.digest("SHA-256", buf);
//   return Array.from(new Uint8Array(hash))
//     .map((b) => b.toString(16).padStart(2, "0"))
//     .join("");
// }

// /**
//  * Trigger analytics aggregation for the past N days.
//  * Run hourly or on-demand.
//  */
// export async function runAnalyticsAggregation() {
//   try {
//     const { getAllTransactionsForAnalytics } = await import("@/lib/db");
//     const dayAgo = Date.now() / 1000 - 86400;
//     const txs = await getAllTransactionsForAnalytics(dayAgo);

//     const addresses = new Set<string>();
//     let volume = 0;

//     for (const tx of txs) {
//       addresses.add(tx.fromAddr);
//       if (tx.toAddr) addresses.add(tx.toAddr);
//       volume += tx.amountPaise ?? 0;
//     }

//     const today = new Date().toISOString().slice(0, 10);
//     await upsertDailyAnalytics({
//       date: today,
//       totalVolumePaise: volume,
//       txCount: txs.length,
//       activeAddresses: addresses.size,
//       newAddresses: 0, // would require full history comparison
//       validatorParticipation: 0, // fetched live
//     });
//   } catch (e) {
//     console.warn("[analytics] aggregation failed:", e);
//   }
// }