from enum import Enum

import ErrorMessage
from InstaChainAPI import InstachainRequestHandler
import GlobalLogging

from Transaction import Transaction

class SearchType(Enum):
    SEARCH_ALL: str = "*"
    L2_TRANSACTION: str = "l2_transaction"
    L2_ADDRESS: str = "l2_address"
    DEPOSIT_ADDRESS: str = "deposit_address"


class search(InstachainRequestHandler):
    def getParameters(self):
        self.search_string = self.getRequestParams('search_string')
        self.search_type = self.getRequestParams('search_type')
        GlobalLogging.log_text("v1 search_string: " + self.search_string)
        GlobalLogging.log_text("v1 search_type: " + self.search_type)
    def processRequest(self):
        GlobalLogging.log_text("starting search")
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.result['search_string'] = self.search_string
        self.result['search_type'] = self.search_type
        self.result["l2_transaction"] = None
        self.result["l2_address"] = None
        if(self.search_type not in [member.value for member in SearchType]):
            self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SEARCH_TYPE_NOT_SUPPORTED)
            GlobalLogging.log_text("search_type: not supported")
            return
        if((self.search_type == SearchType.L2_TRANSACTION) or (self.search_type == SearchType.SEARCH_ALL.value)):
            GlobalLogging.log_text("search... L2_TRANSACTION")
            (error_code, transaction) = Transaction.get_transaction(self.search_string)
            GlobalLogging.log_text("search... L2_TRANSACTION found : " + str(error_code))
            if(error_code == ErrorMessage.ERROR_SUCCESS):
                self.result["l2_transaction"] = transaction.to_dict()
        if((self.search_type == SearchType.L2_ADDRESS) or (self.search_type == SearchType.SEARCH_ALL.value)):
            GlobalLogging.log_text("search... L2_ADDRESS")
            (address_balance, address_found) = Transaction.get_balance(self.search_string, True, True)
            GlobalLogging.log_text("search... L2_ADDRESS found : " + str(address_found))
            if(address_found):
                self.result["l2_address"] = {'public_key': self.search_string, 'balance': address_balance, 'address_found': address_found }
        GlobalLogging.log_text("finished search")
