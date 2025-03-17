import json
import pytest
import random
import string
from Address import Address
from config import load_config
import ecdsa
import base58
from main import app
from NodeInfoAPI import NODE_ID, NODE_ASSET_ID
from Transaction import Transaction

def generate_new_address() -> tuple[str, str]:
    sk = ecdsa.SigningKey.generate(curve=ecdsa.SECP256k1)
    vk = sk.get_verifying_key()

    urlsafe_pubkey = base58.b58encode(vk.to_string())
    urlsafe_privkey = base58.b58encode(sk.to_string())

    return (urlsafe_privkey, urlsafe_pubkey.decode('utf-8'))

def generate_nonce(length=16) -> str:
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def is_successful_response(response) -> bool:
    return response.status_code == 200 and response.json['error_code'] == 0

@pytest.fixture
def client():
    with app.test_client() as client:
        yield client

def test_deposit_and_check_balance(client):
    # Load config
    config = load_config()
    
    # Generate L2 address
    l2_address_priv_key, l2_address_pub_key = generate_new_address()
    l2_address = Address.fromPrivateKey(l2_address_priv_key)
    print(f"Generated L2 address: {l2_address_pub_key}")
    
    # Generate nonce
    nonce = generate_nonce()
    
    # Generate message to sign for /getNewDepositAddress
    message = f"{NODE_ID} {NODE_ASSET_ID} {Transaction.INSTRUCTION_GET_DEPOSIT_ADDRESS} {l2_address_pub_key} {nonce}"
    signature = l2_address.sign(message)
    print(f"getNewDepositAddress Message: {message}")
    print(f"getNewDepositAddress Signature: {signature}")
    
    # Get L1 deposit address
    response = client.get('/getNewDepositAddress', query_string={
        'layer2_address_pubkey': l2_address_pub_key,
        'nonce': nonce,
        'signature': signature
    })
    assert is_successful_response(response)
    deposit_address = response.json['layer1_deposit_address']
    
    # Simulate Layer1 deposit
    deposit_nonce = generate_nonce()
    deposit_amount = 1000
    layer1_transaction_id = generate_nonce()
    layer1_transaction_vout = 0
    deposit_message = f"{NODE_ID} {Transaction.TRX_DEPOSIT} {layer1_transaction_id} {layer1_transaction_vout} {deposit_address} {deposit_amount} {deposit_nonce}"
    onboarding_transaction_signing_address = Address.fromPrivateKey(config['Functional_Tests']['Onboarding_Deposit_Address']['private_key'])
    signature = onboarding_transaction_signing_address.sign(deposit_message)
    
    deposit_data = { 
        "transactions": [{
            'layer1_transaction_id': layer1_transaction_id,
            'layer1_transaction_vout': layer1_transaction_vout,
            'layer1_address': deposit_address,
            'amount': deposit_amount,
            'nonce': deposit_nonce,
            'signature': signature.decode('utf-8')}
        ]
    }
    response = client.post('/depositFunds', json=deposit_data)
    assert is_successful_response(response)
    
    # Check balance of L2 address
    balance_data = {'public_keys': [l2_address_pub_key]}
    response = client.post('/getBalance', json=balance_data)
    assert is_successful_response(response)
    balance = response.json['balance']
    assert len(balance) > 0
    assert balance[0]['address_found'] == True
    assert balance[0]['public_key'] == l2_address_pub_key
    assert balance[0]['balance'] == deposit_amount

    print(f"Balance of L2 address {l2_address_pub_key}: {balance}")

if __name__ == '__main__':
    pytest.main()
