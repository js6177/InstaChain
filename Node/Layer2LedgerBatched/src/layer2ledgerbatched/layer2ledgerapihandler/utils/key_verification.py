#file to verify various transactions' digital signatures
from layer2ledgerbatched.layer2ledgerapihandler.utils.layer2address import Layer2Address as Address
from layer2ledgerbatched.common.db.models import Transaction as Transaction, TransactionType
import logging

from layer2ledgerbatched.layer2ledgerapihandler.utils import signing_keys
from layer2ledgerbatched.layer2ledgerapihandler.config.config import get_settings, NODE_ASSET_ID

settings = get_settings()
NODE_ID = settings.NODE_ID

def verifyGetDepositAddress(source_pubkey, nonce, signature) -> bool:
    message = buildGetDepositAddressMessage(source_pubkey, nonce)
    verifyingAddress = Address.Address(source_pubkey)
    return verifyingAddress.verify_signature(message, signature)

def buildGetDepositAddressMessage(source_pubkey, nonce) -> str:
    return (NODE_ID + " " + str(NODE_ASSET_ID) + " " + str(TransactionType.INSTRUCTION_GET_DEPOSIT_ADDRESS) + ' ' + source_pubkey + ' ' + nonce)

def verifyDeposit(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, nonce, signature) -> bool:
    message = buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, nonce)
    verifyingAddress = Address.Address(signing_keys.FULLNODE_SIGNING_KEY_PUBKEY)
    return verifyingAddress.verify_signature(message, signature)

def buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, nonce) -> str:
    return (NODE_ID + " " + str(TransactionType.TRX_DEPOSIT) + ' ' + layer1_transaction_id + ' ' + str(layer1_transaction_vout) + ' ' + layer1_address + ' ' + str(amount) + ' ' + nonce)

def verifyWithdrawalBroadcasted(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, withdrawal_id, signature) -> bool:
    message = buildWithdrawalBroadcastedMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, withdrawal_id)
    verifyingAddress = Address.Address(signing_keys.FULLNODE_SIGNING_KEY_PUBKEY)
    return verifyingAddress.verify_signature(message, signature)

def buildWithdrawalBroadcastedMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, withdrawal_id) -> str:
    return (NODE_ID + " " + str(TransactionType.TRX_WITHDRAWAL_BROADCASTED) + ' ' + layer1_transaction_id + ' ' + str(layer1_transaction_vout) + ' ' + layer1_address + ' ' + str(amount) + ' ' + str(withdrawal_id))

def verifyWithdrawalConfirmed(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, signature) -> bool:
    message = buildWithdrawalConfirmedMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount)
    verifyingAddress = Address.Address(signing_keys.FULLNODE_SIGNING_KEY_PUBKEY)
    return verifyingAddress.verify_signature(message, signature)

def buildWithdrawalConfirmedMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount) -> str:
    return (NODE_ID + " " + str(TransactionType.TRX_WITHDRAWAL_CONFIRMED) + ' ' + layer1_transaction_id + ' ' + str(layer1_transaction_vout) + ' ' + layer1_address + ' ' + str(amount))

def verifyLayer1AuditReportSignature(blockHeight, balance, signature) -> bool:
    message = buildLayer1AuditReportMessage(blockHeight, balance)
    verifyingAddress = Address.Address(signing_keys.FULLNODE_SIGNING_KEY_PUBKEY)
    return verifyingAddress.verify_signature(message, signature)

def buildLayer1AuditReportMessage(blockHeight, balance) -> str:
    return (NODE_ID + " " + str(TransactionType.INSTRUCTION_LAYER1_AUDIT) + ' ' + str(blockHeight) + ' ' +str(balance))

def buildTransferMessage(source_pubkey, destination_address_pubkey, amount, fee, nonce) -> str:
    return (NODE_ID + " " + str(NODE_ASSET_ID) + " " + str(TransactionType.TRX_TRANSFER) + " " + source_pubkey + " " + destination_address_pubkey + " " + str(amount) + " " + str(fee) + " " + nonce)

def buildWithdrawalRequestMessage(source_pubkey, withdrawal_address, nonce, amount) -> str:
    return (NODE_ID + " " + str(NODE_ASSET_ID) + " " + str(TransactionType.TRX_WITHDRAWAL_INITIATED) + " " + source_pubkey + " " + withdrawal_address + ' ' + nonce + ' ' + str(amount))