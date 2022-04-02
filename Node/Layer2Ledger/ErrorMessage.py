ERROR_SUCCESS = 0
ERROR_UNKNOWN = 1
ERROR_CANNOT_VERIFY_SIGNATURE = 10
ERROR_CANNOT_DUPLICATE_TRANSACTION = 11
ERROR_INSUFFICIENT_FUNDS = 12
ERROR_TRANSACTION_ID_NOT_FOUND = 13
ERROR_ONBOARDING_PUBKEY_MISMATCH = 14
ERROR_CANNOT_CANCEL_WITHDRAWAL_MULTIPLE_TIMES = 15
ERROR_DEPOSIT_ADDRESS_NOT_FOUND = 16
ERROR_DUPLICATE_TRANSACTION_ID = 17
ERROR_COULD_NOT_FIND_WITHDRAWAL_REQUEST = 18
ERROR_DATABASE_TRANSACTIONAL_ERROR = 19
ERROR_FEATURE_NOT_SUPPORTED = 20
ERROR_NEGATIVE_AMOUNT = 21
ERROR_AMOUNT_LESS_THAN_FEE = 22
ERROR_ADDRESS_LOCKED = 23
ERROR_NOT_ALPHANUMERIC = 24
ERROR_FAILED_TO_WRITE_TO_DATABASE = 25
ERROR_CANNOT_TRANSFER_USING_ONBOARDING_KEY = 26

error_mapping = {
ERROR_SUCCESS: "Success",
ERROR_UNKNOWN: "Unknown error",
ERROR_CANNOT_VERIFY_SIGNATURE: "Invalid signature. Cannot verify that the signature was signed by the senders's public key",
ERROR_CANNOT_DUPLICATE_TRANSACTION: "Transaction with that ID (nonce) already exists",
ERROR_INSUFFICIENT_FUNDS: "Insufficient funds",
ERROR_TRANSACTION_ID_NOT_FOUND: "Cannot find the transaction",
ERROR_ONBOARDING_PUBKEY_MISMATCH: "The public key used to sign a deposit/withdrawal transaction is not a correct public key",
ERROR_CANNOT_CANCEL_WITHDRAWAL_MULTIPLE_TIMES: "You can only cancel a withdrawal once",
ERROR_DEPOSIT_ADDRESS_NOT_FOUND: "The address that funds were deposited to was not found",
ERROR_DUPLICATE_TRANSACTION_ID: "The nonce must be unique",
ERROR_COULD_NOT_FIND_WITHDRAWAL_REQUEST: "The withdraw request was not found",
ERROR_DATABASE_TRANSACTIONAL_ERROR: "Transaction failed due to server side DB load. Please try again",
ERROR_FEATURE_NOT_SUPPORTED: "This feature is not supported",
ERROR_NEGATIVE_AMOUNT: "The transaction amount or fee cannot be negative",
ERROR_AMOUNT_LESS_THAN_FEE: "The amount must be greater than the fee",
ERROR_ADDRESS_LOCKED: "The address is locked because it is being processed by another transaction. Please try again",
ERROR_NOT_ALPHANUMERIC: "Transaction ids and addresses need to be alphanumeric",
ERROR_FAILED_TO_WRITE_TO_DATABASE: "Failed to write an entity to the database (the .put() method failed)",
ERROR_CANNOT_TRANSFER_USING_ONBOARDING_KEY: "The onboarding signing key cannot be used to create a transfer transaction"
}

def build_error_message(error_code, error_message = ''):
    return {'error_code': error_code, 'error_message': error_message or error_mapping[error_code]}
