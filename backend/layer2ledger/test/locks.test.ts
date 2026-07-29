import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	lockManager,
	setupLedgerTests,
	teardownLedgerTests,
} from "./helpers";

beforeAll(async () => {
	await setupLedgerTests();
});

afterAll(async () => {
	await teardownLedgerTests();
});

describe("distributed lock", () => {
	it("acquires, blocks, releases, and re-acquires a single key", async () => {
		const userId = `user1-${crypto.randomUUID()}`;
		const lockToken = await lockManager.acquireMultiLock([userId]);
		expect(lockToken).toBeTruthy();

		const lockToken2 = await lockManager.acquireMultiLock([userId]);
		expect(lockToken2).toBeNull();

		const released = await lockManager.releaseMultiLock([userId], lockToken!);
		expect(released).toBe(true);

		const lockToken3 = await lockManager.acquireMultiLock([userId]);
		expect(lockToken3).toBeTruthy();
		await lockManager.releaseMultiLock([userId], lockToken3!);
	});

	it("multi-key lock blocks each individual key until released", async () => {
		const userA = `userA-${crypto.randomUUID()}`;
		const userB = `userB-${crypto.randomUUID()}`;
		const userIds = [userA, userB];

		const lockToken = await lockManager.acquireMultiLock(userIds);
		expect(lockToken).toBeTruthy();

		expect(await lockManager.acquireMultiLock([userA])).toBeNull();
		expect(await lockManager.acquireMultiLock([userB])).toBeNull();

		const released = await lockManager.releaseMultiLock(userIds, lockToken!);
		expect(released).toBe(true);

		const lockTokenA = await lockManager.acquireMultiLock([userA]);
		const lockTokenB = await lockManager.acquireMultiLock([userB]);
		expect(lockTokenA).toBeTruthy();
		expect(lockTokenB).toBeTruthy();
		await lockManager.releaseMultiLock([userA], lockTokenA!);
		await lockManager.releaseMultiLock([userB], lockTokenB!);
	});

	it("partial overlap blocks acquiring the combined lock", async () => {
		const userA = `userA-${crypto.randomUUID()}`;
		const userB = `userB-${crypto.randomUUID()}`;
		const userIdsAb = [userA, userB];

		const lockTokenA = await lockManager.acquireMultiLock([userA]);
		expect(lockTokenA).toBeTruthy();

		expect(await lockManager.acquireMultiLock(userIdsAb)).toBeNull();

		const released = await lockManager.releaseMultiLock([userA], lockTokenA!);
		expect(released).toBe(true);

		const lockTokenAb = await lockManager.acquireMultiLock(userIdsAb);
		expect(lockTokenAb).toBeTruthy();
		await lockManager.releaseMultiLock(userIdsAb, lockTokenAb!);
	});

	it("allows independent key sets to be locked simultaneously", async () => {
		const userIdsAb = [
			`userA-${crypto.randomUUID()}`,
			`userB-${crypto.randomUUID()}`,
		];
		const userIdsCd = [
			`userC-${crypto.randomUUID()}`,
			`userD-${crypto.randomUUID()}`,
		];

		const lockTokenAb = await lockManager.acquireMultiLock(userIdsAb);
		const lockTokenCd = await lockManager.acquireMultiLock(userIdsCd);
		expect(lockTokenAb).toBeTruthy();
		expect(lockTokenCd).toBeTruthy();

		await lockManager.releaseMultiLock(userIdsAb, lockTokenAb!);
		await lockManager.releaseMultiLock(userIdsCd, lockTokenCd!);
	});

	it("requires overlapping locks to be released before a bridging lock", async () => {
		const userA = `userA-${crypto.randomUUID()}`;
		const userB = `userB-${crypto.randomUUID()}`;
		const userC = `userC-${crypto.randomUUID()}`;
		const userD = `userD-${crypto.randomUUID()}`;
		const userIdsAb = [userA, userB];
		const userIdsCd = [userC, userD];
		const userIdsBc = [userB, userC];

		const lockTokenAb = await lockManager.acquireMultiLock(userIdsAb);
		const lockTokenCd = await lockManager.acquireMultiLock(userIdsCd);
		expect(lockTokenAb).toBeTruthy();
		expect(lockTokenCd).toBeTruthy();

		expect(await lockManager.acquireMultiLock(userIdsBc)).toBeNull();

		expect(await lockManager.releaseMultiLock(userIdsAb, lockTokenAb!)).toBe(
			true,
		);
		expect(await lockManager.releaseMultiLock(userIdsCd, lockTokenCd!)).toBe(
			true,
		);

		const lockTokenBc = await lockManager.acquireMultiLock(userIdsBc);
		expect(lockTokenBc).toBeTruthy();
		await lockManager.releaseMultiLock(userIdsBc, lockTokenBc!);
	});
});
