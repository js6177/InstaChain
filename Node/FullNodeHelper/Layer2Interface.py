import requests
import time
import os
import json
import random
import string
import datetime
from dataclasses import dataclass
#from tinydb import TinyDB, Query
import DatabaseInterface
import SigningAddress
import binascii
import checksum
from bip_utils import Bip32, Bip32Utils, Bip32Conf, BitcoinConf, Bip44BitcoinTestNet, WifEncoder
from bip_utils import P2PKH, P2SH, P2WPKH
from bitcoinrpc.authproxy import AuthServiceProxy, JSONRPCException
import traceback
import argparse
from typing import List

HOSTNAME = 'https://testnet.instachain.io/'

ERROR_SUCCESS = 0
ERROR_UNKNOWN = 1
ERROR_CANNOT_VERIFY_SIGNATURE = 10
ERROR_CANNOT_DUPLICATE_TRANSACTION = 11
ERROR_INSUFFICIENT_FUNDS = 12
ERROR_TRANSACTION_ID_NOT_FOUND = 13
ERROR_ONBOARDING_PUBKEY_MISMATCH = 14
ERROR_CANNOT_CANCEL_WITHDRAWAL_MULTIPLE_TIMES = 15
ERROR_DEPOSIT_ADDRESS_NOT_FOUND = 16
ERROR_DUPLICATE_TRANSACTION_ID = 17
ERROR_COULD_NOT_FIND_WITHDRAWAL_REQUEST = 18
ERROR_DATABASE_TRANSACTIONAL_ERROR = 19

def SuccessOrDuplicateErrorCode(error: int):
    return error in (ERROR_SUCCESS, ERROR_CANNOT_DUPLICATE_TRANSACTION, ERROR_DUPLICATE_TRANSACTION_ID)

class Layer2Interface:
    @dataclass
    class WithdrawalBroadcastedTransaction:
        layer1_transaction_id: string
        layer1_transaction_vout: int
        layer1_address: string
        amount: int
        layer2_withdrawal_id: string
        signature: string

    header = {'user-agent': 'requests/0.0.1'}
    def getWithdrawalRequests(self, lastwithdrawalTimestamp):
        url = HOSTNAME + 'getWithdrawalRequests'
        data = {'latest_timestamp': lastwithdrawalTimestamp}
        r = requests.get(url, params=data, headers=self.header)
        print(r.text)
        return r.text

    def ackWithdrawalRequests(self, guids):
        url = HOSTNAME + 'ackWithdrawalRequests'
        data = {'guids': guids}
        r = requests.post(url, params=data, headers=self.header)
        print(r.text)
        return r.text

    def confirmDeposit(self, nonce, layer1_transaction_id, amount, layer1_address, signature):
        url = HOSTNAME + 'depositFunds'
        data = {'nonce': nonce,
                'layer1_transaction_id': layer1_transaction_id,
                'amount': amount,
                'layer1_address': layer1_address,
                'signature': signature}
        r = requests.post(url, params=data, headers=self.header)
        print('/confirmDeposit ' + layer1_transaction_id)
        print(r.text)
        return r.text

    def confirmDepositMulti(self, depositTransactions: List[DatabaseInterface.ConfirmedTransaction]):
        url = HOSTNAME + 'depositFunds'
        transactions = []
        for depositTransaction in depositTransactions:
            transaction = {'layer1_transaction_id': depositTransaction.transaction_id,
                    'layer1_transaction_vout': depositTransaction.transaction_vout,
                    'amount': depositTransaction.amount,
                    'layer1_address': depositTransaction.address,
                    'signature': depositTransaction.signature.decode("utf-8")}
            transactions.append(transaction)
        jsonData = {"transactions":transactions}
        r = requests.post(url, json=jsonData, headers=self.header)
        print(r.text)
        return r.text

    #TODO: do later
    def broadcastWithdrawalMulti(self, withdrawalBroadcastedTramsactions: List[WithdrawalBroadcastedTransaction]):
        url = HOSTNAME + 'withdrawalBroadcasted'
        transactions = []
        for withdrawalBroadcastedTramsaction in withdrawalBroadcastedTramsactions:
            transaction = {"layer1_transaction_id": withdrawalBroadcastedTramsaction.layer1_transaction_id,
                "layer1_transaction_vout": withdrawalBroadcastedTramsaction.layer1_transaction_vout,
                "layer1_address": withdrawalBroadcastedTramsaction.layer1_address,
                "amount": withdrawalBroadcastedTramsaction.amount,
                "layer2_withdrawal_id": withdrawalBroadcastedTramsaction.layer2_withdrawal_id,
                "signature": withdrawalBroadcastedTramsaction.signature.decode("utf-8")}

            transactions.append(transaction)
        jsonData = {"transactions":transactions}
        print('broadcastWithdrawalMulti: ' + json.dumps(jsonData))
        r = requests.post(url, json=jsonData, headers=self.header)
        print('broadcastWithdrawalMulti: ' + str(jsonData))
        print(r.text)
        return r.text

    def broadcastWithdrawal(self, layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, layer2_withdrawal_id, signature):
        url = HOSTNAME + 'withdrawalBroadcasted'
        data = {'layer1_transaction_id': layer1_transaction_id,
                'layer1_transaction_vout': layer1_transaction_vout,
                'layer1_address': layer1_address,
                'amount': amount,
                'layer2_withdrawal_id': layer2_withdrawal_id,
                'signature': signature}
        r = requests.post(url, params=data, headers=self.header)
        print(r.text)
        return r.text

    def confirmWithdrawal(self, layer1_transaction_id, layer1_transaction_vout, layer1_address, amount, signature):
        url = HOSTNAME + 'withdrawalConfirmed'
        data = {'layer1_transaction_id': layer1_transaction_id,
                'layer1_transaction_vout': layer1_transaction_vout,
                'layer1_address': layer1_address,
                'amount': amount,
                'signature': signature}
        r = requests.post(url, params=data, headers=self.header)
        print(r.text)
        return r.text

    def confirmWithdrawalMulti(self, confirmedWithdrawals: List[DatabaseInterface.ConfirmedTransaction]):
        url = HOSTNAME + 'withdrawalConfirmed'
        transactions = []
        for confirmedWithdrawal in confirmedWithdrawals:
            transaction = {'layer1_transaction_id': confirmedWithdrawal.transaction_id,
                'layer1_transaction_vout': confirmedWithdrawal.transaction_vout,
                'layer1_address': confirmedWithdrawal.address,
                'amount': confirmedWithdrawal.amount,
                'signature': confirmedWithdrawal.signature.decode("utf-8")}
            transactions.append(transaction)
        jsonData = {"transactions":transactions}
        r = requests.post(url, json=jsonData, headers=self.header)
        print(r.text)
        return r.text

    def sendConfirmDeposit(self, transactions: List[DatabaseInterface.ConfirmedTransaction]):
        for transaction in transactions:
            transaction.signature = SigningAddress.signDepositConfirmedMessage(transaction.transaction_id, transaction.transaction_vout, transaction.address, transaction.amount)
        return self.confirmDepositMulti(transactions)

    def sendWithdrawalBroadcasted(self, withdrawalBroadcastedTramsactions: List[WithdrawalBroadcastedTransaction]):
        for withdrawalBroadcastedTramsaction in withdrawalBroadcastedTramsactions:
            withdrawalBroadcastedTramsaction.signature = SigningAddress.signWithdrawalBroadcastedMessage(withdrawalBroadcastedTramsaction.layer1_transaction_id, withdrawalBroadcastedTramsaction.layer1_transaction_vout, withdrawalBroadcastedTramsaction.layer1_address, withdrawalBroadcastedTramsaction.amount, withdrawalBroadcastedTramsaction.layer2_withdrawal_id)
        return self.broadcastWithdrawalMulti(withdrawalBroadcastedTramsactions)

    def sendConfirmWithdrawal(self, confirmedWithdrawals: List[DatabaseInterface.ConfirmedTransaction]):
        for transaction in confirmedWithdrawals:
            transaction.signature = SigningAddress.signWithdrawalConfirmedMessage(transaction.transaction_id, transaction.transaction_vout, transaction.address, transaction.amount)
        return self.confirmWithdrawalMulti(confirmedWithdrawals)
