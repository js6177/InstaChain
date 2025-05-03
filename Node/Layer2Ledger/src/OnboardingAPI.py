from Transaction import Transaction
import ErrorMessage
import Onboarding
from services.messages.Layer2Ledger.Requests import AckWithdrawalRequestsRequest, GetWithdrawalRequestsRequest, WithdrawalCanceledRequest
from services.messages.Layer2Ledger.Responses.GetDepositAddressResponse import GetDepositAddressResponse
import signing_keys
import Address as Address
import time
import logging
import json
from types import SimpleNamespace
from NodeInfoAPI import NODE_ID
from InstaChainAPI import InstachainRequestHandler
import GlobalLogging
import KeyVerification
from typing import TypedDict
from services.messages.Layer2Ledger.Requests.RequestWithdrawalRequest import RequestWithdrawalRequest
from services.messages.Layer2Ledger.Requests.GetDepositAddressRequest import GetDepositAddressRequest
from services.messages.Layer2Ledger.Requests.GetWithdrawalRequestsRequest import GetWithdrawalRequestsRequest
from services.messages.Layer2Ledger.Requests.AckWithdrawalRequestsRequest import AckWithdrawalRequestsRequest
from services.messages.Layer2Ledger.Requests.WithdrawalBroadcastedRequest import WithdrawalBroadcastedRequest
from services.messages.Layer2Ledger.Requests.WithdrawalConfirmedRequest import WithdrawalConfirmedRequest
from services.messages.Layer2Ledger.Requests.DepositConfirmedRequest import DepositConfirmedRequest


class withdrawalRequest(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: RequestWithdrawalRequest = RequestWithdrawalRequest(**request_dict)

    def processRequest(self):
        amount = int(self.request.amount)  # Access field directly
        message = KeyVerification.buildWithdrawalRequestMessage(
            self.request.source_address_public_key,  # Access field directly
            self.request.layer1_withdrawal_address,  # Access field directly
            self.request.nonce,  # Access field directly
            amount
        )
        status = Transaction.process_transaction(
            Transaction.TRX_WITHDRAWAL_INITIATED,
            amount,
            0,
            self.request.source_address_public_key,  # Access field directly
            self.request.layer1_withdrawal_address,  # Access field directly
            message,
            self.request.signature,  # Access field directly
            self.request.nonce  # Access field directly
        )

        self.result = ErrorMessage.build_error_message(status)

class getWithdrawalRequests(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: GetWithdrawalRequestsRequest = GetWithdrawalRequestsRequest(**request_dict)

    def processRequest(self):
        withdrawalRequests = Onboarding.getWithdrawalRequests(self.request.latest_timestamp)
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.result['withdrawal_requests'] = [withdrawalRequest.to_dict() for withdrawalRequest in withdrawalRequests]

class ackWithdrawalRequests(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: AckWithdrawalRequestsRequest = AckWithdrawalRequestsRequest(**request_dict)

    def processRequest(self):
        Onboarding.ackWithdrawalRequests(self.request.layer2_withdrawal_ids)
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        #self.result['withdrawal_requests'] = requests.dict()

#called from the node
class withdrawalBroadcasted(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: WithdrawalBroadcastedRequest = WithdrawalBroadcastedRequest(**request_dict)
    def processRequest(self):
        transactionResults = []
        request = json.loads(json.dumps(self.request), object_hook=lambda d: SimpleNamespace(**d))
        for trx in request.transactions:
            error =  ErrorMessage.build_error_message(Onboarding.withdrawalBroadcasted(trx.layer1_transaction_id, trx.layer1_transaction_vout, trx.layer1_address, trx.amount, trx.layer2_withdrawal_id, trx.signature))
            error["layer2_withdrawal_id"] = trx.layer2_withdrawal_id
            transactionResults.append(error)
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.result["transactions"] = transactionResults

#called from the node
class withdrawalConfirmed(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: WithdrawalConfirmedRequest = WithdrawalConfirmedRequest(**request_dict)
    def processRequest(self):
        transactionResults = []
        request = json.loads(json.dumps(self.request), object_hook=lambda d: SimpleNamespace(**d))
        for trx in request.transactions:     
            error = ErrorMessage.build_error_message(Onboarding.withdrawalConfirmed(trx.layer1_transaction_id, trx.layer1_transaction_vout, trx.layer1_address, trx.amount, trx.signature))
            error["layer1_transaction_id"] = trx.layer1_transaction_id
            error["layer1_transaction_vout"] = str(trx.layer1_transaction_vout)
            transactionResults.append(error)
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.result["transactions"] = transactionResults

#called from the node
class withdrawalCanceled(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: WithdrawalCanceledRequest = WithdrawalCanceledRequest(**request_dict)
    def processRequest(self):
        rslt, transaction_id = Onboarding.withdrawalCanceled(self.request.source_address_public_key, self.request.transaction_id, self.request.amount, self.request.signature)
        self.result = ErrorMessage.build_error_message(rslt)
        self.result['transaction_id'] = transaction_id

class getNewDepositAddress(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request = GetDepositAddressRequest(**request_dict)

    def processRequest(self):
        rslt, address = Onboarding.getDepositAddress(self.request.layer2_address_pubkey, self.request.nonce, self.request.signature)
        self.result = GetDepositAddressResponse(
            **ErrorMessage.build_error_message(rslt),
            layer1_deposit_address=address if rslt == 0 else ""
        )
        print("getNewDepositAddress: ", self.result)

class verifyDepositAddress(InstachainRequestHandler):
    def getParameters(self):
        pass
    def processRequest(self):
        pass

#called from the btc node
class depositConfirmed(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: DepositConfirmedRequest = DepositConfirmedRequest(**request_dict)

    def processRequest(self):
        transactionResults = []
        for trx in self.request.transactions:
            error = ErrorMessage.build_error_message(
                Onboarding.depositConfirmed(
                    trx.layer1_transaction_id,
                    trx.layer1_transaction_vout,
                    trx.layer1_address,
                    trx.amount,
                    trx.nonce,
                    trx.signature
                )
            )
            error["layer1_transaction_id"] = trx.layer1_transaction_id
            error["layer1_transaction_vout"] = str(trx.layer1_transaction_vout)
            transactionResults.append(error)
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.result["transactions"] = transactionResults