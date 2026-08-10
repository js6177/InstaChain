import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Redis from "ioredis";
import {
	PENDING_TRANSACTIONS_LIST_KEY,
	PENDING_WITHDRAWALS_LIST_KEY,
	type PendingTransaction,
	type PendingWithdrawal,
} from "./models";
import { parsePendingTransactions, parsePendingWithdrawals } from "./pending";

const ACQUIRE_SCRIPT_LUA = readFileSync(
	join(import.meta.dir, "acquire-multi-lock.lua"),
	"utf8",
);
const RELEASE_SCRIPT_LUA = readFileSync(
	join(import.meta.dir, "release-multi-lock.lua"),
	"utf8",
);

export class DistributedLock {
	private acquireSha!: string;
	private releaseSha!: string;

	constructor(private readonly redis: Redis) {}

	async setup(): Promise<void> {
		const acquireSha = await this.redis.script("LOAD", ACQUIRE_SCRIPT_LUA);
		const releaseSha = await this.redis.script("LOAD", RELEASE_SCRIPT_LUA);

		if (typeof acquireSha !== "string" || acquireSha.length === 0) {
			throw new Error("Failed to load Redis acquire-multi-lock script");
		}
		if (typeof releaseSha !== "string" || releaseSha.length === 0) {
			throw new Error("Failed to load Redis release-multi-lock script");
		}

		this.acquireSha = acquireSha;
		this.releaseSha = releaseSha;
	}

	private ensureScriptsLoaded(): void {
		if (!this.acquireSha || !this.releaseSha) {
			throw new Error(
				"DistributedLock.setup() must succeed before acquiring or releasing locks",
			);
		}
	}

	private getLockKeys(userIds: string[]): string[] {
		return userIds.map((userId) => `lock:${userId}`);
	}

	async acquireMultiLock(userIds: string[]): Promise<string | null> {
		if (userIds.length === 0) {
			return null;
		}

		this.ensureScriptsLoaded();

		const lockToken = crypto.randomUUID();
		const lockKeys = this.getLockKeys(userIds);
		const acquired = (await this.redis.evalsha(
			this.acquireSha,
			lockKeys.length,
			...lockKeys,
			lockToken,
			"1",
		)) as number;

		return acquired === 1 ? lockToken : null;
	}

	async releaseMultiLock(
		userIds: string[],
		lockToken: string,
	): Promise<boolean> {
		if (userIds.length === 0) {
			return true;
		}

		this.ensureScriptsLoaded();

		const lockKeys = this.getLockKeys(userIds);
		const released = (await this.redis.evalsha(
			this.releaseSha,
			lockKeys.length,
			...lockKeys,
			lockToken,
		)) as number;

		return released === lockKeys.length;
	}

	/**
	 * Pipeline many unlock scripts in one Redis round-trip (dbwriter batch path).
	 */
	async releaseMultiLocks(
		locks: ReadonlyArray<{ userIds: string[]; lockToken: string }>,
	): Promise<void> {
		if (locks.length === 0) {
			return;
		}

		this.ensureScriptsLoaded();

		const pipeline = this.redis.pipeline();
		let queued = 0;
		for (const { userIds, lockToken } of locks) {
			if (userIds.length === 0) {
				continue;
			}
			const lockKeys = this.getLockKeys(userIds);
			pipeline.evalsha(
				this.releaseSha,
				lockKeys.length,
				...lockKeys,
				lockToken,
			);
			queued += 1;
		}
		if (queued === 0) {
			return;
		}
		await pipeline.exec();
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
