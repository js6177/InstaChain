import { Readable, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type postgres from "postgres";
import type {
	TransactionInsert,
	WithdrawalRequestInsert,
} from "./schema";

/** Address + delta rows for COPY staging upsert into `layer2_address_balance`. */
export interface AddressBalanceCopyRow {
	address: string;
	balance: number;
}

/** Escape a string for PostgreSQL COPY text format. */
function escapeCopyText(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll("\n", "\\n")
		.replaceAll("\r", "\\r")
		.replaceAll("\t", "\\t");
}

function copyField(value: string | number | null): string {
	if (value === null) {
		return "\\N";
	}
	if (typeof value === "number") {
		return String(value);
	}
	return escapeCopyText(value);
}

function buildCopyPayload(rows: ReadonlyArray<ReadonlyArray<string>>): string {
	if (rows.length === 0) {
		return "";
	}
	let payload = "";
	for (const row of rows) {
		payload += `${row.join("\t")}\n`;
	}
	return payload;
}

/**
 * Pipe payload into a postgres.js COPY writable, surfacing server-side failures.
 *
 * postgres.js resolves `.writable()` when CopyIn starts (not when COPY finishes).
 * After CopyDone, a type/constraint ErrorResponse can leave the Writable without
 * `finish`/`error` because the library clears its stream handle before the error
 * is applied. Pattern:
 * 1. `pipeline` the data (cleans up on pipe errors)
 * 2. After the destination ends (CopyDone sent), probe the same reserved
 *    connection — an aborted transaction rejects so we can `destroy()` and
 *    unblock instead of hanging until timeout.
 */
async function writeCopyPayload(
	sql: CopySql,
	writableQuery: Promise<Writable>,
	payload: string,
): Promise<void> {
	const dataStream = Readable.from([payload]);
	let copyStream: Writable | null = null;
	try {
		copyStream = await writableQuery;
		await Promise.all([
			pipeline(dataStream, copyStream),
			settleCopyWritable(sql, copyStream),
		]);
	} catch (err) {
		dataStream.destroy();
		copyStream?.destroy();
		throw err;
	}
}

async function settleCopyWritable(
	sql: CopySql,
	copyStream: Writable,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		let settled = false;
		const settle = (err?: Error): void => {
			if (settled) {
				return;
			}
			settled = true;
			copyStream.off("finish", onFinish);
			copyStream.off("error", onError);
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		};
		const onFinish = (): void => settle();
		const onError = (err: Error): void => settle(err);

		copyStream.once("finish", onFinish);
		copyStream.once("error", onError);

		// pipeline() calls end() after the readable completes. Yield so
		// postgres.js `_final` can send CopyDone, then probe. Do not wait on
		// `prefinish` — Bun may not emit it while the Writable is wedged.
		void (async () => {
			for (let i = 0; i < 8 && !settled; i++) {
				await new Promise<void>((r) => setImmediate(r));
			}
			if (settled || copyStream.writableFinished || copyStream.destroyed) {
				return;
			}
			try {
				// Runs after ReadyForQuery on the reserved connection. On a
				// swallowed COPY error the txn is aborted and this throws.
				await sql`SELECT 1`;
			} catch (cause) {
				const aborted =
					cause instanceof Error &&
					cause.message.includes("current transaction is aborted");
				const err = aborted
					? new Error(
							"COPY FROM STDIN failed (server rejected rows; postgres.js did not surface the original error)",
						)
					: cause instanceof Error
						? cause
						: new Error(String(cause));
				copyStream.destroy(err);
				settle(err);
			}
		})();
	});
}

type CopySql = postgres.Sql;

/** Session temp table used to stage address-balance deltas before upsert. */
const ADDRESS_BALANCE_STAGE_TABLE = "layer2_address_balance_stage";

/**
 * Bulk-insert transactions via PostgreSQL COPY FROM STDIN.
 * Must run inside an open transaction for atomicity with other writes.
 */
export async function copyInsertTransactions(
	sql: CopySql,
	rows: readonly TransactionInsert[],
): Promise<void> {
	if (rows.length === 0) {
		return;
	}
	const payload = buildCopyPayload(
		rows.map((row) => [
			copyField(row.amount),
			copyField(row.fee),
			copyField(row.sourceAddressPubkey),
			copyField(row.destinationAddressPubkey),
			copyField(row.transactionType),
			copyField(row.layer2TransactionId),
			copyField(row.signature),
			copyField(row.signatureDate),
			copyField(row.layer1TransactionId ?? ""),
			copyField(row.layer2WithdrawalId ?? ""),
			copyField(row.batchHeight ?? 0),
		]),
	);
	await writeCopyPayload(
		sql,
		sql`
			COPY transactions (
				amount,
				fee,
				source_address_pubkey,
				destination_address_pubkey,
				transaction_type,
				layer2_transaction_id,
				signature,
				signature_date,
				layer1_transaction_id,
				layer2_withdrawal_id,
				batch_height
			) FROM STDIN
		`.writable(),
		payload,
	);
}

/**
 * Bulk-insert withdrawal requests via PostgreSQL COPY FROM STDIN.
 * Must run inside an open transaction for atomicity with other writes.
 */
export async function copyInsertWithdrawalRequests(
	sql: CopySql,
	rows: readonly WithdrawalRequestInsert[],
): Promise<void> {
	if (rows.length === 0) {
		return;
	}
	const payload = buildCopyPayload(
		rows.map((row) => [
			copyField(row.layer1Address),
			copyField(row.layer1TransactionId ?? null),
			copyField(row.status),
			copyField(row.amount),
			copyField(row.layer2WithdrawalId),
			copyField(row.serverSignature ?? null),
			copyField(row.layer2TransactionId),
			copyField(row.withdrawalRequestedTimestamp),
			copyField(row.batchHeight ?? 0),
		]),
	);
	await writeCopyPayload(
		sql,
		sql`
			COPY withdrawal_requests (
				layer1_address,
				layer1_transaction_id,
				status,
				amount,
				layer2_withdrawal_id,
				server_signature,
				layer2_transaction_id,
				withdrawal_requested_timestamp,
				batch_height
			) FROM STDIN
		`.writable(),
		payload,
	);
}

/**
 * Upsert address-balance deltas via staging-table COPY:
 * 1. CREATE TEMP TABLE (ON COMMIT DROP) for address + balance delta
 * 2. COPY rows into the staging table
 * 3. INSERT … SELECT … ON CONFLICT DO UPDATE into `layer2_address_balance`
 *
 * Must run inside an open transaction on the same reserved connection.
 * `balance` on each row is a delta (same semantics as drizzle onConflictDoUpdate).
 */
export async function copyUpsertAddressBalances(
	sql: CopySql,
	rows: readonly AddressBalanceCopyRow[],
): Promise<AddressBalanceCopyRow[]> {
	if (rows.length === 0) {
		return [];
	}

	await sql.unsafe(`
		CREATE TEMP TABLE IF NOT EXISTS ${ADDRESS_BALANCE_STAGE_TABLE} (
			address VARCHAR PRIMARY KEY,
			balance INTEGER NOT NULL
		) ON COMMIT DROP
	`);
	await sql.unsafe(`TRUNCATE ${ADDRESS_BALANCE_STAGE_TABLE}`);

	const payload = buildCopyPayload(
		rows.map((row) => [copyField(row.address), copyField(row.balance)]),
	);
	await writeCopyPayload(
		sql,
		sql.unsafe(
			`COPY ${ADDRESS_BALANCE_STAGE_TABLE} (address, balance) FROM STDIN`,
		).writable(),
		payload,
	);

	const upserted = await sql.unsafe(`
		INSERT INTO layer2_address_balance (address, balance)
		SELECT address, balance FROM ${ADDRESS_BALANCE_STAGE_TABLE}
		ON CONFLICT (address) DO UPDATE
		SET balance = layer2_address_balance.balance + EXCLUDED.balance
		RETURNING address, balance
	`);

	return upserted.map((row) => ({
		address: String(row.address),
		balance: Number(row.balance),
	}));
}
