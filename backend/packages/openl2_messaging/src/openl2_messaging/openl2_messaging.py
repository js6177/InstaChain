#file to verify various transactions' digital signatures
import enum
from layer2address import Layer2Address as Address
from config_loader.loader import get_backend_common_config, Environment
from .constants import NODE_ASSET_ID
from config_models import CommonBackendSettings

_settings: CommonBackendSettings = get_backend_common_config()
NODE_ID = _settings.node_id
LAYER2_BRIDGE_KEY_PUBKEY = _settings.layer2bridge_signing_public_key

class TransactionType(enum.IntEnum):
    TRX_TRANSFER = 1  # layer2 transfer
    TRX_DEPOSIT = 2  # when a user deposits btc to a deposit address, then funds get credited to his pubkey
    TRX_WITHDRAWAL_INITIATED = 3  # when the user wants to withdraw to a btc address (locks that amount)
    TRX_WITHDRAWAL_BROADCASTED = 4 # when the transaction is broadcasted and in the mempool
    TRX_WITHDRAWAL_CANCELED = 5  # when the transaction gets removed from the layer1 mempool for any reason
    TRX_WITHDRAWAL_CONFIRMED = 6  # when the withdrawal gets confirmed in the layer1 chain
    INSTRUCTION_GET_DEPOSIT_ADDRESS = 7 # instruction to get a deposit address
    INSTRUCTION_LAYER1_AUDIT = 8 # instruction to perform a layer1 audit
    

def verifyMessageSignature(message: str, signature: str, pubkey: str) -> bool:
    verifyingAddress = Address()
    verifyingAddress.from_public_key(pubkey)
    return verifyingAddress.verify(message, signature)

def verifyGetDepositAddress(source_pubkey: str, nonce: str, signature: str) -> bool:
    message = buildGetDepositAddressMessage(source_pubkey, nonce)
    return verifyMessageSignature(message, signature, source_pubkey)

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

def verifyTransferMessage(source_pubkey: str, destination_address_pubkey: str, amount: float, fee: float, nonce: str, signature: str) -> bool:
    message = buildTransferMessage(source_pubkey, destination_address_pubkey, amount, fee, nonce)
    return verifyMessageSignature(message, signature, source_pubkey)

def buildWithdrawalRequestMessage(source_pubkey: str, withdrawal_address: str, nonce: str, amount: float) -> str:
    return (NODE_ID + " " + str(NODE_ASSET_ID) + " " + str(TransactionType.TRX_WITHDRAWAL_INITIATED) + " " + source_pubkey + " " + withdrawal_address + ' ' + nonce + ' ' + str(amount))

def verifyWithdrawalRequestMessage(source_pubkey: str, withdrawal_address: str, nonce: str, amount: float, signature: str) -> bool:
    message = buildWithdrawalRequestMessage(source_pubkey, withdrawal_address, nonce, amount)
    return verifyMessageSignature(message, signature, source_pubkey)
