/**
 * INGRION Local Database (SQLite via Tauri SQL plugin)
 */
import Database from "@tauri-apps/plugin-sql";
import type { LocalBlock, LocalTx, Notification, HashHistoryEntry, DailyAnalytics } from "@/types";

type DB = Awaited<ReturnType<typeof Database.load>>;

let db: DB | null = null;
let schemaReady = false;

export async function getDB(): Promise<DB> {
  if (!db) {
    db = await Database.load("sqlite:ingrion.db");
  }
  if (!schemaReady) {
    schemaReady = true;
    await db.execute(`
      CREATE TABLE IF NOT EXISTS blocks (
        height INTEGER PRIMARY KEY,
        hash TEXT NOT NULL,
        proposer TEXT,
        tx_count INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS transactions (
        tx_hash TEXT PRIMARY KEY,
        block_height INTEGER,
        type TEXT NOT NULL,
        from_addr TEXT,
        to_addr TEXT,
        amount_paise INTEGER DEFAULT 0,
        stock TEXT,
        extra_json TEXT,
        timestamp INTEGER NOT NULL,
        is_own INTEGER DEFAULT 0,
        status TEXT DEFAULT 'confirmed'
      );

      CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions(from_addr);
      CREATE INDEX IF NOT EXISTS idx_tx_to ON transactions(to_addr);
      CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_tx_block ON transactions(block_height);
      CREATE INDEX IF NOT EXISTS idx_tx_own ON transactions(is_own);

      CREATE TABLE IF NOT EXISTS analytics_daily (
        date TEXT PRIMARY KEY,
        total_volume_paise INTEGER DEFAULT 0,
        tx_count INTEGER DEFAULT 0,
        active_addresses INTEGER DEFAULT 0,
        new_addresses INTEGER DEFAULT 0,
        validator_participation REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS holder_snapshots (
        stock TEXT,
        date TEXT,
        top_holders_json TEXT,
        gini_coefficient REAL DEFAULT 0,
        total_supply INTEGER DEFAULT 0,
        PRIMARY KEY (stock, date)
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT,
        title TEXT,
        body TEXT,
        timestamp INTEGER NOT NULL,
        is_read INTEGER DEFAULT 0,
        page_link TEXT
      );

      CREATE TABLE IF NOT EXISTS hash_history (
        id TEXT PRIMARY KEY,
        file_name TEXT,
        file_hash TEXT,
        timestamp INTEGER NOT NULL,
        file_type TEXT
      );

      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }
  return db;
}

// ---- Config ----
export async function getConfig(key: string): Promise<string | null> {
  const d = await getDB();
  const rows = await d.select<[{ value: string }]>(
    "SELECT value FROM config WHERE key = ?",
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  const d = await getDB();
  await d.execute(
    "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
    [key, value]
  );
}

// ---- Blocks ----
export async function insertBlock(block: LocalBlock): Promise<void> {
  const d = await getDB();
  await d.execute(
    `INSERT OR IGNORE INTO blocks (height, hash, proposer, tx_count, timestamp, raw_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [block.height, block.hash, block.proposer, block.txCount, block.timestamp, block.rawJson]
  );
}

export async function getLatestBlockHeight(): Promise<number> {
  const d = await getDB();
  const rows = await d.select<[{ h: number }]>("SELECT MAX(height) as h FROM blocks");
  return rows[0]?.h ?? 0;
}

export async function getRecentBlocks(limit = 20): Promise<LocalBlock[]> {
  const d = await getDB();
  return d.select<LocalBlock[]>(
    "SELECT height, hash, proposer, tx_count as txCount, timestamp FROM blocks ORDER BY height DESC LIMIT ?",
    [limit]
  );
}

export async function getBlockByHeight(height: number): Promise<LocalBlock | null> {
  const d = await getDB();
  const rows = await d.select<LocalBlock[]>(
    "SELECT * FROM blocks WHERE height = ?",
    [height]
  );
  return rows[0] ?? null;
}

// ---- Transactions ----
export async function insertTransaction(tx: LocalTx): Promise<void> {
  const d = await getDB();
  await d.execute(
    `INSERT OR IGNORE INTO transactions
     (tx_hash, block_height, type, from_addr, to_addr, amount_paise, stock, extra_json, timestamp, is_own, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tx.txHash, tx.blockHeight, tx.type, tx.fromAddr, tx.toAddr ?? null,
      tx.amountPaise ?? 0, tx.stock ?? null, tx.extraJson, tx.timestamp,
      tx.isOwn ? 1 : 0, tx.status
    ]
  );
}

export async function getOwnTransactions(
  address: string,
  filters: {
    type?: string;
    direction?: "sent" | "received" | "all";
    dateFrom?: number;
    dateTo?: number;
    stock?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<LocalTx[]> {
  const d = await getDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  conditions.push("(from_addr = ? OR to_addr = ?)");
  params.push(address, address);

  if (filters.direction === "sent") {
    conditions.push("from_addr = ?");
    params.push(address);
  } else if (filters.direction === "received") {
    conditions.push("to_addr = ?");
    params.push(address);
  }

  if (filters.type) { conditions.push("type = ?"); params.push(filters.type); }
  if (filters.dateFrom) { conditions.push("timestamp >= ?"); params.push(filters.dateFrom); }
  if (filters.dateTo) { conditions.push("timestamp <= ?"); params.push(filters.dateTo); }
  if (filters.stock) { conditions.push("stock = ?"); params.push(filters.stock); }
  if (filters.search) {
    conditions.push("(tx_hash LIKE ? OR from_addr LIKE ? OR to_addr LIKE ?)");
    const s = `%${filters.search}%`;
    params.push(s, s, s);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  return d.select<LocalTx[]>(
    `SELECT tx_hash as txHash, block_height as blockHeight, type, from_addr as fromAddr,
            to_addr as toAddr, amount_paise as amountPaise, stock, extra_json as extraJson,
            timestamp, is_own as isOwn, status
     FROM transactions ${where}
     ORDER BY timestamp DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

export async function getAllTransactionsForAnalytics(since: number): Promise<LocalTx[]> {
  const d = await getDB();
  return d.select<LocalTx[]>(
    `SELECT tx_hash as txHash, block_height as blockHeight, type, from_addr as fromAddr,
            to_addr as toAddr, amount_paise as amountPaise, stock, extra_json as extraJson,
            timestamp, is_own as isOwn, status
     FROM transactions WHERE timestamp >= ?
     ORDER BY timestamp ASC`,
    [since]
  );
}

// ---- Analytics ----
export async function upsertDailyAnalytics(data: DailyAnalytics): Promise<void> {
  const d = await getDB();
  await d.execute(
    `INSERT OR REPLACE INTO analytics_daily
     (date, total_volume_paise, tx_count, active_addresses, new_addresses, validator_participation)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.date, data.totalVolumePaise, data.txCount, data.activeAddresses, data.newAddresses, data.validatorParticipation]
  );
}

export async function getDailyAnalytics(days = 30): Promise<DailyAnalytics[]> {
  const d = await getDB();
  return d.select<DailyAnalytics[]>(
    `SELECT date, total_volume_paise as totalVolumePaise, tx_count as txCount,
            active_addresses as activeAddresses, new_addresses as newAddresses,
            validator_participation as validatorParticipation
     FROM analytics_daily ORDER BY date DESC LIMIT ?`,
    [days]
  );
}

// ---- Notifications ----
export async function insertNotification(n: Notification): Promise<void> {
  const d = await getDB();
  await d.execute(
    `INSERT OR IGNORE INTO notifications (id, type, title, body, timestamp, is_read, page_link)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [n.id, n.type, n.title, n.body, n.timestamp, n.pageLink ?? null]
  );
}

export async function getNotifications(limit = 20): Promise<Notification[]> {
  const d = await getDB();
  return d.select<Notification[]>(
    `SELECT id, type, title, body, timestamp, is_read as isRead, page_link as pageLink
     FROM notifications ORDER BY timestamp DESC LIMIT ?`,
    [limit]
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  const d = await getDB();
  await d.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", [id]);
}

export async function getUnreadCount(): Promise<number> {
  const d = await getDB();
  const rows = await d.select<[{ c: number }]>(
    "SELECT COUNT(*) as c FROM notifications WHERE is_read = 0"
  );
  return rows[0]?.c ?? 0;
}

// ---- Hash History ----
export async function insertHashHistory(entry: HashHistoryEntry): Promise<void> {
  const d = await getDB();
  await d.execute(
    `INSERT INTO hash_history (id, file_name, file_hash, timestamp, file_type)
     VALUES (?, ?, ?, ?, ?)`,
    [entry.id, entry.fileName, entry.fileHash, entry.timestamp, entry.fileType]
  );
  await d.execute(
    `DELETE FROM hash_history WHERE id NOT IN
     (SELECT id FROM hash_history ORDER BY timestamp DESC LIMIT 100)`
  );
}

export async function getHashHistory(): Promise<HashHistoryEntry[]> {
  const d = await getDB();
  return d.select<HashHistoryEntry[]>(
    `SELECT id, file_name as fileName, file_hash as fileHash, timestamp, file_type as fileType
     FROM hash_history ORDER BY timestamp DESC LIMIT 10`
  );
}
