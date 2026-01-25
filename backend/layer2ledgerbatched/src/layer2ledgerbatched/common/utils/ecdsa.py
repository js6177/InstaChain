from fastecdsa import keys, curve, ecdsa
from fastecdsa.point import Point
from hashlib import sha256
import argparse
import base58


def sign_message(message: str, priv_key_b58: str) -> str:
    """Signs a message with a private key and returns the signature."""
    priv_key_bytes = base58.b58decode(priv_key_b58)
    priv_key = int.from_bytes(priv_key_bytes, 'big')
    r, s = ecdsa.sign(message, priv_key, curve=curve.secp256k1, hashfunc=sha256)
    signature_bytes = r.to_bytes(32, 'big') + s.to_bytes(32, 'big')
    return base58.b58encode(signature_bytes).decode('utf-8')


def verify_message(message: str, signature_b58: str, public_key_b58: str) -> bool:
    """Verifies a message signature with a public key."""
    signature_bytes = base58.b58decode(signature_b58)
    r = int.from_bytes(signature_bytes[:32], 'big')
    s = int.from_bytes(signature_bytes[32:], 'big')

    public_key_bytes = base58.b58decode(public_key_b58)
    x = int.from_bytes(public_key_bytes[:32], 'big')
    y = int.from_bytes(public_key_bytes[32:], 'big')
    public_key = Point(x, y, curve=curve.secp256k1)

    return ecdsa.verify((r, s), message, public_key, curve=curve.secp256k1, hashfunc=sha256)