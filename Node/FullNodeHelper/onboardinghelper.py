import requests
import time
import os
import json
import random
import string
import datetime
from dataclasses import dataclass
#from tinydb import TinyDB, Query
import DatabaseInterface
import SigningAddress
import binascii
import checksum
from bip_utils import Bip32, Bip32Utils, Bip32Conf, BitcoinConf, Bip44BitcoinTestNet, WifEncoder
from bip_utils import P2PKH, P2SH, P2WPKH
from bitcoinrpc.authproxy import AuthServiceProxy, JSONRPCException
import traceback
import argparse
import Layer2Interface
from FullNodeInterface import BitcoinRPC
from types import SimpleNamespace

SATOSHI_PER_BITCOIN = 100000000

def main():
    #while (True):
        try:
            run()
        except Exception as e:
            print(e)
            print(traceback.format_exc())
            print('Restarting...')

def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--importprivkeys', dest='importprivkeys', action='store_true', help='Pass this parameter if you need to import private keys to the wallet instead of running the onboarding helper.')
    args = parser.parse_args()

    db = DatabaseInterface.DB()
    db.openOrCreateDB()

    # start bitcoin full node, or attach if it already started
    nh = BitcoinRPC()
    comm = Layer2Interface.Layer2Interface()

    nh.loadWallet()

    if(args.importprivkeys):
        print("Importing private keys...")
        privkeyBip32Index = db.getImportPrivkeyBip32Index()
        numberOfKeysToImport = 100000
        nh.importMultiplePrivkeys('', privkeyBip32Index, numberOfKeysToImport, True)
        db.setImportPrivkeyBip32Index(privkeyBip32Index + numberOfKeysToImport)
        print("Done importing private keys. Imported " + str(numberOfKeysToImport) + " keys from index " + str(privkeyBip32Index))
        return

    #return

    lastblockhash = db.getLastBlockHash()
    confirmedTransactionsDict = {}
    withdrawalsDict = {}
    #confirmedTransactionsDB = TinyDB('confirmedTransactions.json')
    #pendingWithdrawalsDB = TinyDB('pendingWithdrawals.json')

    #load pending confirmed transactions from the DB
    #q = Query()
    #pendingConfirmedTransactions = confirmedTransactionsDB.search(q.layer2_status == LAYER2_STATUS_PENDING)
    pendingConfirmedDepositTransactions = db.getAllPendingConfirmedTransactions()
    for trx in pendingConfirmedDepositTransactions:
        confirmedTransactionsDict[trx.transaction_id] = trx

    #load pending withdrawal transactions from the DB
    #q = Query()
    #pendingWithdrawals = pendingWithdrawalsDB.search(q.layer1_status == LAYER1_STATUS_PENDING)
    pendingWithdrawals = db.getPendingWithdrawals()
    for withdrawal in pendingWithdrawals:
        withdrawalsDict[withdrawal.withdrawal_id] = withdrawal


    while(True):
        confirmedTransactions = []
        lastblockhash, confirmedTransactions = nh.getConfirmedTransactions(lastblockhash)

        blockheight = nh.getBlockHeader(lastblockhash)["height"]
        print('Latest blockheight: ' +  str(blockheight))
        for confirmedTransactionJSON in confirmedTransactions:
            if(int(confirmedTransactionJSON["confirmations"]) >= nh.getTargetConfirmations()):
                trxid = confirmedTransactionJSON["txid"]
                vout = confirmedTransactionJSON["vout"]
                if((trxid, vout) not in confirmedTransactionsDict):
                    confirmedTransaction = DatabaseInterface.ConfirmedTransaction().fromListSinceBlockRpcJson(confirmedTransactionJSON)
                    confirmedTransactionsDict[(trxid, vout)] = confirmedTransaction #add in memory
                    db.insertConfirmedTransaction(confirmedTransaction)
                    #print("New confirmed transaction (" + confirmedTransactionJSON["category"] + "). transaction_id: " + trxid + ' address: ' + confirmedTransaction.address)
        print("lastblockhash: " + lastblockhash)
        db.setLastBlockHash(lastblockhash)

        #get pending withdrawals from the backend, and save it to the db
        lastwithdrawalTimestamp = int(db.getLastWithdrawalRequestTimestamp())
        pendingWithdrawals = []
        pendingWithdrawalsJSON = json.loads(comm.getWithdrawalRequests(lastwithdrawalTimestamp))
        if(int(pendingWithdrawalsJSON['error_code']) == 0):
            for pendingWithdrawalJSON in pendingWithdrawalsJSON['withdrawal_requests']:
                withdrawal = DatabaseInterface.PendingWithdrawal().fromWithdrawalRequestAPIJson(pendingWithdrawalJSON)
                pendingWithdrawals.append(withdrawal)

        for pendingWithdrawal in pendingWithdrawals:
            db.insertPendingWithdrawal(pendingWithdrawal)

            #withdrawalTransactionOutputs.append(TransactionOutput(pendingWithdrawal.destination_address, (pendingWithdrawal.amount)/SATOSHI_PER_BITCOIN))
            if(pendingWithdrawal.withdrawal_requested_timestamp > lastwithdrawalTimestamp):
                lastwithdrawalTimestamp = pendingWithdrawal.withdrawal_requested_timestamp
            print('New withdrawal recieved. address: ' + pendingWithdrawal.destination_address + ' amount: ' + str(pendingWithdrawal.amount))
        db.setLastWithdrawalTimestamp(lastwithdrawalTimestamp)

        withdrawalTransactionOutputs = {}
        pendingWithdrawals = db.getPendingWithdrawals()
        print('Fetched ' + str(len(pendingWithdrawals)) + ' pending withdrawals from db')
        for pendingWithdrawal in pendingWithdrawals:
            withdrawalTransactionOutputs[pendingWithdrawal.withdrawal_id] = pendingWithdrawal


        pendingConfirmedDepositTransactions = db.getPendingConfirmedDepositTransactions()
        for trx in []:#pendingConfirmedTransactions:
            depositResponseJSON = json.loads(comm.sendConfirmDeposit(trx))
            if(depositResponseJSON['error_code'] == 0):
                db.updateConfirmedTransaction(trx.transaction_id, trx.transaction_vout, DatabaseInterface.ConfirmedTransaction.LAYER2_STATUS_CONFIRMED)
                print('Deposit confirmed. transaction_id:' + trx.transaction_id + ' ' + str(trx.transaction_vout) + ' address: ' + trx.address)

        if(len(pendingConfirmedDepositTransactions)):
            pendingConfirmedDepositResponseJSON = json.loads(comm.sendConfirmDeposit(pendingConfirmedDepositTransactions))
            response = json.loads(json.dumps(pendingConfirmedDepositResponseJSON), object_hook=lambda d: SimpleNamespace(**d))
            if(response.error_code == 0):
                for trx in response.transactions:
                    error_code = trx.error_code
                    layer1_transaction_id = trx.layer1_transaction_id
                    layer1_transaction_vout = trx.layer1_transaction_vout
                    if(Layer2Interface.SuccessOrDuplicateErrorCode(error_code)):
                        db.updateConfirmedTransaction(layer1_transaction_id, layer1_transaction_vout, DatabaseInterface.ConfirmedTransaction.LAYER2_STATUS_CONFIRMED)
                        print('Deposit confirmed. transaction_id:' + layer1_transaction_id + ' ' + str(layer1_transaction_vout))

        pendingConfirmedWithdrawalTransactions = db.getPendingConfirmedWithdrawalTransactions()
        for trx in []:#pendingConfirmedWithdrawalTransactions:
            withdrawalConfirmedResponseJSON = json.loads(comm.sendConfirmWithdrawal(pendingConfirmedWithdrawalTransactions))
            if(withdrawalConfirmedResponseJSON['error_code'] == 0):
                db.updateConfirmedTransaction(trx.transaction_id, trx.transaction_vout, DatabaseInterface.ConfirmedTransaction.LAYER2_STATUS_CONFIRMED) # withdrawals have vout set to 0 (for now)

        if(len(pendingConfirmedWithdrawalTransactions)):
            withdrawalConfirmedResponseJSON = json.loads(comm.sendConfirmWithdrawal(pendingConfirmedWithdrawalTransactions))
            response = json.loads(json.dumps(withdrawalConfirmedResponseJSON), object_hook=lambda d: SimpleNamespace(**d))
            if(response.error_code == 0):
                for trx in response.transactions:
                    error_code = trx.error_code
                    layer1_transaction_id = trx.layer1_transaction_id
                    layer1_transaction_vout = trx.layer1_transaction_vout
                    if(Layer2Interface.SuccessOrDuplicateErrorCode(error_code)):
                        db.updateConfirmedTransaction(layer1_transaction_id, layer1_transaction_vout, DatabaseInterface.ConfirmedTransaction.LAYER2_STATUS_CONFIRMED)


        lastBroadcastBlockHeight = db.getLastBroadcastBlockHeight()
        broadcastTransactionBlockDelay = db.getBroadcastTransactionBlockDelay()
        targetBroadcastBlockheight = lastBroadcastBlockHeight + broadcastTransactionBlockDelay
        print("lastBroadcastBlockHeight: " + str(lastBroadcastBlockHeight))
        print("broadcastTransactionBlockDelay: " + str(broadcastTransactionBlockDelay))
        print("targetBroadcastBlockheight: " + str(targetBroadcastBlockheight))
        if(len(withdrawalTransactionOutputs)):
            if(blockheight >= (targetBroadcastBlockheight)):
                print("Broadcasting " +  str(len(withdrawalTransactionOutputs)) + " withdrawal outputs")
                withdrawalTrxId = nh.broadcastTransaction(withdrawalTransactionOutputs)
                if(withdrawalTrxId):
                    for key, withdrawalOutput in withdrawalTransactionOutputs.items():
                        withdrawalOutput.status = DatabaseInterface.PendingWithdrawal.LAYER1_STATUS_BROADCASTED
                        db.updatePendingWithdrawal(withdrawalOutput.withdrawal_id, withdrawalOutput.status, withdrawalTrxId, 0)
                    withdrawalOutputs = nh.getTransaction(withdrawalTrxId)
                    withdrawalBroadcastedTransactions = []
                    for key, withdrawalOutput in withdrawalTransactionOutputs.items(): # do db writes and layer2 updates in seperate loops
                        output = withdrawalOutputs[withdrawalOutput.destination_address]
                        withdrawalBroadcastedTransactions.append(Layer2Interface.Layer2Interface.WithdrawalBroadcastedTransaction(layer1_transaction_id = withdrawalTrxId, layer1_transaction_vout = output.transaction_vout, layer1_address=withdrawalOutput.destination_address, amount = int(output.amount*SATOSHI_PER_BITCOIN), layer2_withdrawal_id = withdrawalOutput.withdrawal_id, signature = ''))
                        #comm.sendWithdrawalBroadcasted(withdrawalTrxId, output.transaction_vout, withdrawalOutput.destination_address, int(output.amount*SATOSHI_PER_BITCOIN), withdrawalOutput.withdrawal_id)
                        comm.sendWithdrawalBroadcasted(withdrawalBroadcastedTransactions)
                db.setLastBroadcastBlockHeight(blockheight)
            else:
                print('Batching: waiting for blockheight ' + str(targetBroadcastBlockheight) + ' to broadcast batched transaction. Current blockheight: ' + str(blockheight))
        else:
            print("No withdrawals to broadcast")
        # get all withdrawals from DB that needs to be broadcasted, and broadcast them
        # check the full node for any recieved transactions (using listtransactions)
        # if there are any recieved transactions, call the confirmDeposit backend API

        time.sleep(60*1) #sleep 1 mins
    pass

if __name__ == "__main__":
    main()
