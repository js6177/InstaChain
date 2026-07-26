export const Services = {
	LAYER2LEDGER_COMMON: "layer2ledger-common",
	LAYER2LEDGER_APIHANDLER: "layer2ledger-apihandler",
	LAYER2LEDGER_TESTHELPER: "layer2ledger-testhelper",
	LAYER2LEDGEROAUTHMANAGER: "layer2ledgeroauthmanager",
	LAYER2LEDGERBRIDGE: "layer2ledgerbridge",
	BACKEND_COMMON: "backend-common",
} as const;

export type ServiceName = (typeof Services)[keyof typeof Services];

/** Intermediate config filenames written during key generation. */
export const Intermediate = {
	BITCOIN_CORE_MASTER_KEYS: "temp-bitcoincore-master-keys",
} as const;

export const Environment = {
	DEV: "dev",
	PROD: "prod",
	TEST: "test",
	DEFAULT: "prod",
} as const;

export type EnvironmentName = (typeof Environment)[keyof typeof Environment];
