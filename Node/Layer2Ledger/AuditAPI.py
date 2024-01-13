import json
from types import SimpleNamespace
import Audit


from InstaChainAPI import InstachainRequestHandler
from NodeInfoAPI import NODE_ID
import GlobalLogging
import KeyVerification
import ErrorMessage

#called from the node
class postLayer1AuditReport(InstachainRequestHandler):
    def getParameters(self):
        self.jsonParam = self.getPostJsonParams()

    def processRequest(self):
        layer1AddressBalances = {}
        totalBalance = 0
        blockHeight = 0
        request = json.loads(json.dumps(self.jsonParam), object_hook=lambda d: SimpleNamespace(**d))
        blockHeight = request.block_height
        for layer1AddressBalance in request.layer1_address_balances:
            layer1AddressBalances[layer1AddressBalance.layer1_address] = layer1AddressBalance.balance
            totalBalance += layer1AddressBalance.balance
        status = Audit.processLayer1AuditReport(blockHeight, layer1AddressBalances, totalBalance, request.signature)
        self.result = ErrorMessage.build_error_message(status)

class getLayer1AuditReport(InstachainRequestHandler):
    def getParameters(self):
        self.block_height = int(self.getRequestParams('block_height') or 0)

    def processRequest(self):
        report = Audit.getLayer1AuditReport(self.block_height)
        address_balances = Audit.getLayer1AddressBalances()
        if report is None:
            self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_AUDIT_REPORT_DOES_NOT_EXIST)
        else:
            self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
            self.result['report'] = report.to_dict()
            self.result['address_balances'] = [address_balance.to_dict() for address_balance in address_balances]
        