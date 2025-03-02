from flask import Flask
from flask_cors import CORS
import InstaChainAPI
import NodeInfoAPI
import TransactionAPI
import OnboardingAPI
import AuditAPI
import ExplorerAPI
import GlobalLogging
from database import Base, engine
from Transaction import Transaction, TotalFees, AddressLock, AddressBalanceCache
from Onboarding import WithdrawalRequests, ConfirmedWithdrawals, DepositAddresses, MasterPublicKeyIndex
from DebugLogger import TransactionDuration

import SuperUser #delete this in production

# Create all tables if they don't exist
Base.metadata.create_all(bind=engine)

app = Flask(__name__)
CORS(app)

app.add_url_rule(r'/getNodeInfo', 'getNodeInfo', NodeInfoAPI.getNodeInfo.initializeRequest)

app.add_url_rule(r'/pushTransaction', 'pushTransaction', TransactionAPI.pushTransaction.initializeRequest, methods=['POST'])
app.add_url_rule(r'/getBalance', 'getBalance', TransactionAPI.getBalance.initializeRequest, methods=['POST'])
app.add_url_rule(r'/getTransaction', 'getTransaction', TransactionAPI.getTransaction.initializeRequest)
app.add_url_rule(r'/getAllTransactionsOfPublicKey', 'getAllTransactionsOfPublicKey', TransactionAPI.getAllTransactionsOfPublicKey.initializeRequest, methods=['POST'])
app.add_url_rule(r'/getFee', 'getFee', TransactionAPI.getFee.initializeRequest)

app.add_url_rule(r'/withdrawalRequest', 'withdrawalRequest', OnboardingAPI.withdrawalRequest.initializeRequest, methods=['POST'])
app.add_url_rule(r'/withdrawalCanceled', 'withdrawalCanceled', OnboardingAPI.withdrawalCanceled.initializeRequest)
app.add_url_rule(r'/withdrawalBroadcasted', 'withdrawalBroadcasted', OnboardingAPI.withdrawalBroadcasted.initializeRequest, methods=['POST'])
app.add_url_rule(r'/withdrawalConfirmed', 'withdrawalConfirmed', OnboardingAPI.withdrawalConfirmed.initializeRequest, methods=['POST'])
app.add_url_rule(r'/getWithdrawalRequests', 'getWithdrawalRequests', OnboardingAPI.getWithdrawalRequests.initializeRequest)
app.add_url_rule(r'/ackWithdrawalRequests', 'ackWithdrawalRequests', OnboardingAPI.ackWithdrawalRequests.initializeRequest, methods=['POST'])
app.add_url_rule(r'/getNewDepositAddress', 'getNewDepositAddress', OnboardingAPI.getNewDepositAddress.initializeRequest) # get a new address to deposit mainnet coins into
app.add_url_rule(r'/depositFunds', 'depositFunds', OnboardingAPI.depositConfirmed.initializeRequest, methods=['POST']) #this transaction will be signed by the deposited addresses public key. This API will only be called by the full node

app.add_url_rule(r'/postLayer1AuditReport', 'postLayer1AuditReport', AuditAPI.postLayer1AuditReport.initializeRequest, methods=['POST'])
app.add_url_rule(r'/getLayer1AuditReport', 'getLayer1AuditReport', AuditAPI.getLayer1AuditReport.initializeRequest)

app.add_url_rule(r'/search', 'search', ExplorerAPI.search.initializeRequest)

# Remove from production, the /delete is only for deleting all the tables when dev/testing
#app.add_url_rule(r'/delete', 'delete', SuperUser.Delete.initializeRequest)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8084, debug=True, threaded=True)