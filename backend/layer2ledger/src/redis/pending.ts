import type { PendingTransaction, PendingWithdrawal } from './models';

export function parsePendingTransactions(items: string[]): PendingTransaction[] {
  return items.map((item) => JSON.parse(item) as PendingTransaction);
}

export function parsePendingWithdrawals(items: string[]): PendingWithdrawal[] {
  return items.map((item) => JSON.parse(item) as PendingWithdrawal);
}
