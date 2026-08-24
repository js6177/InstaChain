import type Redis from "ioredis";

/** Redis key prefix on `redis-diagnostics` for rejected dbwriter rows. */
export const DBWRITER_FAILED_ROW_KEY_PREFIX =
	"Layer2Diagnostics:dbwriter_failed_row:";

/** Index list of failed-row keys (newest first). */
export const DBWRITER_FAILED_ROWS_INDEX_KEY =
	"Layer2Diagnostics:dbwriter_failed_rows";

/** Retain failed-row diagnostics for 24 hours. */
export const DBWRITER_FAILED_ROW_TTL_SECONDS = 24 * 60 * 60;

export enum DbwriterFailedRowKind {
	Transfer = "transfer",
	Withdrawal = "withdrawal",
}

function isStructuredObject(value: object | null): value is object {
	return value !== null && typeof value === "object";
}

export class DbwriterFailedRowRecord {
	readonly failedAtUnixMs: number;
	readonly kind: DbwriterFailedRowKind;
	readonly layer2TransactionId: string;
	readonly errorMessage: string;
	readonly payload: unknown;

	constructor(init: DbwriterFailedRowRecord) {
		this.failedAtUnixMs = init.failedAtUnixMs;
		this.kind = init.kind;
		this.layer2TransactionId = init.layer2TransactionId;
		this.errorMessage = init.errorMessage;
		this.payload = init.payload;
	}

	static parse(data: unknown): DbwriterFailedRowRecord | null {
		if (!isStructuredObject((data as object | null) ?? null)) {
			return null;
		}
		const typed = data as DbwriterFailedRowRecord;
		if (
			typeof typed.failedAtUnixMs !== "number" ||
			typeof typed.layer2TransactionId !== "string" ||
			typeof typed.errorMessage !== "string"
		) {
			return null;
		}
		const kind =
			typed.kind === DbwriterFailedRowKind.Withdrawal
				? DbwriterFailedRowKind.Withdrawal
				: DbwriterFailedRowKind.Transfer;
		return new DbwriterFailedRowRecord({
			failedAtUnixMs: typed.failedAtUnixMs,
			kind,
			layer2TransactionId: typed.layer2TransactionId,
			errorMessage: typed.errorMessage,
			payload: typed.payload ?? null,
		});
	}
}

export function dbwriterFailedRowKey(layer2TransactionId: string): string {
	return `${DBWRITER_FAILED_ROW_KEY_PREFIX}${layer2TransactionId}`;
}

export async function recordDbwriterFailedRow(
	redisDiagnostics: Redis,
	record: DbwriterFailedRowRecord,
): Promise<void> {
	const key = dbwriterFailedRowKey(record.layer2TransactionId);
	const payload = JSON.stringify(record);
	const pipeline = redisDiagnostics.pipeline();
	pipeline.setex(key, DBWRITER_FAILED_ROW_TTL_SECONDS, payload);
	pipeline.lpush(DBWRITER_FAILED_ROWS_INDEX_KEY, key);
	pipeline.ltrim(DBWRITER_FAILED_ROWS_INDEX_KEY, 0, 999);
	pipeline.expire(
		DBWRITER_FAILED_ROWS_INDEX_KEY,
		DBWRITER_FAILED_ROW_TTL_SECONDS,
	);
	await pipeline.exec();
}

export async function loadDbwriterFailedRow(
	redisDiagnostics: Redis,
	layer2TransactionId: string,
): Promise<DbwriterFailedRowRecord | null> {
	const raw = await redisDiagnostics.get(
		dbwriterFailedRowKey(layer2TransactionId),
	);
	if (raw === null) {
		return null;
	}
	try {
		return DbwriterFailedRowRecord.parse(JSON.parse(raw));
	} catch {
		return null;
	}
}
