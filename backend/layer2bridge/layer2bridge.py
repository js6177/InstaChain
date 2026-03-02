import asyncio
from typing import Dict, List, Any
import requests
import time
import filelock
import os
import json
import random
import string
import datetime
from dataclasses import dataclass
import DatabaseInterface
import AuditDatabaseInterface
import binascii
import traceback
import argparse
import Layer2Interface
from FullNodeInterface import BitcoinRPC
from types import SimpleNamespace
import hashlib
from OnboardingLogger import OnboardingLogger
from config_loader.loader import get_layer2ledgerbridge_config
from config_models.models import Layer2BridgeSettings


SATOSHI_PER_BITCOIN = 100000000

DEFAULT_WORKING_DIRECTORY = os.path.expanduser('~') + "/.IC/Layer2Bridge/"
LOCKFILE_PATH = DEFAULT_WORKING_DIRECTORY + 'Layer2Bridge.lock'

DEFAULT_LAYER2BRIDGE_DB_NAME = "layer2Bridge.sqlite"
DEFAULT_AUDIT_DB_NAME = "audit.sqlite"


async def main():
    if os.path.exists(LOCKFILE_PATH):
        os.remove(LOCKFILE_PATH)
    try:
        oh = Layer2Bridge()
        await oh.run()
    except Exception as e:
        OnboardingLogger(e)
        OnboardingLogger(traceback.format_exc())
        OnboardingLogger('Restarting...')


class Layer2Bridge():
    settings: Layer2BridgeSettings
    database_layer2bridge_full_path: str
    database_audit_full_path: str

    def loadConfig(self):
        self.settings = get_layer2ledgerbridge_config()
        self.database_layer2bridge_full_path = DEFAULT_WORKING_DIRECTORY + self.settings.database_layer2bridge_name
        self.database_audit_full_path = DEFAULT_WORKING_DIRECTORY + (self.settings.database_audit_name or DEFAULT_AUDIT_DB_NAME)

    async def run(self):
        termination_called = False
        self.loadConfig()

        self.layer2BridgeDB = DatabaseInterface.DB(self.database_layer2bridge_full_path)
        self.layer2BridgeDB.openOrCreateDB()

        self.auditDB = AuditDatabaseInterface.AuditDatabaseInterface(self.database_audit_full_path)

        # start bitcoin full node, or attach if it already started
        self.bitcoinRPC = BitcoinRPC(self.settings.rpc_settings, self.settings.wallet_name)
        self.layer2Interface = Layer2Interface.Layer2Interface(self.settings.layer2_node_url, self.settings.onboarding_signing_private_key)

        wallet_loaded = await self.bitcoinRPC.loadWallet()
        if not wallet_loaded.name:
            OnboardingLogger(f"Error: Wallet could not load. {wallet_loaded.warning}")
            return

        self.lastblockhash = self.layer2BridgeDB.getLastBlockHash()
        self.confirmedTransactionsDict = {} #store all confirmed transactions in memory

        pendingConfirmedTransactions = self.layer2BridgeDB.getAllPendingConfirmedTransactions()
        for trx in pendingConfirmedTransactions:
            self.confirmedTransactionsDict[(trx.transaction_id, trx.transaction_vout, trx.category)] = trx


        while(not termination_called):
            await self.getConfirmedTransactionsFromNodeAndSaveToDb()
            self.getPendingWithdrawalsFromLayer2LedgerAndSaveToDb()
            self.getPendingWithdrawalsFromDb()
            self.sendPendingConfirmedDepositsToLayer2Ledger()
            self.sendPendingConfirmedWithdrawalsToLayer2Ledger()
            await self.broadcastPendingWithdrawals()
            await self.updateAuditDB()

            await asyncio.sleep(60*1) #sleep 1 mins
            if os.path.exists(LOCKFILE_PATH):
                termination_called = True
                OnboardingLogger("Termination called through lockfile... ")

    async def getConfirmedTransactionsFromNodeAndSaveToDb(self):
        #get confirmed transactions from the node and save it to the db
        try:
            confirmedTransactionsResponse = await self.bitcoinRPC.getConfirmedTransactions(self.lastblockhash)
        except Exception as e:
            OnboardingLogger(f"Error: Could not get confirmed transactions from node. {e}")
            return

        self.lastblockhash = confirmedTransactionsResponse.lastblock
        
        try:
            getBlockHeaderResponse = await self.bitcoinRPC.getBlockHeader(self.lastblockhash)
            self.blockheight = getBlockHeaderResponse.height
        except Exception as e:
            OnboardingLogger(f"Error: Could not get block header from node. {e}")
            return

        OnboardingLogger('Latest blockheight: ' +  str(self.blockheight))
        for confirmedTransaction in confirmedTransactionsResponse.transactions:
            if confirmedTransaction.confirmations >= self.bitcoinRPC.getTargetConfirmations():
                if (confirmedTransaction.txid, confirmedTransaction.vout, confirmedTransaction.category) not in self.confirmedTransactionsDict:
                    confirmedTransactionDbObject = DatabaseInterface.ConfirmedTransaction().fromBitcoinRpcListSinceBlockTransactions(confirmedTransaction)
                    self.confirmedTransactionsDict[(confirmedTransaction.txid, confirmedTransaction.vout, confirmedTransaction.category)] = confirmedTransactionDbObject #add in memory
                    self.layer2BridgeDB.insertConfirmedTransaction(confirmedTransactionDbObject)
        OnboardingLogger("lastblockhash: " + self.lastblockhash)
        self.layer2BridgeDB.setLastBlockHash(self.lastblockhash)

    def getPendingWithdrawalsFromLayer2LedgerAndSaveToDb(self):
        #get pending withdrawals from the Layer2Ledger, and save it to the db
        lastwithdrawalTimestamp = int(self.layer2BridgeDB.getLastWithdrawalRequestTimestamp())
        pendingWithdrawals = []
        pendingWithdrawalsJSON = json.loads(self.layer2Interface.getWithdrawalRequests(lastwithdrawalTimestamp))
        if(int(pendingWithdrawalsJSON['error_code']) == 0):
            for pendingWithdrawalJSON in pendingWithdrawalsJSON['withdrawal_requests']:
                withdrawal = DatabaseInterface.PendingWithdrawal().fromWithdrawalRequestAPIJson(pendingWithdrawalJSON)
                pendingWithdrawals.append(withdrawal)

        for pendingWithdrawal in pendingWithdrawals:
            self.layer2BridgeDB.insertPendingWithdrawal(pendingWithdrawal)

            if(pendingWithdrawal.withdrawal_requested_timestamp > lastwithdrawalTimestamp):
                lastwithdrawalTimestamp = pendingWithdrawal.withdrawal_requested_timestamp
            OnboardingLogger('New withdrawal recieved. address: ' + pendingWithdrawal.destination_address + ' amount: ' + str(pendingWithdrawal.amount))
        self.layer2BridgeDB.setLastWithdrawalTimestamp(lastwithdrawalTimestamp)
    
    def getPendingWithdrawalsFromDb(self) -> None:
        #get pending withdrawals from the db and prepare it to be broadcasted by the node
        self.withdrawalTransactionOutputs: Dict[str, DatabaseInterface.PendingWithdrawal] = {}
        pendingWithdrawals = self.layer2BridgeDB.getPendingWithdrawals()
        OnboardingLogger('Fetched ' + str(len(pendingWithdrawals)) + ' pending withdrawals from db')
        for pendingWithdrawal in pendingWithdrawals:
            #only broadcast if the minimum amount is greater than the minimum withdrawal amount
            minWithdrawalAmount = self.bitcoinRPC.getMinimumTransactionAmount()
            if(pendingWithdrawal.amount >= minWithdrawalAmount):
                self.withdrawalTransactionOutputs[pendingWithdrawal.layer2_withdrawal_id] = pendingWithdrawal
            else:
                OnboardingLogger(f"Skipping withdrawal {pendingWithdrawal.layer2_withdrawal_id} with amount {pendingWithdrawal.amount} because it is less than the minimum withdrawal amount of {minWithdrawalAmount} satoshis")

    def sendPendingConfirmedDepositsToLayer2Ledger(self):
        #Send pending confirmed deposit transactions to the Layer2Ledger
        pendingConfirmedDepositTransactions = self.layer2BridgeDB.getPendingConfirmedDepositTransactions()
        
        if(len(pendingConfirmedDepositTransactions)):
            pendingConfirmedDepositResponseJSON = json.loads(self.layer2Interface.sendConfirmDeposit(pendingConfirmedDepositTransactions))
            response = json.loads(json.dumps(pendingConfirmedDepositResponseJSON), object_hook=lambda d: SimpleNamespace(**d))
            if(response.error_code == 0):
                for trx in response.transactions:
                    error_code = trx.error_code
                    layer1_transaction_id = trx.layer1_transaction_id
                    layer1_transaction_vout = trx.layer1_transaction_vout
                    if(Layer2Interface.SuccessOrDuplicateErrorCode(error_code)):
                        self.layer2BridgeDB.updateConfirmedTransaction(layer1_transaction_id, layer1_transaction_vout, DatabaseInterface.ConfirmedTransaction.CATEGORY_RECIEVE, DatabaseInterface.ConfirmedTransaction.LAYER2_STATUS_CONFIRMED)
                        OnboardingLogger('Deposit confirmed. transaction_id:' + layer1_transaction_id + ' ' + str(layer1_transaction_vout))


    def sendPendingConfirmedWithdrawalsToLayer2Ledger(self):
        #Send pending confirmed withdrawal transactions to the Layer2Ledger
        pendingConfirmedWithdrawalTransactions = self.layer2BridgeDB.getPendingConfirmedWithdrawalTransactions()

        if(len(pendingConfirmedWithdrawalTransactions)):
            withdrawalConfirmedResponseJSON = json.loads(self.layer2Interface.sendConfirmWithdrawal(pendingConfirmedWithdrawalTransactions))
            response = json.loads(json.dumps(withdrawalConfirmedResponseJSON), object_hook=lambda d: SimpleNamespace(**d))
            if(response.error_code == 0):
                for trx in response.transactions:
                    error_code = trx.error_code
                    layer1_transaction_id = trx.layer1_transaction_id
                    layer1_transaction_vout = trx.layer1_transaction_vout
                    if(Layer2Interface.SuccessOrDuplicateErrorCode(error_code)):
                        self.layer2BridgeDB.updateConfirmedTransaction(layer1_transaction_id, layer1_transaction_vout, DatabaseInterface.ConfirmedTransaction.CATEGORY_SEND, DatabaseInterface.ConfirmedTransaction.LAYER2_STATUS_CONFIRMED)
                        OnboardingLogger('Withdrawal confirmed. transaction_id:' + layer1_transaction_id + ' ' + str(layer1_transaction_vout))


    async def broadcastPendingWithdrawals(self):
        #Broadcast withdrawal transactions
        lastBroadcastBlockHeight = self.layer2BridgeDB.getLastBroadcastBlockHeight()
        broadcastTransactionBlockDelay = self.layer2BridgeDB.getBroadcastTransactionBlockDelay()
        targetBroadcastBlockheight = lastBroadcastBlockHeight + broadcastTransactionBlockDelay
        OnboardingLogger("lastBroadcastBlockHeight: " + str(lastBroadcastBlockHeight))
        OnboardingLogger("broadcastTransactionBlockDelay: " + str(broadcastTransactionBlockDelay))
        OnboardingLogger("targetBroadcastBlockheight: " + str(targetBroadcastBlockheight))
        if(len(self.withdrawalTransactionOutputs)):
            if self.blockheight >= targetBroadcastBlockheight:
                OnboardingLogger("Broadcasting " +  str(len(self.withdrawalTransactionOutputs)) + " withdrawal outputs")
                try:
                    withdrawalTrxId = await self.bitcoinRPC.broadcastTransaction(self.withdrawalTransactionOutputs)
                    for key, withdrawalOutput in self.withdrawalTransactionOutputs.items():
                        withdrawalOutput.status = DatabaseInterface.PendingWithdrawal.LAYER1_STATUS_BROADCASTED
                        self.layer2BridgeDB.updatePendingWithdrawal(withdrawalOutput.layer2_withdrawal_id, withdrawalOutput.status, withdrawalTrxId, 0)
                    
                    bitcoinRpcGetTransactionResponse = await self.bitcoinRPC.getTransaction(withdrawalTrxId)
                    withdrawalOutputs = DatabaseInterface.ConfirmedTransaction.fromBitcoinRpcGetTransactionResponse(bitcoinRpcGetTransactionResponse)
                    
                    withdrawalBroadcastedTransactions = []
                    for key, withdrawalOutput in self.withdrawalTransactionOutputs.items(): # do db writes and layer2 updates in seperate loops
                        output = withdrawalOutputs[withdrawalOutput.destination_address]
                        withdrawalBroadcastedTransactions.append(Layer2Interface.Layer2Interface.WithdrawalBroadcastedTransaction(layer1_transaction_id = withdrawalTrxId, layer1_transaction_vout = output.transaction_vout, layer1_address=withdrawalOutput.destination_address, amount = output.amount, layer2_withdrawal_id = withdrawalOutput.layer2_withdrawal_id, signature = ''))
                    self.layer2Interface.sendWithdrawalBroadcasted(withdrawalBroadcastedTransactions)
                    self.layer2BridgeDB.setLastBroadcastBlockHeight(self.blockheight)
                except Exception as e:
                    OnboardingLogger(f"Error broadcasting/processing withdrawals: {e}")
            else:
                OnboardingLogger('Batching: waiting for blockheight ' + str(targetBroadcastBlockheight) + ' to broadcast batched transaction. Current blockheight: ' + str(self.blockheight))
        else:
            OnboardingLogger("No withdrawals to broadcast")

    async def updateAuditDB(self):
        #update the auditDB if there is new blockheight
        if(self.blockheight > self.auditDB.getLastAuditBlockHeight()):
            try:
                addressGroupings = await self.bitcoinRPC.getAddressGroupings()
                usedLayer1Addresses: List[AuditDatabaseInterface.AuditLayer1Address] = []
                for addressGrouping in addressGroupings:
                    for address in addressGrouping:
                        usedLayer1Addresses.append(AuditDatabaseInterface.AuditLayer1Address.fromBitcoinRpcListAddressGroupingsAddress(address))
                self.auditDB.addOrUpdateLayer1Addresses(usedLayer1Addresses, self.blockheight, True)

                #get all the layer1 addresses from the auditDB and send it to the node
                layer1Addresses = self.auditDB.getLayer1Addresses()
                layer1AddressesBalance = 0
                for layer1Address in layer1Addresses:
                    layer1AddressesBalance += layer1Address.balance
                self.layer2Interface.postLayer1AuditReport(self.blockheight, layer1AddressesBalance, layer1Addresses)
            except Exception as e:
                OnboardingLogger(f"Error updating audit DB: {e}")

if __name__ == "__main__":
    asyncio.run(main())
