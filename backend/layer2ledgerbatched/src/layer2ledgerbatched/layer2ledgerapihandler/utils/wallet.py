"""Wallet derivation utilities shared across layer2ledger services."""

from __future__ import annotations

import hashlib

import base58

from layer2ledgerbatched.layer2ledgerapihandler.utils.layer2address import Layer2Address


def address_from_mnemonic(mnemonic_words: list[str], label: str = "test") -> Layer2Address:
    """Match ``Layer2Wallet.fromMnemonic`` in the web wallet (sha256 of joined words)."""
    priv_key_bytes = hashlib.sha256("-".join(mnemonic_words).encode()).digest()
    address = Layer2Address(label)
    address.from_private_key(base58.b58encode(priv_key_bytes).decode())
    return address
