from Transaction import Transaction, AddressBalanceCache
from Onboarding import WithdrawalRequests, DepositAddresses, MasterPublicKeyIndex
from google.cloud import ndb
from BlitzAPI import BlitzRequestHandler

class Delete(BlitzRequestHandler):
    def getParameters(self):
        ndb.delete_multi(Transaction.query().fetch(keys_only=True))
        ndb.delete_multi(AddressBalanceCache.query().fetch(keys_only=True))
        ndb.delete_multi(WithdrawalRequests.query().fetch(keys_only=True))
        ndb.delete_multi(DepositAddresses.query().fetch(keys_only=True))
        ndb.delete_multi(MasterPublicKeyIndex.query().fetch(keys_only=True))
