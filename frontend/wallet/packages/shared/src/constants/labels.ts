export const LABELS = {
	// General Actions
	BUTTON_REFRESH: "Refresh",
	BUTTON_REFRESHING: "Refreshing...",
	BUTTON_TRANSFER: "Transfer",
	BUTTON_SENDING: "Sending...",
	BUTTON_WITHDRAW: "Withdraw",
	BUTTON_WITHDRAWING: "Withdrawing...",
	BUTTON_DEPOSIT: "Deposit",
	BUTTON_GENERATING: "Generating...",
	BUTTON_GET_DEPOSIT_ADDRESS: "Get Deposit Address",
	BUTTON_MAX: "Max",
	BUTTON_SEARCH: "Search",
	BUTTON_HIDE: "Hide",
	BUTTON_CANCEL: "Cancel",
	BUTTON_HIDE_PERMANENTLY: "Hide Permanently",
	BUTTON_RESTORE_WALLET: "Restore Wallet",
	BUTTON_RESTORE: "Restore",

	// Transaction List / Explorer
	HEADING_RECENT_TRANSACTIONS: "Recent Transactions",
	TEXT_LOADING_TRANSACTIONS: "Loading transactions...",
	TEXT_NO_TRANSACTIONS: "No transactions found.",
	TEXT_TRANSACTION_NOT_FOUND: "Transaction not found.",
	HEADING_TRANSACTION_DETAILS: "Transaction Details",
	TEXT_SEARCHING: "Searching...",
	DIALOG_HIDE_MNEMONIC_TITLE: "Hide Mnemonic?",
	DIALOG_HIDE_MNEMONIC_DESC:
		"This will hide the mnemonic. Make sure you copied it down as it cannot be displayed again.",

	// Transaction Types
	TX_TYPE_TRANSFER: "Transfer",
	TX_TYPE_DEPOSIT: "Deposit",
	TX_TYPE_WITHDRAWAL_INITIATED: "Withdrawal Initiated",
	TX_TYPE_WITHDRAWAL_BROADCASTED: "Withdrawal Broadcasted",
	TX_TYPE_WITHDRAWAL_CANCELED: "Withdrawal Canceled",
	TX_TYPE_WITHDRAWAL_CONFIRMED: "Withdrawal Confirmed",
	TX_TYPE_UNKNOWN: "Unknown",

	// Transaction Item Keys
	KEY_ID: "ID:",
	KEY_TYPE: "Type:",
	KEY_AMOUNT: "Amount:",
	KEY_FEE: "Fee:",
	KEY_FROM: "From:",
	KEY_TO: "To:",
	KEY_DATE: "Date:",
	KEY_SIGNATURE: "Signature:",
	KEY_LAYER1_TXID: "Layer1 TxID:",
	VALUE_PENDING: "Pending",

	// Amount Input
	PLACEHOLDER_ENTER_AMOUNT: "Enter amount",
	TITLE_USE_MAX_BALANCE: "Use max balance",
} as const;

export const TEST_IDS = {
	BALANCE_DISPLAY: "balance-display",
	TRANSACTION_TITLE: "transaction-item-title",
	RESTORE_WALLET_TRIGGER: "restore-wallet-trigger",
	MNEMONIC_INPUT: "mnemonic-input",
	RESTORE_WALLET_BUTTON: "restore-wallet-button",
} as const;
