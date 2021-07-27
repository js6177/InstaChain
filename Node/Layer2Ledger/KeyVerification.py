#file to verify various transactions' digital signatures
import Address
import Transaction
import logging
import signing_keys
from NodeInfoAPI import NODE_ID

def verifyTransactionSignature(source_pubkey, destination_address, amount, fee, nonce, signature):
    message = NODE_ID + " " + "1 " + source_pubkey + " " + destination_address + " " + str(amount) + " " + str(fee) + " " + nonce
    pass

def verifyGetDepositAddress(source_pubkey, nonce, signature):
    message = NODE_ID + " " + source_pubkey + ' ' + nonce
    verifyingAddress = Address.Address(source_pubkey)
    return verifyingAddress.verify_signature(message, signature)

def verifyDeposit(transaction_id, amount, nonce, signature):
    message = NODE_ID + " " + str(Transaction.Transaction.TRX_DEPOSIT) + ' ' + transaction_id + ' ' + nonce + ' ' + str(amount)
    verifyingAddress = Address.Address(signing_keys.deposit_signing_key_pubkey)
    return verifyingAddress.verify_signature(message, signature)