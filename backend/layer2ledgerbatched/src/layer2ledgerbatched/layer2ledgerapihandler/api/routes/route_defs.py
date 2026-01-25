# Route definitions for the Layer2LedgerAPIHandler

# Main router prefixes
DEPOSIT_ROUTER_PREFIX = "/deposit"
TRANSFER_ROUTER_PREFIX = "/transfer"
WITHDRAWAL_ROUTER_PREFIX = "/withdrawal"
EXPLORER_ROUTER_PREFIX = "/explorer"
INFO_ROUTER_PREFIX = "/info"

# Deposit routes
GET_DEPOSIT_ADDRESS_ROUTE = "/get_deposit_address"
DEPOSIT_CONFIRMED_ROUTE = "/deposit_confirmed"

# Transfer routes
PUSH_TRANSACTION_ROUTE = "/push_transaction"

# Withdrawal routes
REQUEST_WITHDRAWAL_ROUTE = "/request_withdrawal"
GET_WITHDRAWAL_REQUESTS_ROUTE = "/get_withdrawal_requests"
WITHDRAWAL_BROADCASTED_ROUTE = "/withdrawal_broadcasted"
WITHDRAWAL_CONFIRMED_ROUTE = "/withdrawal_confirmed"

# Explorer routes
GET_BALANCE_ROUTE = "/get_balance"
GET_TRANSACTION_ROUTE = "/get_transaction"
GET_ALL_TRANSACTIONS_ROUTE = "/get_all_transactions"
GET_FEE_ROUTE = "/get_fee"
