import ErrorMessage
from BlitzAPI import BlitzRequestHandler


#unique randomly generated alphanumeric string valid for the lifetime of the node + ledger
#used as a nonce for signing transactions to prevent cross-node relay attacks, has no cryptographic value 
NODE_ID = 'BbwLnyLR9eVjL2qb'

class getNodeInfo(BlitzRequestHandler):
    def processRequest(self):
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.result['node_info'] = {'node_id': NODE_ID, 'node_name': 'Mother Node'}