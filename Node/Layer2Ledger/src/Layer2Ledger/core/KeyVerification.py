#file to verify various transactions' digital signatures
import Address as Address
import Transaction
import logging
import signing_keys
from NodeInfoAPI import NODE_ID, NODE_ASSET_ID

def verifyGetDepositAddress(source_pubkey, nonce, signature):
    message = buildGetDepositAddressMessage(source_pubkey, nonce)
    verifyingAddress = Address.Address(source_pubkey)
    return verifyingAddress.verify_signature(message, signature)

def buildGetDepositAddressMessage(source_pubkey, nonce):
    return (NODE_ID + " " + str(NODE_ASSET_ID) + " " + str(Transaction.Transaction.INSTRUCTION_GET_DEPOSIT_ADDRESS) + ' ' + source_pubkey + ' ' + nonce)

def verifyDeposit(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, nonce, signature):
    message = buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, nonce)
    verifyingAddress = Address.Address(signing_keys.FULLNODE_SIGNING_KEY_PUBKEY)
    return verifyingAddress.verify_signature(message, signature)

def buildDepositMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, nonce):
    return (NODE_ID + " " + str(Transaction.Transaction.TRX_DEPOSIT) + ' ' + layer1_transaction_id + ' ' + str(layer1_transaction_vout) + ' ' + layer1_address + ' ' + str(amount) + ' ' + nonce)

def verifyWithdrawalBroadcasted(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, withdrawal_id, signature):
    message = buildWithdrawalBroadcastedMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, withdrawal_id)
    verifyingAddress = Address.Address(signing_keys.FULLNODE_SIGNING_KEY_PUBKEY)
    return verifyingAddress.verify_signature(message, signature)

def buildWithdrawalBroadcastedMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, withdrawal_id):
    return (NODE_ID + " " + str(Transaction.Transaction.TRX_WITHDRAWAL_BROADCASTED) + ' ' + layer1_transaction_id + ' ' + str(layer1_transaction_vout) + ' ' + layer1_address + ' ' + str(amount) + ' ' + str(withdrawal_id))

def verifyWithdrawalConfirmed(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, signature):
    message = buildWithdrawalConfirmedMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount)
    verifyingAddress = Address.Address(signing_keys.FULLNODE_SIGNING_KEY_PUBKEY)
    return verifyingAddress.verify_signature(message, signature)

def buildWithdrawalConfirmedMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount):
    return (NODE_ID + " " + str(Transaction.Transaction.TRX_WITHDRAWAL_CONFIRMED) + ' ' + layer1_transaction_id + ' ' + str(layer1_transaction_vout) + ' ' + layer1_address + ' ' + str(amount))

def verifyLayer1AuditReportSignature(blockHeight, balance, signature):
    message = buildLayer1AuditReportMessage(blockHeight, balance)
    verifyingAddress = Address.Address(signing_keys.FULLNODE_SIGNING_KEY_PUBKEY)
    return verifyingAddress.verify_signature(message, signature)

def buildLayer1AuditReportMessage(blockHeight, balance):
    return (NODE_ID + " " + str(Transaction.Transaction.INSTRUCTION_LAYER1_AUDIT) + ' ' + str(blockHeight) + ' ' +str(balance))

def buildTransferMessage(source_pubkey, destination_address_pubkey, amount, fee, nonce):
    return (NODE_ID + " " + str(NODE_ASSET_ID) + " " + str(Transaction.Transaction.TRX_TRANSFER) + " " + source_pubkey + " " + destination_address_pubkey + " " + str(amount) + " " + str(fee) + " " + nonce)

def buildWithdrawalRequestMessage(source_pubkey, withdrawal_address, nonce, amount):
    return (NODE_ID + " " + str(NODE_ASSET_ID) + " " + str(Transaction.Transaction.TRX_WITHDRAWAL_INITIATED) + " " + source_pubkey + " " + withdrawal_address + ' ' + nonce + ' ' + str(amount))