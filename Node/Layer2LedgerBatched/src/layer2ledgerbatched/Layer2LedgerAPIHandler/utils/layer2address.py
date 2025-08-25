from fastecdsa import keys, curve, ecdsa
from fastecdsa.point import Point
from hashlib import sha256
import argparse
import base58
from layer2ledgerbatched.common.utils.ecdsa import sign_message, verify_message


class Layer2Address:
    label: str
    private_key_str_base58: str
    public_key_str_base58: str
    private_key_bytes: bytes
    pub_key_bytes: bytes

    def __init__(self, label: str):
        self.label = label

    def __str__(self):
        return f"{self.label}: private_key: {self.private_key_str_base58}, public_key: {self.public_key_str_base58}"

    def new_address(self):
        priv_key, pub_key = keys.gen_keypair(curve=curve.secp256k1)
        self.priv_key_bytes = priv_key.to_bytes(32, 'big')
        self.pub_key_bytes = pub_key.x.to_bytes(32, 'big') + pub_key.y.to_bytes(32, 'big')
        
        priv_key_b58 = base58.b58encode(self.priv_key_bytes).decode('utf-8')
        pub_key_b58 = base58.b58encode(self.pub_key_bytes).decode('utf-8')

        self.private_key_str_base58 = priv_key_b58
        self.public_key_str_base58 = pub_key_b58

    def sign(self, message: str):
        return sign_message(message, self.private_key_str_base58)
