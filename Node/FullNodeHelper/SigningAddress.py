import ecdsa
import base58

TRX_TRANSFER = 1  # regular 2nd layer transfer
TRX_DEPOSIT = 2  # when a user deposits btc to a deposit address, then funds get credited to his pubkey
TRX_WITHDRAWAL_INITIATED = 3  # when the user wants to withdraw to a btc address (locks that amount)
TRX_WITHDRAWAL_BROADCASTED = 4 # when the transaction is broadcasted and in the mempool
TRX_WITHDRAWAL_CANCELED = 5  # when the transaction gets removed from the layer1 mempool for any reason
TRX_WITHDRAWAL_CONFIRMED = 6  # when the withdrawal gets confirmed in the layer1 chain


DEFAULT_ELLIPTICAL_CURVE = ecdsa.SECP256k1
SIGNING_KEY = "4JabS7wSHXuLrf3ZgxGristcyQh9QScnymVvpRYqmx6s"
NODE_ID = 'BbwLnyLR9eVjL2qb'

def sign_string(signing_key, message):
        privkey = ecdsa.SigningKey.from_string(base58.b58decode(signing_key), curve=DEFAULT_ELLIPTICAL_CURVE)
        signature = base58.b58encode(privkey.sign(message.encode("utf-8")))
        return signature

def signDepositConfirmedMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount,):
    message = NODE_ID + " " + str(TRX_DEPOSIT) + ' ' + layer1_transaction_id + ' ' + str(layer1_transaction_vout) + ' ' + layer1_address + ' ' + str(amount)
    return sign_string(SIGNING_KEY, message)

def signWithdrawalBroadcastedMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, withdrawal_id):
    message = NODE_ID + " " + str(TRX_WITHDRAWAL_BROADCASTED) + ' ' + layer1_transaction_id + ' ' + str(layer1_transaction_vout) + ' ' + layer1_address + ' ' + str(amount) + ' ' + str(withdrawal_id)
    return sign_string(SIGNING_KEY, message)

def signWithdrawalConfirmedMessage(layer1_transaction_id, layer1_transaction_vout, layer1_address, amount):
    message = NODE_ID + " " + str(TRX_WITHDRAWAL_CONFIRMED) + ' ' + layer1_transaction_id + ' ' + str(layer1_transaction_vout) + ' ' + layer1_address + ' ' + str(amount)
    return sign_string(SIGNING_KEY, message)
