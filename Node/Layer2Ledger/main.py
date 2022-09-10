from google.cloud import ndb
from google.cloud import logging
from flask import Flask
from flask_cors import CORS
import InstaChainAPI
import NodeInfoAPI
import TransactionAPI
import OnboardingAPI
import GlobalLogging

import SuperUser #delete this in production

GlobalLogging.logging_client = logging.Client()
GlobalLogging.logging_client.get_default_handler()
GlobalLogging.logging_client.setup_logging()
GlobalLogging.logger = GlobalLogging.logging_client.logger('log')


app = Flask(__name__)
CORS(app)

app.add_url_rule(r'/getNodeInfo', 'getNodeInfo', NodeInfoAPI.getNodeInfo.initializeRequest)

app.add_url_rule(r'/pushTransaction', 'pushTransaction', TransactionAPI.pushTransaction.initializeRequest, methods=['POST'])
app.add_url_rule(r'/getBalance', 'getBalance', TransactionAPI.getBalance.initializeRequest, methods=['POST'])
app.add_url_rule(r'/getTransaction', 'getTransaction', TransactionAPI.getTransaction.initializeRequest)
app.add_url_rule(r'/getAllTransactionsOfPublicKey', 'getAllTransactionsOfPublicKey', TransactionAPI.getAllTransactionsOfPublicKey.initializeRequest)
app.add_url_rule(r'/getFee', 'getFee', TransactionAPI.getFee.initializeRequest)

app.add_url_rule(r'/withdrawalRequest', 'withdrawalRequest', OnboardingAPI.withdrawalRequest.initializeRequest, methods=['POST'])
app.add_url_rule(r'/withdrawalCanceled', 'withdrawalCanceled', OnboardingAPI.withdrawalCanceled.initializeRequest)
app.add_url_rule(r'/withdrawalBroadcasted', 'withdrawalBroadcasted', OnboardingAPI.withdrawalBroadcasted.initializeRequest, methods=['POST'])
app.add_url_rule(r'/withdrawalConfirmed', 'withdrawalConfirmed', OnboardingAPI.withdrawalConfirmed.initializeRequest, methods=['POST'])
app.add_url_rule(r'/getWithdrawalRequests', 'getWithdrawalRequests', OnboardingAPI.getWithdrawalRequests.initializeRequest)
app.add_url_rule(r'/ackWithdrawalRequests', 'ackWithdrawalRequests', OnboardingAPI.ackWithdrawalRequests.initializeRequest, methods=['POST'])
app.add_url_rule(r'/getNewDepositAddress', 'getNewDepositAddress', OnboardingAPI.getNewDepositAddress.initializeRequest) # get a new address to deposit mainnet coins into
app.add_url_rule(r'/depositFunds', 'depositFunds', OnboardingAPI.depositConfirmed.initializeRequest, methods=['POST']) #this transaction will be signed by the deposited addresses public key. This API will only be called by the full node

# Remove from production, the /delete is only for deleting all the tables when dev/testing
#app.add_url_rule(r'/delete', 'delete', SuperUser.Delete.initializeRequest)