from google.cloud import ndb
import datetime

TIMER_PRECISION = 3
TRANSACTION_DURATION_LOGGING_ENABLED = False

class TransactionDuration(ndb.Model):
    timestamp = ndb.DateTimeProperty(auto_now_add=True)
    duration = ndb.FloatProperty()
    transaction_id = ndb.StringProperty()
    action = ndb.StringProperty()
    item_count = ndb.IntegerProperty()

    @staticmethod
    def logDuration(previousTimestamp, _transaction_id, _action, _item_count = 0):
        if(TRANSACTION_DURATION_LOGGING_ENABLED):
            t2 = datetime.datetime.now()
            delta = t2 - previousTimestamp
            log = TransactionDuration(action=_action, item_count = _item_count, duration=round(delta.total_seconds() * 1000, TIMER_PRECISION), transaction_id=_transaction_id)
            log.put_async() #do not wait for the db operation to finish
