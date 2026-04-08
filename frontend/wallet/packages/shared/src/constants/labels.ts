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

    // Transaction List / Explorer
    HEADING_RECENT_TRANSACTIONS: "Recent Transactions",
    TEXT_LOADING_TRANSACTIONS: "Loading transactions...",
    TEXT_NO_TRANSACTIONS: "No transactions found.",
    TEXT_TRANSACTION_NOT_FOUND: "Transaction not found.",
    HEADING_TRANSACTION_DETAILS: "Transaction Details",
    TEXT_SEARCHING: "Searching...",

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
