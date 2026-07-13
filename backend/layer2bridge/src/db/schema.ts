import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const ConfirmedTransactionCategory = {
  RECEIVE: 'receive',
  SEND: 'send',
} as const;

export type ConfirmedTransactionCategoryValue =
  (typeof ConfirmedTransactionCategory)[keyof typeof ConfirmedTransactionCategory];

export const Layer2Status = {
  PENDING: 1,
  CONFIRMED: 2,
} as const;

export type Layer2StatusValue = (typeof Layer2Status)[keyof typeof Layer2Status];

export const PendingWithdrawalStatus = {
  PENDING: 1,
  BROADCASTED: 2,
  BROADCASTED_REMOVED_FROM_MEMPOOL: 3,
  CONFIRMED: 4,
} as const;

export type PendingWithdrawalStatusValue =
  (typeof PendingWithdrawalStatus)[keyof typeof PendingWithdrawalStatus];

export const confirmedTransactions = sqliteTable('ConfirmedTransactions', {
  transactionId: text('transaction_id').notNull(),
  transactionVout: integer('transaction_vout').notNull(),
  category: text('category', {
    enum: [ConfirmedTransactionCategory.RECEIVE, ConfirmedTransactionCategory.SEND],
  }).notNull(),
  layer2Status: integer('layer2_status').$type<Layer2StatusValue>().notNull(),
  amount: integer('amount').notNull(),
  fee: integer('fee').notNull().default(0),
  address: text('address').notNull(),
  confirmations: integer('confirmations').notNull(),
  timestamp: integer('timestamp').notNull(),
});

export const pendingWithdrawals = sqliteTable('PendingWithdrawals', {
  layer2WithdrawalId: text('layer2_withdrawal_id').primaryKey(),
  status: integer('status').$type<PendingWithdrawalStatusValue>().notNull(),
  transactionId: text('transaction_id').notNull().default(''),
  amount: integer('amount').notNull(),
  fee: integer('fee').notNull().default(0),
  destinationAddress: text('destination_address').notNull(),
  confirmations: integer('confirmations').notNull().default(0),
  withdrawalRequestedTimestamp: integer('withdrawal_requested_timestamp').notNull(),
  dateBroadcasted: integer('date_broadcasted').notNull().default(0),
});

export const keyValue = sqliteTable('KeyValue', {
  key: text('_key').primaryKey(),
  value: text('value'),
});

export const bridgeSchema = {
  confirmedTransactions,
  pendingWithdrawals,
  keyValue,
};

export const SATOSHI_PER_BITCOIN = 100_000_000;

export type ConfirmedTransactionRow = typeof confirmedTransactions.$inferSelect;
export type ConfirmedTransactionInsert = typeof confirmedTransactions.$inferInsert;
export type PendingWithdrawalRow = typeof pendingWithdrawals.$inferSelect;
export type PendingWithdrawalInsert = typeof pendingWithdrawals.$inferInsert;
