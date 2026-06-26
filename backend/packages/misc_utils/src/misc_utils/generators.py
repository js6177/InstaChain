import secrets
import string

def generate_secure_password(length: int =32):
    # Exclude '#' — ambiguous in bitcoin.conf (starts a comment).
    alphabet = string.ascii_letters + string.digits + "!@$%^&*()-_=+"
    
    password = ''.join(secrets.choice(alphabet) for _ in range(length))
    
    return password

def generate_alphanumeric_id(length: int = 16):
    alphabet = string.ascii_lowercase + string.digits
    random_id = ''.join(secrets.choice(alphabet) for _ in range(length))
    return random_id