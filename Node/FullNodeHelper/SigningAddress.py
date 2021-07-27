import ecdsa
import base58

TRX_DEPOSIT = 2


DEFAULT_ELLIPTICAL_CURVE = ecdsa.SECP256k1
SIGNING_KEY = "4JabS7wSHXuLrf3ZgxGristcyQh9QScnymVvpRYqmx6s"
NODE_ID = 'BbwLnyLR9eVjL2qb'

def sign_string(signing_key, message):
        privkey = ecdsa.SigningKey.from_string(base58.b58decode(signing_key), curve=DEFAULT_ELLIPTICAL_CURVE)
        signature = base58.b58encode(privkey.sign(message.encode("utf-8")))
        return signature

def buildDepositConfirmedMessage(transaction_id, nonce, amount):
    message = NODE_ID + " " + str(TRX_DEPOSIT) + ' ' + transaction_id + ' ' + nonce + ' ' + str(amount)
    return message

def signDepositConfirmedMessage(transaction_id, nonce, amount):
    return sign_string(SIGNING_KEY, buildDepositConfirmedMessage(transaction_id, nonce, amount))