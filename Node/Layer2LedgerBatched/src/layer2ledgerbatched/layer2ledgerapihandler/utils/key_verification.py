#file to verify various transactions' digital signatures
from layer2ledgerbatched.layer2ledgerapihandler.utils.layer2address import Layer2Address as Address
from layer2ledgerbatched.common.db.models import Transaction as Transaction, TransactionType

from layer2ledgerbatched.layer2ledgerapihandler.config.config import get_settings, NODE_ASSET_ID

settings = get_settings()
NODE_ID = settings.NODE_ID
LAYER2_BRIDGE_KEY_PUBKEY = settings.layer2bridge_key_pubkey

def verifyMessageSignature(message: str, signature: str, pubkey: str) -> bool:
    verifyingAddress = Address()
    verifyingAddress.from_public_key(pubkey)
    return verifyingAddress.verify(message, signature)

def verifyGetDepositAddress(source_pubkey: str, nonce: str, signature: str) -> bool:
    message = buildGetDepositAddressMessage(source_pubkey, nonce)
    return verifyMessageSignature(message, signature, LAYER2_BRIDGE_KEY_PUBKEY)

def buildGetDepositAddressMessage(layer2_address_public_key: str, nonce: str) -> str:
    return (NODE_ID + " " + str(NODE_ASSET_ID) + " " + str(TransactionType.INSTRUCTION_GET_DEPOSIT_ADDRESS) + ' ' + layer2_address_public_key + ' ' + nonce)

def verifyDeposit(layer1_transaction_id: str, layer1_transaction_vout: int, layer1_address: str, amount: float, nonce: str, signature: str) -> bool:
    message = buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, nonce)
    return verifyMessageSignature(message, signature, LAYER2_BRIDGE_KEY_PUBKEY)

def buildDepositMessage(layer1_transaction_id: str, layer1_transaction_vout: int, layer1_address: str, amount: float, nonce: str) -> str:
    return (NODE_ID + " " + str(TransactionType.TRX_DEPOSIT) + ' ' + layer1_transaction_id + ' ' + str(layer1_transaction_vout) + ' ' + layer1_address + ' ' + str(amount) + ' ' + nonce)

def verifyWithdrawalBroadcasted(layer1_transaction_id: str, layer1_transaction_vout: int, layer1_address: str, amount: float, withdrawal_id: str, signature: str) -> bool:
    message = buildWithdrawalBroadcastedMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, withdrawal_id)
    return verifyMessageSignature(message, signature, LAYER2_BRIDGE_KEY_PUBKEY)

def buildWithdrawalBroadcastedMessage(layer1_transaction_id: str, layer1_transaction_vout: int, layer1_address: str, amount: float, withdrawal_id: str) -> str:
    return (NODE_ID + " " + str(TransactionType.TRX_WITHDRAWAL_BROADCASTED) + ' ' + layer1_transaction_id + ' ' + str(layer1_transaction_vout) + ' ' + layer1_address + ' ' + str(amount) + ' ' + str(withdrawal_id))

def verifyWithdrawalConfirmed(layer1_transaction_id: str, layer1_transaction_vout: int, layer1_address: str, amount: float, signature: str) -> bool:
    message = buildWithdrawalConfirmedMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount)
    return verifyMessageSignature(message, signature, LAYER2_BRIDGE_KEY_PUBKEY)

def buildWithdrawalConfirmedMessage(layer1_transaction_id: str, layer1_transaction_vout: int, layer1_address: str, amount: float) -> str:
    return (NODE_ID + " " + str(TransactionType.TRX_WITHDRAWAL_CONFIRMED) + ' ' + layer1_transaction_id + ' ' + str(layer1_transaction_vout) + ' ' + layer1_address + ' ' + str(amount))

def verifyLayer1AuditReportSignature(blockHeight: int, balance: float, signature: str) -> bool:
    message = buildLayer1AuditReportMessage(blockHeight, balance)
    return verifyMessageSignature(message, signature, LAYER2_BRIDGE_KEY_PUBKEY)

def buildLayer1AuditReportMessage(blockHeight: int, balance: float) -> str:
    return (NODE_ID + " " + str(TransactionType.INSTRUCTION_LAYER1_AUDIT)  + ' ' + str(blockHeight) + ' ' +str(balance))

def buildTransferMessage(source_pubkey: str, destination_address_pubkey: str, amount: float, fee: float, nonce: str) -> str:
    return (NODE_ID + " " + str(NODE_ASSET_ID) + " " + str(TransactionType.TRX_TRANSFER) + " " + source_pubkey + " " + destination_address_pubkey + " " + str(amount) + " " + str(fee) + " " + nonce)

def buildWithdrawalRequestMessage(source_pubkey: str, withdrawal_address: str, nonce: str, amount: float) -> str:
    return (NODE_ID + " " + str(NODE_ASSET_ID) + " " + str(TransactionType.TRX_WITHDRAWAL_INITIATED) + " " + source_pubkey + " " + withdrawal_address + ' ' + nonce + ' ' + str(amount))