import type Redis from 'ioredis';
import {
  PENDING_TRANSACTIONS_LIST_KEY,
  PENDING_WITHDRAWALS_LIST_KEY,
  type PendingTransaction,
  type PendingWithdrawal,
} from './models';
import { parsePendingTransactions, parsePendingWithdrawals } from './pending';

const ACQUIRE_SCRIPT_LUA = `
  for i, key in ipairs(KEYS) do
    if redis.call('EXISTS', key) == 1 then
      return 0
    end
  end
  for i, key in ipairs(KEYS) do
    redis.call('SET', key, ARGV[1])
  end
  return 1
`;

const RELEASE_SCRIPT_LUA = `
  local keys_to_delete = {}
  for i, key in ipairs(KEYS) do
    if redis.call('GET', key) == ARGV[1] then
      table.insert(keys_to_delete, key)
    end
  end
  if #keys_to_delete ~= #KEYS then
    return 0
  end
  return redis.call('DEL', unpack(keys_to_delete))
`;

export class DistributedLock {
  private acquireSha: string | null = null;
  private releaseSha: string | null = null;

  constructor(private readonly redis: Redis) {}

  async setup(): Promise<void> {
    this.acquireSha = (await this.redis.script('LOAD', ACQUIRE_SCRIPT_LUA)) as string;
    this.releaseSha = (await this.redis.script('LOAD', RELEASE_SCRIPT_LUA)) as string;
  }

  private getLockKeys(userIds: string[]): string[] {
    return userIds.map((userId) => `lock:${userId}`);
  }

  async acquireMultiLock(userIds: string[]): Promise<string | null> {
    if (userIds.length === 0) {
      return null;
    }

    if (!this.acquireSha) {
      await this.setup();
    }

    const lockToken = crypto.randomUUID();
    const lockKeys = this.getLockKeys(userIds);
    const acquired = (await this.redis.evalsha(
      this.acquireSha!,
      lockKeys.length,
      ...lockKeys,
      lockToken,
      '1',
    )) as number;

    return acquired === 1 ? lockToken : null;
  }

  async releaseMultiLock(userIds: string[], lockToken: string): Promise<boolean> {
    if (userIds.length === 0) {
      return true;
    }

    if (!this.releaseSha) {
      await this.setup();
    }

    const lockKeys = this.getLockKeys(userIds);
    const released = (await this.redis.evalsha(
      this.releaseSha!,
      lockKeys.length,
      ...lockKeys,
      lockToken,
    )) as number;

    return released === lockKeys.length;
  }
}

export async function getPendingTransactions(
  redis: Redis,
  start: number,
  end: number,
): Promise<PendingTransaction[]> {
  const items = await redis.lrange(PENDING_TRANSACTIONS_LIST_KEY, start, end);
  return parsePendingTransactions(items);
}

export async function getPendingWithdrawals(
  redis: Redis,
  start: number,
  end: number,
): Promise<PendingWithdrawal[]> {
  const items = await redis.lrange(PENDING_WITHDRAWALS_LIST_KEY, start, end);
  return parsePendingWithdrawals(items);
}

export { PENDING_TRANSACTIONS_LIST_KEY, PENDING_WITHDRAWALS_LIST_KEY };
