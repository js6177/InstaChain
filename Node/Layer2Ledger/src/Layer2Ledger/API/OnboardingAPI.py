from Layer2Ledger.core.Transaction import Transaction
from Layer2Ledger.core import ErrorMessage
from Layer2Ledger.core import Onboarding
from Layer2Ledger.services.messages.Layer2Ledger.Requests import AckWithdrawalRequestsRequest, GetWithdrawalRequestsRequest, WithdrawalCanceledRequest
from Layer2Ledger.services.messages.Layer2Ledger.Responses.DepositConfirmedResponse import DepositConfirmedResponse, Layer1DepositConfirmedTransaction
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetDepositAddressResponse import GetDepositAddressResponse
from Layer2Ledger.services.messages.Layer2Ledger.Responses.WithdrawalBroadcastedResponse import Layer1BroadcastedWithdrawalTransactionStatus, WithdrawalBroadcastedResponse
from Layer2Ledger.services.messages.Layer2Ledger.Responses.WithdrawalConfirmedResponse import Layer1WithdrawalConfirmedTransactionStatus, WithdrawalConfirmedResponse
from Layer2Ledger.core import signing_keys
from Layer2Ledger.core import Address as Address
import time
import logging
import json
from types import SimpleNamespace
from Layer2Ledger.API.NodeInfoAPI import NODE_ID
from Layer2Ledger.API.InstaChainAPI import InstachainRequestHandler
from Layer2Ledger.core import GlobalLogging
from Layer2Ledger.core import KeyVerification
from typing import List, TypedDict
from Layer2Ledger.services.messages.Layer2Ledger.Requests.RequestWithdrawalRequest import RequestWithdrawalRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetDepositAddressRequest import GetDepositAddressRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetWithdrawalRequestsRequest import GetWithdrawalRequestsRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.AckWithdrawalRequestsRequest import AckWithdrawalRequestsRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.WithdrawalBroadcastedRequest import Layer1BroadcastedWithdrawalTransaction, WithdrawalBroadcastedRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.WithdrawalConfirmedRequest import WithdrawalConfirmedRequest
from Layer2Ledger.services.messages.Layer2Ledger.Requests.DepositConfirmedRequest import DepositConfirmedRequest
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetWithdrawalRequestsResponse import GetWithdrawalRequestsResponse, WithdrawalRequest
from Layer2Ledger.services.messages.Layer2Ledger.Responses.AckWithdrawalRequestsResponse import AckWithdrawalRequestsResponse

# This API is called by the user to request a withdrawal to the layer1 address
class withdrawalRequest(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: RequestWithdrawalRequest = RequestWithdrawalRequest(**request_dict)

    def processRequest(self):
        amount = int(self.request.amount)  
        message = KeyVerification.buildWithdrawalRequestMessage(
            self.request.source_address_public_key,  
            self.request.layer1_withdrawal_address,  
            self.request.layer2_transaction_id,  
            amount
        )
        status = Transaction.process_transaction(
            Transaction.TRX_WITHDRAWAL_INITIATED,
            amount,
            0,
            self.request.source_address_public_key,  
            self.request.layer1_withdrawal_address,  
            message,
            self.request.signature,  
            self.request.layer2_transaction_id
        )

        self.result = ErrorMessage.build_error_message(status)

# This API is called by the Layer2Bridge to get the withdrawals to withdraw funds to the layer1 address
class getWithdrawalRequests(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: GetWithdrawalRequestsRequest = GetWithdrawalRequestsRequest(**request_dict)

    def processRequest(self):
        withdrawalRequests = Onboarding.getWithdrawalRequests(self.request.latest_timestamp)
        withdrawal_requests_data = [
            WithdrawalRequest(
                layer1_address=req.layer1_address,
                layer1_transaction_id=req.layer1_transaction_id,
                status=req.status,
                amount=req.amount,
                layer2_withdrawal_id=req.layer2_withdrawal_id,
                server_signature=req.server_signature,
                layer2_transaction_id=req.layer2_transaction_id,
                withdrawal_requested_timestamp=req.withdrawal_requested_timestamp,
                withdrawal_requested_timestamp_str="" #TODO convert SQLAlchemy DateTime to string
            ) for req in withdrawalRequests
        ]
        self.result = GetWithdrawalRequestsResponse(
            error_code=ErrorMessage.ERROR_SUCCESS,
            error_message=ErrorMessage.get_error_message(ErrorMessage.ERROR_SUCCESS),
            withdrawal_requests=withdrawal_requests_data
        )

# This API is called by the Layer2Bridge to signal that it has received the withdrawal requests 
class ackWithdrawalRequests(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: AckWithdrawalRequestsRequest = AckWithdrawalRequestsRequest(**request_dict)

    def processRequest(self):
        Onboarding.ackWithdrawalRequests(self.request.layer2_withdrawal_ids)
        self.result = AckWithdrawalRequestsResponse(
            error_code=ErrorMessage.ERROR_SUCCESS,
            error_message=ErrorMessage.get_error_message(ErrorMessage.ERROR_SUCCESS)
        )

# This API is called by the Layer2Bridge to signal that the withdrawal requests have been broadcasted but not confirmed on the layer1
class withdrawalBroadcasted(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: WithdrawalBroadcastedRequest = WithdrawalBroadcastedRequest(**request_dict)
    def processRequest(self):
        transactionResults: List[Layer1BroadcastedWithdrawalTransactionStatus] = []
        for trx in self.request.transactions:
            error = Onboarding.withdrawalBroadcasted(trx.layer1_transaction_id, trx.layer1_transaction_vout, trx.layer1_address, trx.amount, trx.layer2_withdrawal_id, trx.signature)
            layer1TransactionResult = Layer1BroadcastedWithdrawalTransactionStatus(
                layer2_withdrawal_id=trx.layer2_withdrawal_id,
                error_code=error,
                error_message=ErrorMessage.get_error_message(error),
            )
            transactionResults.append(layer1TransactionResult)
        self.result = WithdrawalBroadcastedResponse(
            error_code=ErrorMessage.ERROR_SUCCESS,
            error_message=ErrorMessage.get_error_message(ErrorMessage.ERROR_SUCCESS),
            transactions=transactionResults
        )

# This API is called by the Layer2Bridge to signal that the withdrawal requests have been confirmed on the layer1 network
class withdrawalConfirmed(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: WithdrawalConfirmedRequest = WithdrawalConfirmedRequest(**request_dict)
    def processRequest(self):
        transactionResults = []
        for trx in self.request.transactions:
            error_code = Onboarding.withdrawalConfirmed(trx.layer1_transaction_id, trx.layer1_transaction_vout, trx.layer1_address, trx.amount, trx.signature)
            layer1TransactionResult = Layer1WithdrawalConfirmedTransactionStatus(
                layer1_transaction_id=trx.layer1_transaction_id,
                layer1_transaction_vout=trx.layer1_transaction_vout,
                error_code=error_code,
                error_message=ErrorMessage.get_error_message(error_code)
            )
            transactionResults.append(layer1TransactionResult)

        self.result = WithdrawalConfirmedResponse(
            error_code=ErrorMessage.ERROR_SUCCESS,
            error_message=ErrorMessage.get_error_message(ErrorMessage.ERROR_SUCCESS),
            transactions=transactionResults
        )

# This API is called by the Layer2Bridge to signal that the withdrawal requests have been canceled
# Currenty, this is not used
class withdrawalCanceled(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: WithdrawalCanceledRequest = WithdrawalCanceledRequest(**request_dict)
    def processRequest(self):
        rslt = Onboarding.withdrawalCanceled(self.request.source_address_public_key, self.request.transaction_id, self.request.amount, self.request.signature)
        self.result = ErrorMessage.build_error_message(rslt)

class getNewDepositAddress(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request = GetDepositAddressRequest(**request_dict)

    def processRequest(self):
        rslt, address = Onboarding.getDepositAddress(self.request.layer2_address_pubkey, self.request.nonce, self.request.signature)
        self.result = GetDepositAddressResponse(
            **ErrorMessage.build_error_message(rslt),
            layer1_deposit_address=address if rslt == ErrorMessage.ERROR_SUCCESS else ""
        )
        print("getNewDepositAddress: ", self.result)

class verifyDepositAddress(InstachainRequestHandler):
    def getParameters(self):
        pass
    def processRequest(self):
        pass

# This API is called by the Layer2Bridge to signal that a new deposit has been received and confirmed on the layer1 network
class depositConfirmed(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request: DepositConfirmedRequest = DepositConfirmedRequest(**request_dict)

    def processRequest(self):
        transactionResults = []
        for trx in self.request.transactions:
            error_code = Onboarding.depositConfirmed(
                    trx.layer1_transaction_id,
                    trx.layer1_transaction_vout,
                    trx.layer1_address,
                    trx.amount,
                    trx.nonce,
                    trx.signature
            )
            layer1DepositConfirmedTransaction = Layer1DepositConfirmedTransaction(
                layer1_transaction_id=trx.layer1_transaction_id,
                layer1_transaction_vout=trx.layer1_transaction_vout,
                error_code=error_code,
                error_message=ErrorMessage.get_error_message(error_code)
            )
            transactionResults.append(layer1DepositConfirmedTransaction)

        self.result = DepositConfirmedResponse(
            error_code=ErrorMessage.ERROR_SUCCESS,
            error_message=ErrorMessage.get_error_message(ErrorMessage.ERROR_SUCCESS),
            transactions=transactionResults
        )
