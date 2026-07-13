import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { and, eq } from 'drizzle-orm';
import {
  bridgeSchema,
  ConfirmedTransactionCategory,
  confirmedTransactions,
  keyValue,
  Layer2Status,
  pendingWithdrawals,
  PendingWithdrawalStatus,
  type ConfirmedTransactionCategoryValue,
  type ConfirmedTransactionInsert,
  type ConfirmedTransactionRow,
  type Layer2StatusValue,
  type PendingWithdrawalInsert,
  type PendingWithdrawalRow,
} from './schema';

export type BridgeDatabase = ReturnType<typeof createBridgeDatabase>;

export function createBridgeDatabase(path: string) {
  const sqlite = new Database(path, { create: true });
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ConfirmedTransactions (
      transaction_id TEXT NOT NULL,
      transaction_vout INTEGER NOT NULL,
      category TEXT NOT NULL,
      layer2_status INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      fee INTEGER NOT NULL DEFAULT 0,
      address TEXT NOT NULL,
      confirmations INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      PRIMARY KEY (transaction_id, transaction_vout, category)
    );
    CREATE TABLE IF NOT EXISTS PendingWithdrawals (
      layer2_withdrawal_id TEXT PRIMARY KEY,
      status INTEGER NOT NULL,
      transaction_id TEXT NOT NULL DEFAULT '',
      amount INTEGER NOT NULL,
      fee INTEGER NOT NULL DEFAULT 0,
      destination_address TEXT NOT NULL,
      confirmations INTEGER NOT NULL DEFAULT 0,
      withdrawal_requested_timestamp INTEGER NOT NULL,
      date_broadcasted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS KeyValue (
      _key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  return drizzle(sqlite, { schema: bridgeSchema });
}

export async function getKeyValue(db: BridgeDatabase, key: string): Promise<string> {
  const rows = await db.select().from(keyValue).where(eq(keyValue.key, key)).limit(1);
  return rows[0]?.value ?? '';
}

export async function getKeyValueNumber(
  db: BridgeDatabase,
  key: string,
  defaultValue: number,
): Promise<number> {
  const raw = await getKeyValue(db, key);
  if (raw.length === 0) {
    return defaultValue;
  }
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export async function setKeyValue(db: BridgeDatabase, key: string, value: string): Promise<void> {
  await db
    .insert(keyValue)
    .values({ key, value })
    .onConflictDoUpdate({ target: keyValue.key, set: { value } });
}

export async function insertConfirmedTransaction(
  db: BridgeDatabase,
  tx: ConfirmedTransactionInsert,
): Promise<void> {
  await db.insert(confirmedTransactions).values(tx);
}

export async function getAllPendingConfirmedTransactions(
  db: BridgeDatabase,
): Promise<ConfirmedTransactionRow[]> {
  return db
    .select()
    .from(confirmedTransactions)
    .where(eq(confirmedTransactions.layer2Status, Layer2Status.PENDING));
}

export async function getPendingConfirmedDepositTransactions(
  db: BridgeDatabase,
): Promise<ConfirmedTransactionRow[]> {
  return db
    .select()
    .from(confirmedTransactions)
    .where(
      and(
        eq(confirmedTransactions.layer2Status, Layer2Status.PENDING),
        eq(confirmedTransactions.category, ConfirmedTransactionCategory.RECEIVE),
      ),
    );
}

export async function getPendingConfirmedWithdrawalTransactions(
  db: BridgeDatabase,
): Promise<ConfirmedTransactionRow[]> {
  return db
    .select()
    .from(confirmedTransactions)
    .where(
      and(
        eq(confirmedTransactions.layer2Status, Layer2Status.PENDING),
        eq(confirmedTransactions.category, ConfirmedTransactionCategory.SEND),
      ),
    );
}

export async function updateConfirmedTransaction(
  db: BridgeDatabase,
  transactionId: string,
  transactionVout: number,
  category: ConfirmedTransactionCategoryValue,
  layer2Status: Layer2StatusValue,
): Promise<void> {
  await db
    .update(confirmedTransactions)
    .set({ layer2Status })
    .where(
      and(
        eq(confirmedTransactions.transactionId, transactionId),
        eq(confirmedTransactions.transactionVout, transactionVout),
        eq(confirmedTransactions.category, category),
      ),
    );
}

export async function insertPendingWithdrawal(
  db: BridgeDatabase,
  withdrawal: PendingWithdrawalInsert,
): Promise<void> {
  await db.insert(pendingWithdrawals).values(withdrawal);
}

export async function getPendingWithdrawals(db: BridgeDatabase): Promise<PendingWithdrawalRow[]> {
  return db
    .select()
    .from(pendingWithdrawals)
    .where(eq(pendingWithdrawals.status, PendingWithdrawalStatus.PENDING));
}

export async function updatePendingWithdrawalBroadcast(
  db: BridgeDatabase,
  layer2WithdrawalId: string,
  transactionId: string,
): Promise<void> {
  await db
    .update(pendingWithdrawals)
    .set({
      status: PendingWithdrawalStatus.BROADCASTED,
      transactionId,
      dateBroadcasted: Math.floor(Date.now() / 1000),
    })
    .where(eq(pendingWithdrawals.layer2WithdrawalId, layer2WithdrawalId));
}
