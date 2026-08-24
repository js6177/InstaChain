import {
	bigint,
	boolean,
	customType,
	integer,
	json,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType() {
		return "bytea";
	},
});

export const transactionTypeEnum = pgEnum("transaction_type", [
	"TRX_TRANSFER",
	"TRX_DEPOSIT",
	"TRX_WITHDRAWAL_INITIATED",
	"TRX_WITHDRAWAL_BROADCASTED",
	"TRX_WITHDRAWAL_CANCELED",
	"TRX_WITHDRAWAL_CONFIRMED",
	"INSTRUCTION_GET_DEPOSIT_ADDRESS",
	"INSTRUCTION_LAYER1_AUDIT",
]);

export const withdrawalStatusEnum = pgEnum("withdrawal_status", [
	"WITHDRAWAL_STATUS_PENDING",
	"WITHDRAWAL_STATUS_ACKNOWLEDGED",
	"WITHDRAWAL_STATUS_BROADCASTED",
	"WITHDRAWAL_STATUS_CONFIRMED",
	"WITHDRAWAL_STATUS_CANCELED",
]);

export const TransactionType = {
	TRX_TRANSFER: 1,
	TRX_DEPOSIT: 2,
	TRX_WITHDRAWAL_INITIATED: 3,
	TRX_WITHDRAWAL_BROADCASTED: 4,
	TRX_WITHDRAWAL_CANCELED: 5,
	TRX_WITHDRAWAL_CONFIRMED: 6,
	INSTRUCTION_GET_DEPOSIT_ADDRESS: 7,
	INSTRUCTION_LAYER1_AUDIT: 8,
} as const;

export type TransactionTypeValue =
	(typeof TransactionType)[keyof typeof TransactionType];

export const WithdrawalStatus = {
	WITHDRAWAL_STATUS_PENDING: 1,
	WITHDRAWAL_STATUS_ACKNOWLEDGED: 2,
	WITHDRAWAL_STATUS_BROADCASTED: 3,
	WITHDRAWAL_STATUS_CONFIRMED: 4,
	WITHDRAWAL_STATUS_CANCELED: 5,
} as const;

export type WithdrawalStatusValue =
	(typeof WithdrawalStatus)[keyof typeof WithdrawalStatus];

export const transactions = pgTable("transactions", {
	timestamp: timestamp("timestamp", { withTimezone: true })
		.defaultNow()
		.notNull(),
	amount: integer("amount").notNull(),
	fee: integer("fee").notNull(),
	sourceAddressPubkey: varchar("source_address_pubkey").notNull(),
	destinationAddressPubkey: varchar("destination_address_pubkey").notNull(),
	transactionType: integer("transaction_type").notNull(),
	layer2TransactionId: varchar("layer2_transaction_id").primaryKey().notNull(),
	signature: varchar("signature").notNull(),
	signatureDate: bigint("signature_date", { mode: "number" }).notNull(),
	layer1TransactionId: varchar("layer1_transaction_id").notNull().default(""),
	layer2WithdrawalId: varchar("layer2_withdrawal_id").notNull().default(""),
	batchHeight: integer("batch_height").notNull().default(0),
});

export const layer2AddressBalance = pgTable("layer2_address_balance", {
	id: serial("id").primaryKey(),
	address: varchar("address").notNull().unique(),
	balance: integer("balance").notNull(),
	timestamp: timestamp("timestamp", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const depositAddresses = pgTable("deposit_addresses", {
	id: serial("id").primaryKey(),
	layer2Address: varchar("layer2_address").notNull(),
	nonce: varchar("nonce").notNull(),
	layer1Address: varchar("layer1_address").notNull().unique(),
	signature: varchar("signature").notNull(),
	dateRequested: timestamp("date_requested", { withTimezone: true })
		.defaultNow()
		.notNull(),
	mpkIndex: integer("mpk_index").notNull(),
});

export const withdrawalRequests = pgTable("withdrawal_requests", {
	id: serial("id").primaryKey(),
	layer1Address: varchar("layer1_address").notNull(),
	layer1TransactionId: varchar("layer1_transaction_id"),
	status: integer("status").notNull(),
	amount: integer("amount").notNull(),
	layer2WithdrawalId: varchar("layer2_withdrawal_id").notNull().unique(),
	serverSignature: varchar("server_signature"),
	layer2TransactionId: varchar("layer2_transaction_id").notNull(),
	withdrawalRequestedTimestamp: bigint("withdrawal_requested_timestamp", {
		mode: "number",
	}).notNull(),
	withdrawalRequestedTimestampStr: timestamp(
		"withdrawal_requested_timestamp_str",
		{
			withTimezone: true,
		},
	)
		.defaultNow()
		.notNull(),
	batchHeight: integer("batch_height").notNull().default(0),
});

export const confirmedWithdrawals = pgTable("confirmed_withdrawals", {
	id: serial("id").primaryKey(),
	layer1TransactionId: varchar("layer1_transaction_id").notNull(),
	layer1TransactionVout: integer("layer1_transaction_vout").notNull(),
	layer1Address: varchar("layer1_address").notNull(),
	amount: integer("amount").notNull(),
	layer2WithdrawalId: varchar("layer2_withdrawal_id").notNull().unique(),
	broadcastedSignature: varchar("broadcasted_signature").notNull(),
	confirmedSignature: varchar("confirmed_signature"),
	confirmed: boolean("confirmed").notNull().default(false),
	confirmationTimestampStr: timestamp("confirmation_timestamp_str", {
		withTimezone: true,
	})
		.defaultNow()
		.notNull(),
});

export const layer1AuditReports = pgTable("layer1_audit_reports", {
	id: serial("id").primaryKey(),
	blockHeight: integer("blockHeight").notNull().unique(),
	balance: integer("balance").notNull(),
	layer1AddressBalances: json("layer1AddressBalances").notNull(),
	timestamp: timestamp("timestamp", { withTimezone: true })
		.defaultNow()
		.notNull(),
	signature: text("signature").notNull(),
});

export const layer1Addresses = pgTable("layer1_addresses", {
	id: serial("id").primaryKey(),
	layer1Address: varchar("layer1Address").notNull().unique(),
	balance: integer("balance").notNull(),
	label: text("label").notNull(),
});

export const transactionDurations = pgTable("transaction_durations", {
	id: serial("id").primaryKey(),
	timestamp: timestamp("timestamp", { withTimezone: true })
		.defaultNow()
		.notNull(),
	duration: integer("duration").notNull(),
	transactionId: varchar("transaction_id").notNull(),
	action: varchar("action").notNull(),
	itemCount: integer("item_count").notNull(),
});

export const keyValueStore = pgTable("key_value_store", {
	key: varchar("key").primaryKey(),
	value: varchar("value").notNull(),
});

/** Per-batch RedisBloom snapshots (BF.SCANDUMP bytes) for restart restore. */
export const transactionIdBloomFilters = pgTable(
	"transaction_id_bloom_filters",
	{
		batchHeight: integer("batch_height").primaryKey().notNull(),
		bloomFilter: bytea("bloom_filter").notNull(),
	},
);

/** Per-batch address-balance RedisBloom snapshots for restart restore. */
export const addressBalanceBloomFilters = pgTable(
	"address_balance_bloom_filters",
	{
		batchHeight: integer("batch_height").primaryKey().notNull(),
		bloomFilter: bytea("bloom_filter").notNull(),
	},
);

export const masterPublicKeyIndices = pgTable("master_public_key_indices", {
	id: serial("id").primaryKey(),
	mpkIndex: bigint("mpk_index", { mode: "number" }).notNull(),
});

export const schema = {
	transactions,
	layer2AddressBalance,
	depositAddresses,
	withdrawalRequests,
	confirmedWithdrawals,
	layer1AuditReports,
	layer1Addresses,
	transactionDurations,
	keyValueStore,
	transactionIdBloomFilters,
	addressBalanceBloomFilters,
	masterPublicKeyIndices,
};

export type TransactionRow = typeof transactions.$inferSelect;
export type TransactionInsert = typeof transactions.$inferInsert;
export type Layer2AddressBalanceRow = typeof layer2AddressBalance.$inferSelect;
export type DepositAddressRow = typeof depositAddresses.$inferSelect;
export type WithdrawalRequestRow = typeof withdrawalRequests.$inferSelect;
export type WithdrawalRequestInsert = typeof withdrawalRequests.$inferInsert;
export type TransactionIdBloomFilterRow = typeof transactionIdBloomFilters.$inferSelect;
export type TransactionIdBloomFilterInsert = typeof transactionIdBloomFilters.$inferInsert;
export type AddressBalanceBloomFilterRow =
	typeof addressBalanceBloomFilters.$inferSelect;
export type AddressBalanceBloomFilterInsert =
	typeof addressBalanceBloomFilters.$inferInsert;
