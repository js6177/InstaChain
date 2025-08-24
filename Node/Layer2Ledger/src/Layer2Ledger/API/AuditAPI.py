import json
from types import SimpleNamespace
from Layer2Ledger.core import Audit
from Layer2Ledger.API.InstaChainAPI import InstachainRequestHandler
from Layer2Ledger.API.NodeInfoAPI import NODE_ID
from Layer2Ledger.core import GlobalLogging
from Layer2Ledger.core import KeyVerification
from Layer2Ledger.core import ErrorMessage
from Layer2Ledger.database.database import get_db, AsyncSession
from Layer2Ledger.services.messages.Layer2Ledger.Responses.GetLayer1AuditReportResponse import GetLayer1AuditReportResponse, Layer1AddressBalance
from Layer2Ledger.services.messages.Layer2Ledger.Requests.PostLayer1AuditReportRequest import PostLayer1AuditReportRequest
from Layer2Ledger.services.messages.Layer2Ledger.Responses.PostLayer1AuditReportResponse import PostLayer1AuditReportResponse
from Layer2Ledger.services.messages.Layer2Ledger.Requests.GetLayer1AuditReportRequest import GetLayer1AuditReportRequest
from fastapi import Depends, Request

#called from the node
class postLayer1AuditReport(InstachainRequestHandler):
    async def getParameters(self, request: Request):
        request_dict = await self.getPostJsonParams(request)
        self.request = PostLayer1AuditReportRequest(**request_dict)

    async def processRequest(self, db: AsyncSession = Depends(get_db)):
        layer1AddressBalances = {
            balance.layer1_address: balance.balance
            for balance in self.request.layer1_address_balances
        }
        totalBalance = sum(balance.balance for balance in self.request.layer1_address_balances)
        status = await Audit.processLayer1AuditReport(
            db,
            self.request.block_height,
            layer1AddressBalances,
            totalBalance,
            self.request.signature
        )
        self.result = PostLayer1AuditReportResponse(
            **ErrorMessage.build_error_message(status)
        )

class getLayer1AuditReport(InstachainRequestHandler):
    async def getParameters(self, request: Request):
        block_height_str = self.getRequestParams(request, 'block_height')
        request_dict = {'block_height': int(block_height_str or 0)}
        self.request = GetLayer1AuditReportRequest(**request_dict)

    async def processRequest(self, db: AsyncSession = Depends(get_db)):
        (result, report) = (ErrorMessage.ERROR_SUCCESS, None)
        address_balances = []
        try:
            (result, report) = await Audit.getLayer1AuditReport(db, self.request.block_height)
            address_balances = [
                Layer1AddressBalance(
                    layer1Address=layer1AddressBalance.layer1Address,
                    balance=layer1AddressBalance.balance
                )
                for layer1AddressBalance in await Audit.getLayer1AddressBalances(db)
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
