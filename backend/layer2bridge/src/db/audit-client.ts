import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { gt } from 'drizzle-orm';
import type { AddressGroupingEntry } from '@openl2/bitcoin-core-rpc';
import { SATOSHI_PER_BITCOIN } from '@openl2/openl2-messaging';
import {
  auditSchema,
  auditState,
  layer1Address,
  type AuditLayer1AddressInsert,
  type AuditLayer1AddressRow,
} from './audit-schema';

export type AuditDatabase = ReturnType<typeof createAuditDatabase>;

export function createAuditDatabase(path: string) {
  const sqlite = new Database(path, { create: true });
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS audit_state (
      id INTEGER PRIMARY KEY,
      block_height INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS layer1_address (
      layer1_address TEXT PRIMARY KEY,
      layer1_address_label TEXT NOT NULL DEFAULT '',
      balance INTEGER NOT NULL,
      sent_to_layer2_ledger INTEGER NOT NULL DEFAULT 0,
      last_updated_block_height INTEGER NOT NULL DEFAULT 0,
      last_updated_on INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema: auditSchema });
}

export async function getLastAuditBlockHeight(db: AuditDatabase): Promise<number> {
  const rows = await db.select().from(auditState).limit(1);
  return rows[0]?.blockHeight ?? 0;
}

export async function addOrUpdateLayer1Addresses(
  db: AuditDatabase,
  addresses: AuditLayer1AddressInsert[],
  blockHeight: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  for (const address of addresses) {
    await db
      .insert(layer1Address)
      .values({
        ...address,
        lastUpdatedBlockHeight: blockHeight,
        lastUpdatedOn: now,
      })
      .onConflictDoUpdate({
        target: layer1Address.layer1Address,
        set: {
          balance: address.balance,
          lastUpdatedBlockHeight: blockHeight,
          lastUpdatedOn: now,
        },
      });
  }

  await db.delete(auditState);
  await db.insert(auditState).values({ blockHeight });
}

export async function getLayer1Addresses(
  db: AuditDatabase,
  getZeroBalanceAddresses = true,
): Promise<AuditLayer1AddressRow[]> {
  if (getZeroBalanceAddresses) {
    return db.select().from(layer1Address);
  }
  return db.select().from(layer1Address).where(gt(layer1Address.balance, 0));
}

export function auditAddressFromRpcGrouping(entry: AddressGroupingEntry): AuditLayer1AddressInsert {
  return {
    layer1Address: entry.address,
    layer1AddressLabel: entry.label,
    balance: Math.round(entry.amount * SATOSHI_PER_BITCOIN),
    sentToLayer2Ledger: 0,
    lastUpdatedBlockHeight: 0,
    lastUpdatedOn: Math.floor(Date.now() / 1000),
  };
}
