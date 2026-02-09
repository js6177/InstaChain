import secrets
import string

def generate_secure_password(length: int =32):
    # Define the character pool
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*()-_=+"
    
    # Generate a random string by choosing from the pool 'length' times
    password = ''.join(secrets.choice(alphabet) for _ in range(length))
    
    return password

def generate_alphanumeric_id(length: int = 16):
    alphabet = string.ascii_lowercase + string.digits
    random_id = ''.join(secrets.choice(alphabet) for _ in range(length))
    return random_id