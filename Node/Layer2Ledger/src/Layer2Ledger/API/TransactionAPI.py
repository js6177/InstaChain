from Layer2Ledger.core.Transaction import Transaction
from Layer2Ledger.core import ErrorMessage
from Layer2Ledger.core import Address as Address
import time
import logging
import json
import datetime
import types
from types import SimpleNamespace
from Layer2Ledger.API.InstaChainAPI import InstachainRequestHandler
from Layer2Ledger.API.NodeInfoAPI import NODE_ID
from Layer2Ledger.database.database import get_db, AsyncSession
from Layer2Ledger.core.signing_keys import ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY
from Layer2Ledger.core import GlobalLogging
from Layer2Ledger.core import KeyVerification
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetBalanceResponse import GetBalanceResponse, GetBalanceResponseBalance
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetTransactionResponse import GetTransactionResponse
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetTransactionsResponse import GetTransactionsResponse, GetTransactionsResponseTransaction, TransactionGroup
from Layer2Ledger.services.messages.Layer2Ledger.Requests.PushTransactionRequest import PushTransactionRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetBalanceRequest import GetBalanceRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetTransactionsRequest import GetTransactionsRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetTransactionRequest import GetTransactionRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetFeeRequest import GetFeeRequest
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetFeeResponse import GetFeeResponse
from fastapi import Depends, Request


MAX_NUMBER_OF_GETBALANCE_ADDRESSES = 10
MAX_NUMBER_OF_GETTRANSACTIONS_ADDRESSES = 10

class pushTransaction(InstachainRequestHandler):
    def __init__(self):
        super().__init__()
        self.request: PushTransactionRequest = None

    async def getParameters(self, request: Request):
        request_dict = await self.getPostJsonParams(request)
        self.request = PushTransactionRequest(**request_dict)

    async def processRequest(self, db: AsyncSession = Depends(get_db)):
        if self.request.source_address_public_key != ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY:
            message = KeyVerification.buildTransferMessage(
                self.request.source_address_public_key,
                self.request.destination_address_public_key,
                self.request.amount,
                self.request.fee,
                self.request.transaction_id
            )
            status = await Transaction.process_transaction(
                db,
                Transaction.TRX_TRANSFER,
                self.request.amount,
                self.request.fee,
                self.request.source_address_public_key,
                self.request.destination_address_public_key,
                message,
                self.request.signature,
                self.request.transaction_id
            )
            self.result = GetTransactionResponse(
                **ErrorMessage.build_error_message(status),
                transaction_id=self.request.transaction_id
            )
        else:
            self.result = GetTransactionResponse(
                **ErrorMessage.build_error_message(ErrorMessage.ERROR_CANNOT_TRANSFER_USING_ONBOARDING_KEY),
                transaction_id=self.request.transaction_id
            )

        GlobalLogging.log_text("response: " + str(self.result))

class getTransaction(InstachainRequestHandler):
    def __init__(self):
        super().__init__()
        self.request: GetTransactionRequest = None

    async def getParameters(self, request: Request):
        request_dict = await self.getPostJsonParams(request)
        self.request = GetTransactionRequest(**request_dict)

    async def processRequest(self, db: AsyncSession = Depends(get_db)):
        rslt, transaction = await Transaction.get_transaction(db, self.request.transaction_id)
        self.result = GetTransactionResponse(
            **ErrorMessage.build_error_message(rslt),
            transaction=transaction.to_dict() if transaction else None,
            transaction_id=self.request.transaction_id
        )

class getAllTransactionsOfPublicKey(InstachainRequestHandler):
    def __init__(self):
        super().__init__()
        self.request: GetTransactionsRequest = None

    async def getParameters(self, request: Request):
        request_dict = await self.getPostJsonParams(request)
        self.request = GetTransactionsRequest(**request_dict)

    async def processRequest(self, db: AsyncSession = Depends(get_db)):
        transactions_list = []
        for public_key in list(self.request.public_keys)[:MAX_NUMBER_OF_GETTRANSACTIONS_ADDRESSES]:
            all_transactions = await Transaction.get_all_transactions(db, public_key)
            transaction_group = TransactionGroup(
                public_key=public_key,
                transactions=[
                    GetTransactionsResponseTransaction(
                        amount=transaction.amount,
                        destination_address_pubkey=transaction.destination_address_pubkey,
                        fee=transaction.fee,
                        layer1_transaction_id=transaction.layer1_transaction_id,
                        layer2_withdrawal_id=transaction.layer2_withdrawal_id,
                        signature=transaction.signature,
                        signature_date=transaction.signature_date,
                        source_address_pubkey=transaction.source_address_pubkey,
                        timestamp=transaction.timestamp_as_unix_milliseconds(),
                        transaction_id=transaction.layer2_transaction_id,
                        transaction_type=transaction.transaction_type
                    ) for transaction in all_transactions
                ]
            )
            transactions_list.append(transaction_group)

        self.result = GetTransactionsResponse(
            **ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS),
            transactions=transactions_list
        )

class getFee(InstachainRequestHandler):
    def __init__(self):
        super().__init__()
        self.request: GetFeeRequest = None

    async def getParameters(self, request: Request):
        request_dict = await self.getPostJsonParams(request)
        self.request = GetFeeRequest(**request_dict)

    async def processRequest(self):
        self.result = GetFeeResponse(
            **ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS),
            fee=1
        )

class getBalance(InstachainRequestHandler):
    def __init__(self):
        super().__init__()
        self.request: GetBalanceRequest = None

    async def getParameters(self, request: Request):
        request_dict = await self.getPostJsonParams(request)
        self.request = GetBalanceRequest(**request_dict)

    async def processRequest(self, db: AsyncSession = Depends(get_db)):
        balances: list[GetBalanceResponseBalance] = []
        for public_key in list(self.request.public_keys)[:MAX_NUMBER_OF_GETBALANCE_ADDRESSES]:
            balance: GetBalanceResponseBalance = GetBalanceResponseBalance()
            balance.public_key = public_key
            (balance.balance, balance.address_found) = (0, False)
            try:
                (balance.balance, balance.address_found) = await Transaction.get_balance(db, public_key, True)
            except Exception as e:
                logging.error(f"Error getting balance for {public_key}: {e}")

            balances.append(balance)
        self.result = GetBalanceResponse(
            **ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS),
            balance=balances
        )



