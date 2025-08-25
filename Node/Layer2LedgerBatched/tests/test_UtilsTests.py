from layer2ledgerbatched.common.utils.ecdsa import sign_message, verify_message
from layer2ledgerbatched.Layer2LedgerAPIHandler.utils.layer2address import Layer2Address

def test_sign_message():
    address = Layer2Address("test address")
    address.new_address()
    message = "Hello, World!"
    signature = address.sign(message)
    print(f"signature: {signature}")
    assert verify_message(message, signature, address.public_key_str_base58) == True