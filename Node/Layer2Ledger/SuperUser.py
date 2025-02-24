from Transaction import Transaction, AddressBalanceCache, AddressLock
from Onboarding import WithdrawalRequests, DepositAddresses, MasterPublicKeyIndex, ConfirmedWithdrawals
from database import get_db
from InstaChainAPI import InstachainRequestHandler

MAX_TRANSACTIONS_TO_DELETE_PER_REQUEST = 10000

class Delete(InstachainRequestHandler):
    def getParameters(self):
        db = next(get_db())
        try:
            # Delete all records from each table
            db.query(WithdrawalRequests).delete()
            db.query(ConfirmedWithdrawals).delete()
            db.query(AddressLock).delete()
            db.query(DepositAddresses).delete()
            db.query(MasterPublicKeyIndex).delete()
            db.query(AddressBalanceCache).delete()

            # Delete transactions in batches to avoid memory issues
            while True:
                count = db.query(Transaction).limit(MAX_TRANSACTIONS_TO_DELETE_PER_REQUEST).delete(synchronize_session=False)
                if count == 0:
                    break
                db.commit()

            db.commit()
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()
