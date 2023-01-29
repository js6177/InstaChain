import ecdsa
import base58
import hashlib
import logging

DEFAULT_KEY_HASH_FUNCTION = hashlib.sha256

class Address:
    privkey = '' # most likely never used
    pubkey = '' # base58 encoded pubkey
    description = ''

    def __init__(self, _pubkey):
        self.pubkey = _pubkey

    def to_dict(self):
        return {'pubkey': self.pubkey, 'privkey': self.privkey, 'description': self.description}

    @staticmethod
    def fromPrivateKey(privatekey, description = ''):
        address = Address('')
        address.privkey = privatekey
        address.description = description
        address.pubkey = ''
        return address

    # This function verifies that the privake key that encrypted the message belongs to the public key (aka the source of the transaction)
    def verify_signature(self, message, signature):
        verifying_key = ecdsa.VerifyingKey.from_string(base58.b58decode(self.pubkey), curve=ecdsa.SECP256k1, hashfunc=DEFAULT_KEY_HASH_FUNCTION)
        verified = False
        try:
            verified = verifying_key.verify(base58.b58decode(signature), message.encode("utf-8"))
        except ecdsa.BadSignatureError:
            logging.warning("Could not verify signature for message: " + message)
            return False
        return verified

    def sign(self, message):
        signing_key = ecdsa.SigningKey.from_string(base58.b58decode(self.privkey), curve=ecdsa.SECP256k1, hashfunc=DEFAULT_KEY_HASH_FUNCTION)
        signature = base58.b58encode(signing_key.sign(message.encode("utf-8")))
        return signature

