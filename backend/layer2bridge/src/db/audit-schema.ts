import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const auditState = sqliteTable('audit_state', {
  id: integer('id').primaryKey(),
  blockHeight: integer('block_height').notNull(),
});

export const layer1Address = sqliteTable('layer1_address', {
  layer1Address: text('layer1_address').primaryKey(),
  layer1AddressLabel: text('layer1_address_label').notNull().default(''),
  balance: integer('balance').notNull(),
  sentToLayer2Ledger: integer('sent_to_layer2_ledger').notNull().default(0),
  lastUpdatedBlockHeight: integer('last_updated_block_height').notNull().default(0),
  lastUpdatedOn: integer('last_updated_on').notNull(),
});

export const auditSchema = {
  auditState,
  layer1Address,
};

export type AuditLayer1AddressRow = typeof layer1Address.$inferSelect;
export type AuditLayer1AddressInsert = typeof layer1Address.$inferInsert;
