import requests
import aiohttp
#import grequests
import asyncio
from aiohttp import ClientSession
import json
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

DEFAULT_NODE_HOSTNAME = 'https://blitz-v1.appspot.com/' #if user has not added any nodes, get the default one

#hostname = 'https://blitz-v1.appspot.com/'

async def pushTransactionAsync(session, hostname, amount, fee, source_pubkey, destination_address, signature, nonce):
    #print('pushTransactionAsync called!')

    url = hostname + 'pushTransaction'

    data = {'amount': amount,
            'source_pubkey': source_pubkey,
            'destination_address': destination_address,
            'signature': signature,
            'nonce': nonce,
            'fee': fee,
            }

    async with session.post(url, params = data) as response:
        resp = await response.read()
        #print(resp)
        return resp
    #r = requests.post(url, data=data)
    ##print(r.text)
    #return r.text

def pushTransaction(hostname, amount, fee, source_pubkey, destination_address, signature, nonce):
    #print('pushTransaction called!')

    url = hostname + 'pushTransaction'

    data = {'amount': amount,
            'source_pubkey': source_pubkey,
            'destination_address': destination_address,
            'signature': signature,
            'nonce': nonce,
            'fee': fee,
            }

    r = requests.post(url, data=data)
    print(r.text)
    return r.text

def getNodeInfo(hostname):
    if(hostname[-1] != '/'):
        hostname += '/'
    url = hostname + 'getNodeInfo'
    #data = {'public_key': pubkey, 'nonce': nonce, 'signature': signature}

    r = requests.get(url)
    #print(r.text)
    x = json.loads(r.text, object_hook=lambda d: namedtuple('X', d.keys())(*d.values()))
    return x

def getDepositAddress(hostname, pubkey, nonce, signature):
    url = hostname + 'getNewDepositAddress'
    data = {'public_key': pubkey, 'nonce': nonce, 'signature': signature}

    r = requests.get(url, params=data)
    #print(r.text)
    x = json.loads(r.text, object_hook=lambda d: namedtuple('X', d.keys())(*d.values()))
    return x

def getAddressBalance(hostname, pubkey):
    url = hostname + 'getBalance'
    data = { 'public_key': pubkey}

    r = requests.get(url, params=data)
    #print(r.text)
    return r.text

def getAddressTransactions(hostname, pubkey):
    url = hostname + 'getAllTransactionsOfPublicKey'
    data = { 'public_key': pubkey}

    r = requests.get(url, params=data)
    ##print(r.text)
    return r.text

def sendWithdrawalRequest(hostname, pubkey, withdrawal_address, amount, nonce, signature):
    url = hostname + 'withdrawalRequest'
    data = {'public_key': pubkey,
            'withdrawal_address': withdrawal_address,
            'amount': amount,
            'nonce': nonce,
            'signature': signature}
    r = requests.post(url, params=data)
    #print(r.text)
    return r.text

async def sendWithdrawalRequestAsync(session, hostname, pubkey, withdrawal_address, amount, nonce, signature):
    url = hostname + 'withdrawalRequest'
    data = {'public_key': pubkey,
            'withdrawal_address': withdrawal_address,
            'amount': amount,
            'nonce': nonce,
            'signature': signature}
    async with session.post(url, params = data) as response:
        resp = await response.read()
        print(resp)
        return resp

#to be only used for unit tests, these are supposed to be called from full node for onboarding
def depositApproval(hostname, transaction_id, layer1_address, amount, nonce, signature):
    url = hostname + 'depositFunds'
    data = {'layer1_transaction_id': transaction_id,
            'layer1_address': layer1_address,
            'amount': amount,
            'nonce': nonce,
            'signature': signature}
    r = requests.post(url, params=data)
    #print(r.text)
    return r.text

def sendWithdrawalApproval():
    pass

