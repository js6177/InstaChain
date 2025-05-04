import json
from types import SimpleNamespace
import Audit


from InstaChainAPI import InstachainRequestHandler
from NodeInfoAPI import NODE_ID
import GlobalLogging
import KeyVerification
import ErrorMessage
from services.messages.Layer2Ledger.Responses.GetLayer1AuditReportResponse import GetLayer1AuditReportResponse
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
        report = Audit.getLayer1AuditReport(self.request.block_height)
        address_balances = Audit.getLayer1AddressBalances()
        if report is None:
            self.result = GetLayer1AuditReportResponse(
                **ErrorMessage.build_error_message(ErrorMessage.ERROR_AUDIT_REPORT_DOES_NOT_EXIST),
                addressBalances=[],
                blockHeight=0,
                ready=False,
                totalBalance=0
            )
        else:
            self.result = GetLayer1AuditReportResponse(
                **ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS),
                addressBalances=[address_balance.to_dict() for address_balance in address_balances],
                blockHeight=report.block_height,
                ready=True,
                totalBalance=report.total_balance
            )
