from Transaction import Transaction, AddressBalanceCache, AddressLock
from Onboarding import WithdrawalRequests, DepositAddresses, MasterPublicKeyIndex, ConfirmedWithdrawals
from google.cloud import ndb
from InstaChainAPI import InstachainRequestHandler
import RedisInterface

MAX_TRANSACTIONS_TO_DEETE_PER_REQUEST = 10000

class Delete(InstachainRequestHandler):
    def getParameters(self):
        RedisInterface.clearDatabase()
        ndb.delete_multi(WithdrawalRequests.query().fetch(keys_only=True))
        ndb.delete_multi(ConfirmedWithdrawals.query().fetch(keys_only=True))
        ndb.delete_multi(AddressLock.query().fetch(keys_only=True))  
        ndb.delete_multi(DepositAddresses.query().fetch(keys_only=True))
        ndb.delete_multi(MasterPublicKeyIndex.query().fetch(keys_only=True))
        ndb.delete_multi(AddressBalanceCache.query().fetch(keys_only=True))

        q = Transaction.query().fetch(MAX_TRANSACTIONS_TO_DEETE_PER_REQUEST, keys_only=True)
        count = len(q)
        while(count > 0):
            ndb.delete_multi(q)
            q = Transaction.query().fetch(MAX_TRANSACTIONS_TO_DEETE_PER_REQUEST, keys_only=True)
            count = len(q)
