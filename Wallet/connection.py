import requests
import aiohttp
import asyncio
from aiohttp import ClientSession
import json
from typing import List
from collections import namedtuple

ERROR_SUCCESS = 0
ERROR_UNKNOWN = 1
ERROR_CANNOT_VERIFY_SIGNATURE = 10
ERROR_CANNOT_DUPLICATE_TRANSACTION = 11
ERROR_INSUFFICIENT_FUNDS = 12
ERROR_TRANSACTION_ID_NOT_FOUND = 13
ERROR_ONBOARDING_PUBKEY_MISMATCH = 14
ERROR_CANNOT_CANCEL_WITHDRAWAL_MULTIPLE_TIMES = 15
ERROR_DEPOSIT_ADDRESS_NOT_FOUND = 16
ERROR_DUPLICATE_NONCE = 17
ERROR_COULD_NOT_FIND_WITHDRAWAL_REQUEST = 18
ERROR_DATABASE_TRANSACTIONAL_ERROR = 19

DEFAULT_NODE_HOSTNAME = 'https://testnet.instachain.io/' #if user has not added any nodes, get the default one

HEADERS = {'user-agent': 'requests ' + requests.__version__}

PRINT_OUTPUT = True

def printResponse(resonseJSON):
    if(PRINT_OUTPUT):
        print(resonseJSON)

async def pushTransactionAsync(session, hostname, amount, fee, source_pubkey, destination_address, signature, nonce):
    url = hostname + 'pushTransaction'
    data = {'amount': amount,
            'source_pubkey': source_pubkey,
            'destination_address': destination_address,
            'signature': signature,
            'nonce': nonce,
            'fee': fee,
            }
    async with session.post(url, data = data) as response:
        resp = None
        try:
            resp = await response.json()
        except Exception as ex:
            print(resp)
            resp = {'error_code': 1000}
        printResponse(resp)
        return resp

def pushTransaction(hostname, amount, fee, source_address_public_key, destination_address_public_key, signature, transaction_id):
    url = hostname + 'pushTransaction'

    data = {'amount': amount,
            'source_address_public_key': source_address_public_key,
            'destination_address_public_key': destination_address_public_key,
            'signature': signature,
            'transaction_id': transaction_id,
            'fee': fee,
            }

    r = requests.post(url, data=data)
    printResponse(r.text)
    return r.text

def getNodeInfo(hostname):
    if(hostname[-1] != '/'):
        hostname += '/'
    url = hostname + 'getNodeInfo'

    r = requests.get(url)
    x = json.loads(r.text, object_hook=lambda d: namedtuple('X', d.keys())(*d.values()))
    return x

def getTransaction(hostname, transaction_id):
    url = hostname + 'getTransaction'

    data = {'transaction_id': transaction_id}

    r = requests.get(url, params=data)
    return r.text

def getDepositAddress(hostname, layer2_address_pubkey, nonce, signature):
    url = hostname + 'getNewDepositAddress'
    data = {'layer2_address_pubkey': layer2_address_pubkey, 'nonce': nonce, 'signature': signature}

    r = requests.get(url, params=data)
    x = json.loads(r.text, object_hook=lambda d: namedtuple('X', d.keys())(*d.values()))
    return x

def getAddressBalance(hostname, pubkeys: List[str]):
    url = hostname + 'getBalance'
    data = { 'public_keys': pubkeys}

    r = requests.post(url, json=data, headers=HEADERS)
    return r.text

def getAddressTransactions(hostname, pubkey):
    url = hostname + 'getAllTransactionsOfPublicKey'
    data = { 'public_key': pubkey}

    r = requests.get(url, params=data)
    printResponse(r.text)
    return r.text

def sendWithdrawalRequest(hostname, source_address_public_key, layer1_withdrawal_address, amount, nonce, signature):
    url = hostname + 'withdrawalRequest'
    data = {'source_address_public_key': source_address_public_key,
            'layer1_withdrawal_address': layer1_withdrawal_address,
            'amount': amount,
            'nonce': nonce,
            'signature': signature}
    r = requests.post(url, data=data)
    printResponse(r.text)
    return r.text

async def sendWithdrawalRequestAsync(session, hostname, source_address_public_key, layer1_withdrawal_address, amount, nonce, signature):
    url = hostname + 'withdrawalRequest'
    data = {'source_address_public_key': source_address_public_key,
            'layer1_withdrawal_address': layer1_withdrawal_address,
            'amount': amount,
            'nonce': nonce,
            'signature': signature}
    async with session.post(url, data = data) as response:
        resp = await response.read()
        printResponse(resp.text)
        return resp
