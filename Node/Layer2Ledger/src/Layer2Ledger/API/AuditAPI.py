import json
from types import SimpleNamespace
import Audit


from InstaChainAPI import InstachainRequestHandler
from NodeInfoAPI import NODE_ID
import GlobalLogging
import KeyVerification
import ErrorMessage
from Layer2Ledger.database.database import get_db
from services.messages.Layer2Ledger.Responses.GetLayer1AuditReportResponse import GetLayer1AuditReportResponse, Layer1AddressBalance
from services.messages.Layer2Ledger.Requests.PostLayer1AuditReportRequest import PostLayer1AuditReportRequest
from services.messages.Layer2Ledger.Responses.PostLayer1AuditReportResponse import PostLayer1AuditReportResponse
from services.messages.Layer2Ledger.Requests.GetLayer1AuditReportRequest import GetLayer1AuditReportRequest

#called from the node
class postLayer1AuditReport(InstachainRequestHandler):
    def getParameters(self):
        request_dict = self.getPostJsonParams()
        self.request = PostLayer1AuditReportRequest(**request_dict)

    def processRequest(self):
        layer1AddressBalances = {
            balance.layer1_address: balance.balance
            for balance in self.request.layer1_address_balances
        }
        totalBalance = sum(balance.balance for balance in self.request.layer1_address_balances)
        status = Audit.processLayer1AuditReport(
            self.request.block_height,
            layer1AddressBalances,
            totalBalance,
            self.request.signature
        )
        self.result = PostLayer1AuditReportResponse(
            **ErrorMessage.build_error_message(status)
        )

class getLayer1AuditReport(InstachainRequestHandler):
    def getParameters(self):
        request_dict = {'block_height': int(self.getRequestParams('block_height') or 0)}
        self.request = GetLayer1AuditReportRequest(**request_dict)

    def processRequest(self):
        (result, report) = (ErrorMessage.ERROR_SUCCESS, None)
        address_balances = []
        with get_db() as db:
            try:
                (result, report) = Audit.getLayer1AuditReport(db, self.request.block_height)
                address_balances = [
                    Layer1AddressBalance(
                        layer1Address=layer1AddressBalance.layer1Address,
                        balance=layer1AddressBalance.balance
                    )
                    for layer1AddressBalance in Audit.getLayer1AddressBalances(db)
                ]
            except Exception as e:
                result = ErrorMessage.ERROR_FAILED_TO_READ_FROM_DATABASE
        if report is None:
            self.result = GetLayer1AuditReportResponse(
                **ErrorMessage.build_error_message(result),
                addressBalances=[],
                blockHeight=0,
                ready=False,
                totalBalance=0
            )
        else:
            self.result = GetLayer1AuditReportResponse(
                **ErrorMessage.build_error_message(result),
                addressBalances=address_balances,
                blockHeight=report.blockHeight,
                ready=True,
                totalBalance=report.balance
            )
