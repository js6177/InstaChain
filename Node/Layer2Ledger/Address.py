import ecdsa
import base58
import hashlib
import logging

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

    #will return the base58 encoded sha256 of public key, the string which you pay to
    def get_payable_address(self):
        m = hashlib.sha256()
        m.update(self.pubkey.encode("utf-8"))
        sha256hash = m.digest()
        return base58.b58encode(sha256hash).decode("utf-8")

    # This function verifies that the privake key that encrypted the message belongs to the public key (aka the source of the transaction)
    def verify_signature(self, message, signature):
        #logging.info('message: ' + message + ' pubkey: ' + self.pubkey)
        verifying_key = ecdsa.VerifyingKey.from_string(base58.b58decode(self.pubkey), curve=ecdsa.SECP256k1)
        verified = False
        try:
            verified = verifying_key.verify(base58.b58decode(signature), message.encode("utf-8"))
        except ecdsa.BadSignatureError:
            logging.warning("Could not verify signature for message: " + message)
            return False
        return verified

    def sign(self, message):
        #verifying_key = ecdsa.VerifyingKey.from_string(base58.b58decode(self.pubkey), curve=ecdsa.SECP256k1)
        signing_key = ecdsa.SigningKey.from_string(base58.b58decode(self.privkey), curve=ecdsa.SECP256k1)
        signature = base58.b58encode(signing_key.sign(message.encode("utf-8")))
        return signature

