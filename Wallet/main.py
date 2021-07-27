import ecdsa
import base64

# SECP256k1 is the Bitcoin elliptic curve
sk = ecdsa.SigningKey.generate(curve=ecdsa.SECP256k1)
vk = sk.get_verifying_key()
sig = sk.sign(b"message")
verified = vk.verify(sig, b"message") # True
sk_str = sk.to_string()
sk_pem = sk.to_pem()
sk_der = sk.to_der()
vk_string = vk.to_string()
vk_pem = vk.to_pem()
vk_der = vk.to_der()

print('Signing key: ', sk_str)
print('Verifying key: ', vk_string)