from layer2ledgerbatched.common.utils.ecdsa import sign_message, verify_message
from layer2ledgerbatched.layer2ledgerapihandler.utils.layer2address import Layer2Address

def random_string(length: int):
    import random
    import string
    return ''.join(random.choice(string.ascii_letters + string.digits) for _ in range(length))

def test_sign_message() -> None:
    address = Layer2Address("test address")
    address.new_address()
    message = random_string(32)
    print(f"message: {message}")
    signature = address.sign(message)
    print(f"signature: {signature}")
    assert verify_message(message, signature, address.public_key_str_base58) == True

def test_sign_verify_speed() -> None:
    import time


    message_signatures: dict[str, (str,str)] = {} # stores the signatures for each message. key: message, value: (signature, public_key)

    iterations = 1000
    start_time = time.time()
    for _ in range(iterations):
        signing_address = Layer2Address("signing address")
        signing_address.new_address()
        message = random_string(32)
        signature = signing_address.sign(message)
        message_signatures[message] = (signature, signing_address.public_key_str_base58)
    end_time = time.time()
    
    total_time = end_time - start_time
    avg_sign_time = total_time / iterations
    print(f"Average signing time over {iterations} iterations: {avg_sign_time:.6f} seconds")
    assert avg_sign_time < 0.1
    
    start_time = time.time()
    for msg, (sig, pub_key) in message_signatures.items():
        verifying_address = Layer2Address("verifying address")
        verifying_address.from_public_key(pub_key)
        assert verifying_address.verify(msg, sig) == True
    end_time = time.time()
    
    total_time = end_time - start_time
    avg_verify_time = total_time / len(message_signatures)
    print(f"Average verification time over {len(message_signatures)} iterations: {avg_verify_time:.6f} seconds")
    assert avg_verify_time < 0.1