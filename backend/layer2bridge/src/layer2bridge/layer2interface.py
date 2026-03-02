import httpx
import random
import string
from typing import List
from layer2bridge import database_interface as DatabaseInterface
from layer2bridge import audit_database_interface as AuditDatabaseInterface
from openl2_messaging import (
    signDepositMessage,
    signWithdrawalBroadcastedMessage,
    signWithdrawalConfirmedMessage,
    signLayer1AuditReportMessage
)
from layer2bridge.onboarding_logger import OnboardingLogger
from openl2_layer2ledger_api import (
    WITHDRAWAL_ROUTER_PREFIX,
    GET_WITHDRAWAL_REQUESTS_ROUTE,
    WITHDRAWAL_BROADCASTED_ROUTE,
    WITHDRAWAL_CONFIRMED_ROUTE,
    DEPOSIT_ROUTER_PREFIX,
    DEPOSIT_CONFIRMED_ROUTE,
)
from openl2_layer2ledger_api.models.requests import (
    GetWithdrawalRequestsRequest,
    WithdrawalBroadcastedRequest,
    Layer1BroadcastedWithdrawalTransaction,
    WithdrawalConfirmedRequest,
    Layer1WithdrawalConfirmedTransaction,
    DepositConfirmedRequest,
    DepositsConfirmed,
    PostLayer1AuditReportRequest,
    Layer1AddressBalance,
)
from openl2_layer2ledger_api.models.responses import (
    GetWithdrawalRequestsResponse,
    WithdrawalBroadcastedResponse,
    WithdrawalConfirmedResponse,
    DepositConfirmedResponse,
    PostLayer1AuditReportResponse,
)


DEFAULT_LAYER2_URL = 'https://testnet.instachain.io/'

ERROR_SUCCESS = 0
ERROR_CANNOT_DUPLICATE_TRANSACTION = 11
ERROR_DUPLICATE_TRANSACTION_ID = 17

def SuccessOrDuplicateErrorCode(error: int):
    return error in (ERROR_SUCCESS, ERROR_CANNOT_DUPLICATE_TRANSACTION, ERROR_DUPLICATE_TRANSACTION_ID)

class Layer2Interface:
    layer2_node_url: str
    onboarding_signing_private_key: str

    def __init__(self, layer2_node_url: str, onboarding_signing_private_key: str):
        self.layer2_node_url = layer2_node_url or DEFAULT_LAYER2_URL
        if not self.layer2_node_url.endswith('/'):
            self.layer2_node_url += '/'
        self.onboarding_signing_private_key = onboarding_signing_private_key

    async def getWithdrawalRequests(self, lastwithdrawalTimestamp: int) -> GetWithdrawalRequestsResponse:
        url = f"{self.layer2_node_url}{WITHDRAWAL_ROUTER_PREFIX.strip('/')}{GET_WITHDRAWAL_REQUESTS_ROUTE}"
        request_model = GetWithdrawalRequestsRequest(latest_timestamp=lastwithdrawalTimestamp)
        async with httpx.AsyncClient() as client:
            r = await client.post(url, json=request_model.model_dump())
            r.raise_for_status()
            response_model = GetWithdrawalRequestsResponse.model_validate(r.json())
            OnboardingLogger(f"getWithdrawalRequests: {response_model.error_code}")
            return response_model

    async def broadcastWithdrawalMulti(self, withdrawalBroadcastedTransactions: List[Layer1BroadcastedWithdrawalTransaction]) -> WithdrawalBroadcastedResponse:
        url = f"{self.layer2_node_url}{WITHDRAWAL_ROUTER_PREFIX.strip('/')}{WITHDRAWAL_BROADCASTED_ROUTE}"
        request_model = WithdrawalBroadcastedRequest(transactions=withdrawalBroadcastedTransactions)
        async with httpx.AsyncClient() as client:
            r = await client.post(url, json=request_model.model_dump())
            r.raise_for_status()
            response_model = WithdrawalBroadcastedResponse.model_validate(r.json())
            OnboardingLogger(f"broadcastWithdrawalMulti: {response_model.error_code}")
            return response_model

    async def confirmWithdrawalMulti(self, confirmedWithdrawals: List[Layer1WithdrawalConfirmedTransaction]) -> WithdrawalConfirmedResponse:
        url = f"{self.layer2_node_url}{WITHDRAWAL_ROUTER_PREFIX.strip('/')}{WITHDRAWAL_CONFIRMED_ROUTE}"
        request_model = WithdrawalConfirmedRequest(transactions=confirmedWithdrawals)
        async with httpx.AsyncClient() as client:
            r = await client.post(url, json=request_model.model_dump())
            r.raise_for_status()
            response_model = WithdrawalConfirmedResponse.model_validate(r.json())
            OnboardingLogger(f"confirmWithdrawalMulti: {response_model.error_code}")
            return response_model

    async def confirmDepositMulti(self, depositTransactions: List[DepositsConfirmed]) -> DepositConfirmedResponse:
        url = f"{self.layer2_node_url}{DEPOSIT_ROUTER_PREFIX.strip('/')}{DEPOSIT_CONFIRMED_ROUTE}"
        request_model = DepositConfirmedRequest(transactions=depositTransactions)
        async with httpx.AsyncClient() as client:
            r = await client.post(url, json=request_model.model_dump())
            r.raise_for_status()
            response_model = DepositConfirmedResponse.model_validate(r.json())
            OnboardingLogger(f"confirmDepositMulti: {response_model.error_code}")
            return response_model
    
    async def postLayer1AuditReport(self, blockheight: int, balance: int, layer1AddressBalances: List[AuditDatabaseInterface.AuditLayer1Address]) -> PostLayer1AuditReportResponse:
        # TODO: Add audit router prefix to api_paths if it exists, otherwise use hardcoded '/audit'
        url = f"{self.layer2_node_url}audit/postLayer1AuditReport"
        
        balances = [
            Layer1AddressBalance(layer1_address=ab.layer1_address, balance=ab.balance)
            for ab in layer1AddressBalances
        ]
        
        signature = signLayer1AuditReportMessage(self.onboarding_signing_private_key, blockheight, balance)
        request_model = PostLayer1AuditReportRequest(
            block_height=blockheight,
            layer1_address_balances=balances,
            signature=signature
        )
        
        async with httpx.AsyncClient() as client:
            r = await client.post(url, json=request_model.model_dump())
            r.raise_for_status()
            response_model = PostLayer1AuditReportResponse.model_validate(r.json())
            OnboardingLogger(f"postLayer1AuditReport: {response_model.error_code}")
            return response_model

    async def sendConfirmDeposit(self, transactions: List[DatabaseInterface.ConfirmedTransaction]) -> DepositConfirmedResponse:
        deposit_txs = []
        for transaction in transactions:
            nonce = ''.join(random.choice(string.ascii_letters) for i in range(16))
            signature = signDepositMessage(
                self.onboarding_signing_private_key, 
                transaction.transaction_id, 
                transaction.transaction_vout, 
                transaction.address, 
                transaction.amount, 
                nonce
            )
            deposit_txs.append(DepositsConfirmed(
                layer1_transaction_id=transaction.transaction_id,
                layer1_transaction_vout=transaction.transaction_vout,
                amount=transaction.amount,
                layer1_address=transaction.address,
                nonce=nonce,
                signature=signature
            ))
        return await self.confirmDepositMulti(deposit_txs)

    async def sendWithdrawalBroadcasted(self, withdrawalBroadcastedTransactions: List[Layer1BroadcastedWithdrawalTransaction]) -> WithdrawalBroadcastedResponse:
        for tx in withdrawalBroadcastedTransactions:
            tx.signature = signWithdrawalBroadcastedMessage(
                self.onboarding_signing_private_key, 
                tx.layer1_transaction_id, 
                tx.layer1_transaction_vout, 
                tx.layer1_address, 
                tx.amount, 
                tx.layer2_withdrawal_id
            )
        return await self.broadcastWithdrawalMulti(withdrawalBroadcastedTransactions)

    async def sendConfirmWithdrawal(self, confirmedWithdrawals: List[DatabaseInterface.ConfirmedTransaction]) -> WithdrawalConfirmedResponse:
        withdrawal_txs = []
        for transaction in confirmedWithdrawals:
            signature = signWithdrawalConfirmedMessage(
                self.onboarding_signing_private_key, 
                transaction.transaction_id, 
                transaction.transaction_vout, 
                transaction.address, 
                transaction.amount
            )
            withdrawal_txs.append(Layer1WithdrawalConfirmedTransaction(
                layer1_transaction_id=transaction.transaction_id,
                layer1_transaction_vout=transaction.transaction_vout,
                layer1_address=transaction.address,
                amount=transaction.amount,
                signature=signature
            ))
        return await self.confirmWithdrawalMulti(withdrawal_txs)
