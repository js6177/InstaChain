import sqlite3
import string
from pprint import pprint

from constants import *

DEFAULT_DATABASE_NAME = "bitcoin.db"

class ConfirmedTransaction():
    #values for layer2 status (deposits)
    LAYER2_STATUS_PENDING = 1
    LAYER2_STATUS_CONFIRMED = 2

    CATEGORY_SEND = 'send'
    CATEGORY_RECIEVE = 'receive'

    transaction_id = ''
    transaction_vout = 0
    layer2_status = None
    amount = 0
    fee = 0
    address = ''
    category = ''
    confirmations = 0
    timestamp = 0
    blockheight = 0

    def setValues(self, transaction_id, layer2_status, transaction_vout, amount, fee, address, category, confirmations, timestamp, blockheight):
        self.transaction_id = transaction_id
        self.transaction_vout = transaction_vout
        self.layer2_status =  layer2_status
        self.amount = amount
        self.fee = fee
        self.address = address
        self.category = category
        self.confirmations = confirmations
        self.timestamp = timestamp
        self.blockheight = blockheight

    def __init__(self, transaction_id = '', layer2_status = None, transaction_vout = 0, amount = 0, fee = 0, address = '', category = '', confirmations = 0, timestamp = 0, blockheight = 0):
        self.setValues(transaction_id, layer2_status, transaction_vout, amount, fee, address, category, confirmations, timestamp, blockheight)

    def fromListSinceBlockRpcJson(self, transactionJSON):
        self.setValues(transactionJSON["txid"], ConfirmedTransaction.LAYER2_STATUS_PENDING, transactionJSON["vout"], int(transactionJSON["amount"]*SATOSHI_PER_BITCOIN), 0, transactionJSON["address"], transactionJSON["category"], transactionJSON["confirmations"], transactionJSON["time"], transactionJSON["blockheight"])
        return self

    def fromGetTransactionDetails(self, transactionDetailJSON, transaction_id, blockheight, timestamp):
        print("transactionDetailJSON: " + str(transactionDetailJSON))
        self.setValues(transaction_id, ConfirmedTransaction.LAYER2_STATUS_PENDING, transactionDetailJSON["vout"], transactionDetailJSON["amount"], transactionDetailJSON.get("fee") or 0, transactionDetailJSON["address"], transactionDetailJSON["category"], 0, timestamp, blockheight)
        return self

    @staticmethod
    def fromGetTransaction(getTransactionJSON):
        outputs = {}
        transactionDetails = getTransactionJSON["details"]
        for transactionDetail in transactionDetails:
            output = ConfirmedTransaction().fromGetTransactionDetails(transactionDetail, getTransactionJSON["txid"], 0, getTransactionJSON["time"])
            outputs[output.address] = output
        return outputs

class PendingWithdrawal():
    #values for layer1 status (withdrawal requests)
    LAYER1_STATUS_PENDING = 1 #the withdrawal has not been broadcasted
    LAYER1_STATUS_BROADCASTED = 2 #the withdrawal has been broadcasted and is in the mempool and is pending confirmations
    LAYER1_STATUS_BROADCASTED_REMOVED_FROM_MEMPOOL = 3 #the transation had been previously prodcasted and was in the mempool, but was then removed form the mempool (bumped out)
    LAYER1_STATUS_CONFIRMED = 4 #the withdrawal has been confirmed with target confirmations

    layer2_withdrawal_id = ''
    status = None
    transaction_id = ''
    amount = 0
    fee = 0
    destination_address = ''
    confirmations = 0
    withdrawal_requested_timestamp = 0
    date_broadcasted = 0

    def setValues(self, layer2_withdrawal_id, status, transaction_id, amount, fee, destination_address, confirmations, withdrawal_requested_timestamp, date_broadcasted):
        self.layer2_withdrawal_id = layer2_withdrawal_id
        self.status =  status
        self.transaction_id = transaction_id
        self.amount = amount
        self.fee = fee
        self.destination_address = destination_address
        self.confirmations = confirmations
        self.withdrawal_requested_timestamp = withdrawal_requested_timestamp
        self.date_broadcasted = date_broadcasted

    def __init__(self, layer2_withdrawal_id = '', status = None, transaction_id = '', amount = 0, fee = 0, destination_address = '', confirmations = 0, withdrawal_requested_timestamp = 0, date_broadcasted = 0):
        self.setValues(layer2_withdrawal_id, status, transaction_id, amount, fee, destination_address, confirmations, withdrawal_requested_timestamp, date_broadcasted)

    def fromWithdrawalRequestAPIJson(self, withdrawalJSON: string):
        self.setValues(withdrawalJSON['layer2_withdrawal_id'], withdrawalJSON['status'], '', withdrawalJSON['amount'], 0, withdrawalJSON['layer1_address'], 0, withdrawalJSON['withdrawal_requested_timestamp'], 0)
        return self


class DB():
    conn = None
    cursor = None
    def __init__(self, wallet_name, *args, **kwargs):
        self.conn = sqlite3.connect(wallet_name or DEFAULT_DATABASE_NAME)
        self.cursor = self.conn.cursor()
        return super().__init__(*args, **kwargs)

    def openOrCreateDB(self):
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS ConfirmedTransactions
             (transaction_id, layer2_status INTEGER, transaction_vout INTEGER, amount INTEGER, fee INTEGER, address TEXT, category TEXT, confirmations INTEGER, timestamp INTEGER, CONSTRAINT PK_Output PRIMARY KEY (transaction_id, transaction_vout, category) )''')
        self.cursor.execute('''CREATE INDEX IF NOT EXISTS UIX_ConfirmedTransactions_layer2_status
             ON ConfirmedTransactions (layer2_status)''')
        self.conn.commit()

        self.cursor.execute('''CREATE TABLE IF NOT EXISTS PendingWithdrawals
             (layer2_withdrawal_id TEXT PRIMARY KEY, status INTEGER, transaction_id TEXT, amount INTEGER, fee INTEGER, destination_address TEXT, confirmations INTEGER, withdrawal_requested_timestamp INTEGER, date_broadcasted INTEGER)''')
        self.cursor.execute('''CREATE INDEX IF NOT EXISTS UIX_PendingWithdrawals_layer2_withdrawal_id
             ON PendingWithdrawals (layer2_withdrawal_id)''')
        self.cursor.execute('''CREATE INDEX IF NOT EXISTS NIX_PendingWithdrawals_status
             ON PendingWithdrawals (status)''')

        self.cursor.execute('''CREATE TABLE IF NOT EXISTS KeyValue
             (_key TEXT PRIMARY KEY, value TEXT)''')
        self.cursor.execute('''CREATE INDEX IF NOT EXISTS UIX_KeyValue_key
             ON KeyValue (_key)''')
        self.conn.commit()

    def getPendingWithdrawals(self):
        withdrawals = []
        status = (PendingWithdrawal.LAYER1_STATUS_PENDING,)
        withdrawalRows = self.cursor.execute('SELECT * FROM PendingWithdrawals WHERE status=?', status).fetchall()
        for row in withdrawalRows:
            withdrawals.append(PendingWithdrawal(*row))
        return withdrawals

    def getPendingWithdrawal(self, _layer2_withdrawal_id):
        withdrawal = None
        layer2_withdrawal_id = (_layer2_withdrawal_id,)
        withdrawalRow = self.cursor.execute('SELECT * FROM PendingWithdrawals WHERE layer2_withdrawal_id=?', layer2_withdrawal_id).fetchone()
        if(withdrawalRow):
            withdrawal = PendingWithdrawal(*withdrawalRow)
        return withdrawal

    def insertPendingWithdrawal(self, pendingWithdrawal: PendingWithdrawal):
        try:
            withdrawal = (pendingWithdrawal.layer2_withdrawal_id, pendingWithdrawal.status, pendingWithdrawal.transaction_id, pendingWithdrawal.amount, pendingWithdrawal.fee, pendingWithdrawal.destination_address, pendingWithdrawal.confirmations, pendingWithdrawal.withdrawal_requested_timestamp, pendingWithdrawal.date_broadcasted)
            self.cursor.execute('''INSERT INTO PendingWithdrawals (layer2_withdrawal_id, status, transaction_id, amount, fee, destination_address, confirmations, withdrawal_requested_timestamp, date_broadcasted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''', withdrawal)
            self.conn.commit()
        except Exception as e:
            print(str(e))


    def updatePendingWithdrawal(self, layer2_withdrawal_id, status, transaction_id, fee):
        params = (status, transaction_id, fee, layer2_withdrawal_id)
        self.cursor.execute('''
        UPDATE PendingWithdrawals
            SET status = ?,
            transaction_id = ?,
            fee = ?
        WHERE
            layer2_withdrawal_id == ?''', params)
        self.conn.commit()

    def insertConfirmedTransaction(self, confirmedTransaction: ConfirmedTransaction):
        print("Inserting ConfirmedTransaction: " + confirmedTransaction.transaction_id + '-' + str(confirmedTransaction.transaction_vout))
        transaction = (confirmedTransaction.transaction_id, confirmedTransaction.transaction_vout, confirmedTransaction.layer2_status, confirmedTransaction.amount, confirmedTransaction.fee, confirmedTransaction.address, confirmedTransaction.category, confirmedTransaction.confirmations, confirmedTransaction.timestamp)
        self.cursor.execute('''INSERT INTO ConfirmedTransactions (transaction_id, transaction_vout, layer2_status, amount, fee, address, category, confirmations, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''', transaction)
        self.conn.commit()

    def getAllPendingConfirmedTransactions(self):
        transactions = []
        status = (ConfirmedTransaction.LAYER2_STATUS_PENDING,)
        transactionRows = self.cursor.execute('SELECT * FROM ConfirmedTransactions WHERE layer2_status=?', status).fetchall()
        for row in transactionRows:
            transactions.append(ConfirmedTransaction(*row))
        return transactions

    def getPendingConfirmedTransactions(self, category):
        transactions = []
        status = (ConfirmedTransaction.LAYER2_STATUS_PENDING, category)
        transactionRows = self.cursor.execute('SELECT * FROM ConfirmedTransactions WHERE layer2_status=? AND category=?', status).fetchall()
        for row in transactionRows:
            transactions.append(ConfirmedTransaction(*row))
            print(vars(ConfirmedTransaction(*row)))

        return transactions

    def getPendingConfirmedDepositTransactions(self):
        return self.getPendingConfirmedTransactions(ConfirmedTransaction.CATEGORY_RECIEVE)

    def getPendingConfirmedWithdrawalTransactions(self):
        return self.getPendingConfirmedTransactions(ConfirmedTransaction.CATEGORY_SEND)


    def updateConfirmedTransaction(self, transaction_id, transaction_vout, layer2_status):
        params = (layer2_status, transaction_id, transaction_vout)
        self.cursor.execute('''
        UPDATE ConfirmedTransactions
            SET layer2_status = ?
        WHERE
            transaction_id == ? AND transaction_vout == ?''', params)
        self.conn.commit()
        pass

    def getKeyValue(self, key, defaultValue = None):
        params = (key,)
        valueRow = self.cursor.execute('SELECT value FROM KeyValue WHERE _key=?', params).fetchone()
        value = defaultValue
        if(valueRow):
            value = valueRow[0]
        return value

    def setKeyValue(self, key, value, insertValueIfKeyDoesNotExist = False):
        if(self.getKeyValue(key)):
            params = (value, key)
            self.cursor.execute('UPDATE KeyValue SET value = ? WHERE _key = ?', params)
        elif(insertValueIfKeyDoesNotExist):
            params = (key, value)
            self.cursor.execute('INSERT INTO KeyValue (_key, value) VALUES (?, ?)', params)
        self.conn.commit()

    def getLastBlockHash(self):
        return self.getKeyValue('lastConfirmedBlockHash', '')

    def setLastBlockHash(self, lastConfirmedBlockHash):
        self.setKeyValue('lastConfirmedBlockHash', lastConfirmedBlockHash, lastConfirmedBlockHash)

    def getLastWithdrawalRequestTimestamp(self, defaultValue = 0):
        return int(self.getKeyValue('lastwithdrawalTimestamp', defaultValue))

    def setLastWithdrawalTimestamp(self, lastwithdrawalTimestamp, defaultValue = 0):
        self.setKeyValue('lastwithdrawalTimestamp', str(lastwithdrawalTimestamp), str(defaultValue))

    def getLastBroadcastBlockHeight(self, defaultValue = 0):
        return int(self.getKeyValue('lastBroadcastBlockHeight', defaultValue))

    def setLastBroadcastBlockHeight(self, lastBroadcastBlockHeight):
        print('Setting setLastBroadcastBlockHeight: ' + str(lastBroadcastBlockHeight))
        self.setKeyValue('lastBroadcastBlockHeight', str(lastBroadcastBlockHeight), True)

    def getBroadcastTransactionBlockDelay(self, defaultValue = 6):
        return int(self.getKeyValue('broadcastTransactionBlockDelay', defaultValue))

    def setBroadcastTransactionBlockDelay(self, broadcastTransactionDelay):
        self.setKeyValue('broadcastTransactionBlockDelay', str(broadcastTransactionBlockDelay), True)

    def getImportPrivkeyBip32Index(self, defaultValue = 0):
        return int(self.getKeyValue('importPrivkeyBip32Index', defaultValue))

    def setImportPrivkeyBip32Index(self, importPrivkeyBip32Index):
        self.setKeyValue('importPrivkeyBip32Index', str(importPrivkeyBip32Index), True)
