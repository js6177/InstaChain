import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema";

export type Layer2LedgerDbClient = PostgresJsDatabase<typeof schema>;
export type Layer2LedgerDatabase = {
	db: Layer2LedgerDbClient;
	sql: postgres.Sql;
};

export interface DatabaseSettings {
	dbUser: string;
	dbPassword: string;
	dbHost: string;
	dbPort: string;
	dbName: string;
}

export function buildDatabaseUrl(settings: DatabaseSettings): string {
	return `postgres://${settings.dbUser}:${settings.dbPassword}@${settings.dbHost}:${settings.dbPort}/${settings.dbName}`;
}

export function createDatabase(
	settings: DatabaseSettings,
	options?: {
		maxConnections?: number;
		/**
		 * Prepared statements are incompatible with PgBouncer transaction pooling.
		 * Set false when connecting through PgBouncer.
		 */
		prepare?: boolean;
	},
): Layer2LedgerDatabase {
	// Keep per-process client pools modest; apihandler multiplexes via PgBouncer.
	const sql = postgres(buildDatabaseUrl(settings), {
		max: options?.maxConnections ?? 10,
		prepare: options?.prepare ?? true,
		// Do not print notices to console.
		onnotice: () => {},
	});
	const db = drizzle(sql, { schema });
	return { db, sql };
}

export async function migrateDatabase(
	sql: postgres.Sql,
	options?: { dropExisting?: boolean },
): Promise<void> {
	if (options?.dropExisting) {
		// Drop legacy SQLAlchemy schema (Python) which used enum types.
		// This repo’s tests reuse the same Postgres volume across rewrites, so we must
		// reset tables/types to match the new Bun/TS schema.
		await sql`DROP TABLE IF EXISTS transactions CASCADE`;
		await sql`DROP TABLE IF EXISTS layer2_address_balance CASCADE`;
		await sql`DROP TABLE IF EXISTS deposit_addresses CASCADE`;
		await sql`DROP TABLE IF EXISTS withdrawal_requests CASCADE`;
		await sql`DROP TABLE IF EXISTS confirmed_withdrawals CASCADE`;
		await sql`DROP TABLE IF EXISTS layer1_audit_reports CASCADE`;
		await sql`DROP TABLE IF EXISTS layer1_addresses CASCADE`;
		await sql`DROP TABLE IF EXISTS transaction_durations CASCADE`;
		await sql`DROP TABLE IF EXISTS key_value_store CASCADE`;
		await sql`DROP TABLE IF EXISTS transaction_id_bloom_filters CASCADE`;
		await sql`DROP TABLE IF EXISTS address_balance_bloom_filters CASCADE`;
		await sql`DROP TABLE IF EXISTS master_public_key_indices CASCADE`;

		// Legacy enum types created by SQLAlchemy.
		await sql`DROP TYPE IF EXISTS transactiontype CASCADE`;
		await sql`DROP TYPE IF EXISTS withdrawalstatus CASCADE`;
	}

	await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      amount INTEGER NOT NULL,
      fee INTEGER NOT NULL,
      source_address_pubkey VARCHAR NOT NULL,
      destination_address_pubkey VARCHAR NOT NULL,
      transaction_type INTEGER NOT NULL,
      layer2_transaction_id VARCHAR PRIMARY KEY NOT NULL,
      signature VARCHAR NOT NULL,
      signature_date BIGINT NOT NULL,
      layer1_transaction_id VARCHAR NOT NULL DEFAULT '',
      layer2_withdrawal_id VARCHAR NOT NULL DEFAULT '',
      batch_height INTEGER NOT NULL DEFAULT 0
    )
  `;
	await sql`
    CREATE TABLE IF NOT EXISTS layer2_address_balance (
      id SERIAL PRIMARY KEY,
      address VARCHAR NOT NULL UNIQUE,
      balance INTEGER NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
	await sql`
    CREATE TABLE IF NOT EXISTS deposit_addresses (
      id SERIAL PRIMARY KEY,
      layer2_address VARCHAR NOT NULL,
      nonce VARCHAR NOT NULL,
      layer1_address VARCHAR NOT NULL UNIQUE,
      signature VARCHAR NOT NULL,
      date_requested TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      mpk_index INTEGER NOT NULL
    )
  `;
	await sql`
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id SERIAL PRIMARY KEY,
      layer1_address VARCHAR NOT NULL,
      layer1_transaction_id VARCHAR,
      status INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      layer2_withdrawal_id VARCHAR NOT NULL UNIQUE,
      server_signature VARCHAR,
      layer2_transaction_id VARCHAR NOT NULL,
      withdrawal_requested_timestamp BIGINT NOT NULL,
      withdrawal_requested_timestamp_str TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      batch_height INTEGER NOT NULL DEFAULT 0
    )
  `;
	await sql`
    CREATE TABLE IF NOT EXISTS confirmed_withdrawals (
      id SERIAL PRIMARY KEY,
      layer1_transaction_id VARCHAR NOT NULL,
      layer1_transaction_vout INTEGER NOT NULL,
      layer1_address VARCHAR NOT NULL,
      amount INTEGER NOT NULL,
      layer2_withdrawal_id VARCHAR NOT NULL UNIQUE,
      broadcasted_signature VARCHAR NOT NULL,
      confirmed_signature VARCHAR,
      confirmed BOOLEAN NOT NULL DEFAULT FALSE,
      confirmation_timestamp_str TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
	await sql`
    CREATE TABLE IF NOT EXISTS layer1_audit_reports (
      id SERIAL PRIMARY KEY,
      "blockHeight" INTEGER NOT NULL UNIQUE,
      balance INTEGER NOT NULL,
      "layer1AddressBalances" JSONB NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      signature TEXT NOT NULL
    )
  `;
	await sql`
    CREATE TABLE IF NOT EXISTS layer1_addresses (
      id SERIAL PRIMARY KEY,
      "layer1Address" VARCHAR NOT NULL UNIQUE,
      balance INTEGER NOT NULL,
      label TEXT NOT NULL
    )
  `;
	await sql`
    CREATE TABLE IF NOT EXISTS transaction_durations (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      duration INTEGER NOT NULL,
      transaction_id VARCHAR NOT NULL,
      action VARCHAR NOT NULL,
      item_count INTEGER NOT NULL
    )
  `;
	await sql`
    CREATE TABLE IF NOT EXISTS key_value_store (
      key VARCHAR PRIMARY KEY,
      value VARCHAR NOT NULL
    )
  `;
	await sql`
    CREATE TABLE IF NOT EXISTS transaction_id_bloom_filters (
      batch_height INTEGER PRIMARY KEY NOT NULL,
      bloom_filter BYTEA NOT NULL
    )
  `;
	await sql`
    CREATE TABLE IF NOT EXISTS address_balance_bloom_filters (
      batch_height INTEGER PRIMARY KEY NOT NULL,
      bloom_filter BYTEA NOT NULL
    )
  `;
	await sql`
    CREATE TABLE IF NOT EXISTS master_public_key_indices (
      id SERIAL PRIMARY KEY,
      mpk_index BIGINT NOT NULL
    )
  `;
}
