import requests
import json
import random
import string
from typing import List, Dict, Any
from dataclasses import dataclass
import DatabaseInterface
import AuditDatabaseInterface
from openl2_messaging import (
    signDepositMessage,
    signWithdrawalBroadcastedMessage,
    signWithdrawalConfirmedMessage,
    signLayer1AuditReportMessage
)
from OnboardingLogger import OnboardingLogger


DEFAULT_LAYER2_URL = 'https://testnet.instachain.io/'

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
    layer2_node_url: str
    onboarding_signing_private_key: str

    @dataclass
    class WithdrawalBroadcastedTransaction:
        layer1_transaction_id: str
        layer1_transaction_vout: int
        layer1_address: str
        amount: int
        layer2_withdrawal_id: str
        signature: str = ""

    def __init__(self, layer2_node_url: str, onboarding_signing_private_key: str):
        self.layer2_node_url = layer2_node_url or DEFAULT_LAYER2_URL
        self.onboarding_signing_private_key = onboarding_signing_private_key

    header = {'user-agent': 'requests/0.0.1'}
    def getWithdrawalRequests(self, lastwithdrawalTimestamp: int):
        url = self.layer2_node_url + 'getWithdrawalRequests'
        data = {'latest_timestamp': lastwithdrawalTimestamp}
        r = requests.get(url, params=data, headers=self.header)
        OnboardingLogger(r.text)
        return r.text

    def ackWithdrawalRequests(self, layer2_withdrawal_ids: List[str]):
        url = self.layer2_node_url + 'ackWithdrawalRequests'
        data = {'layer2_withdrawal_ids': layer2_withdrawal_ids}
        r = requests.post(url, params=data, headers=self.header)
        OnboardingLogger(r.text)
        return r.text

    def confirmDeposit(self, nonce: str, layer1_transaction_id: str, amount: int, layer1_address: str, signature: str):
        url = self.layer2_node_url + 'depositFunds'
        data = {'nonce': nonce,
                'layer1_transaction_id': layer1_transaction_id,
                'amount': amount,
                'layer1_address': layer1_address,
                'signature': signature}
        r = requests.post(url, params=data, headers=self.header)
        OnboardingLogger('/confirmDeposit ' + layer1_transaction_id)
        OnboardingLogger(r.text)
        return r.text

    def confirmDepositMulti(self, depositTransactions: List[DatabaseInterface.ConfirmedTransaction]):
        url = self.layer2_node_url + 'depositFunds'
        transactions = []
        for depositTransaction in depositTransactions:
            transaction = {'layer1_transaction_id': depositTransaction.transaction_id,
                    'layer1_transaction_vout': depositTransaction.transaction_vout,
                    'amount': depositTransaction.amount,
                    'layer1_address': depositTransaction.address,
                    'nonce': depositTransaction.nonce,
                    'signature': depositTransaction.signature}
            transactions.append(transaction)
        jsonData = {"transactions":transactions}
        r = requests.post(url, json=jsonData, headers=self.header)
        OnboardingLogger("confirmDepositMulti: " + str(r.text))
        return r.text

    def broadcastWithdrawalMulti(self, withdrawalBroadcastedTransactions: List[WithdrawalBroadcastedTransaction]):
        url = self.layer2_node_url + 'withdrawalBroadcasted'
        transactions = []
        for withdrawalBroadcastedTransaction in withdrawalBroadcastedTransactions:
            transaction = {"layer1_transaction_id": withdrawalBroadcastedTransaction.layer1_transaction_id,
                "layer1_transaction_vout": withdrawalBroadcastedTransaction.layer1_transaction_vout,
                "layer1_address": withdrawalBroadcastedTransaction.layer1_address,
                "amount": withdrawalBroadcastedTransaction.amount,
                "layer2_withdrawal_id": withdrawalBroadcastedTransaction.layer2_withdrawal_id,
                "signature": withdrawalBroadcastedTransaction.signature}

            transactions.append(transaction)
        jsonData = {"transactions":transactions}
        OnboardingLogger('broadcastWithdrawalMulti: ' + json.dumps(jsonData))
        r = requests.post(url, json=jsonData, headers=self.header)
        OnboardingLogger(r.text)
        return r.text

    def broadcastWithdrawal(self, layer1_transaction_id: str, layer1_transaction_vout: int, layer1_address: str, amount: int, layer2_withdrawal_id: str, signature: str):
        url = self.layer2_node_url + 'withdrawalBroadcasted'
        data = {'layer1_transaction_id': layer1_transaction_id,
                'layer1_transaction_vout': layer1_transaction_vout,
                'layer1_address': layer1_address,
                'amount': amount,
                'layer2_withdrawal_id': layer2_withdrawal_id,
                'signature': signature}
        r = requests.post(url, params=data, headers=self.header)
        OnboardingLogger(r.text)
        return r.text

    def confirmWithdrawal(self, layer1_transaction_id: str, layer1_transaction_vout: int, layer1_address: str, amount: int, signature: str):
        url = self.layer2_node_url + 'withdrawalConfirmed'
        data = {'layer1_transaction_id': layer1_transaction_id,
                'layer1_transaction_vout': layer1_transaction_vout,
                'layer1_address': layer1_address,
                'amount': amount,
                'signature': signature}
        r = requests.post(url, params=data, headers=self.header)
        OnboardingLogger(r.text)
        return r.text

    def confirmWithdrawalMulti(self, confirmedWithdrawals: List[DatabaseInterface.ConfirmedTransaction]):
        url = self.layer2_node_url + 'withdrawalConfirmed'
        transactions = []
        for confirmedWithdrawal in confirmedWithdrawals:
            transaction = {'layer1_transaction_id': confirmedWithdrawal.transaction_id,
                'layer1_transaction_vout': confirmedWithdrawal.transaction_vout,
                'layer1_address': confirmedWithdrawal.address,
                'amount': confirmedWithdrawal.amount,
                'signature': confirmedWithdrawal.signature}
            transactions.append(transaction)
        jsonData = {"transactions":transactions}
        r = requests.post(url, json=jsonData, headers=self.header)
        OnboardingLogger(r.text)
        return r.text
    
    def postLayer1AuditReport(self, blockheight: int, balance: int, layer1AddressBalances: List[AuditDatabaseInterface.AuditLayer1Address]):
        url = self.layer2_node_url + 'postLayer1AuditReport'
        layer1AddressBalancesJson = [layer1AddressBalance.to_dict() for layer1AddressBalance in layer1AddressBalances]
        signature = signLayer1AuditReportMessage(self.onboarding_signing_private_key, blockheight, balance)
        jsonData = {'block_height': blockheight,
                'balance': balance,
                'layer1_address_balances': layer1AddressBalancesJson,
                'signature': signature}
        r = requests.post(url, json=jsonData, headers=self.header)
        OnboardingLogger(r.text)
        return r.text


    def sendConfirmDeposit(self, transactions: List[DatabaseInterface.ConfirmedTransaction]):
        for transaction in transactions:
            transaction.nonce = ''.join(random.choice(string.ascii_letters) for i in range(16))
            transaction.signature = signDepositMessage(self.onboarding_signing_private_key, transaction.transaction_id, transaction.transaction_vout, transaction.address, transaction.amount, transaction.nonce)
        return self.confirmDepositMulti(transactions)

    def sendWithdrawalBroadcasted(self, withdrawalBroadcastedTransactions: List[WithdrawalBroadcastedTransaction]):
        for withdrawalBroadcastedTransaction in withdrawalBroadcastedTransactions:
            withdrawalBroadcastedTransaction.signature = signWithdrawalBroadcastedMessage(self.onboarding_signing_private_key, withdrawalBroadcastedTransaction.layer1_transaction_id, withdrawalBroadcastedTransaction.layer1_transaction_vout, withdrawalBroadcastedTransaction.layer1_address, withdrawalBroadcastedTransaction.amount, withdrawalBroadcastedTransaction.layer2_withdrawal_id)
        return self.broadcastWithdrawalMulti(withdrawalBroadcastedTransactions)

    def sendConfirmWithdrawal(self, confirmedWithdrawals: List[DatabaseInterface.ConfirmedTransaction]):
        for transaction in confirmedWithdrawals:
            transaction.signature = signWithdrawalConfirmedMessage(self.onboarding_signing_private_key, transaction.transaction_id, transaction.transaction_vout, transaction.address, transaction.amount)
        return self.confirmWithdrawalMulti(confirmedWithdrawals)
