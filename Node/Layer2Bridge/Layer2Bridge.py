from typing import Dict, List
import requests
import time
import filelock
import os
import json
import random
import string
import datetime
from dataclasses import dataclass
from BitcoinRPCResponses.ListSinceBlockResponse import BitcoinRpcListSinceBlockResponse
from BitcoinRPCResponses.LoadWalletResponse import BitcoinRpcLoadWalletResponse
import DatabaseInterface
import AuditDatabaseInterface
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
import hashlib
from OnboardingLogger import OnboardingLogger


SATOSHI_PER_BITCOIN = 100000000
MAX_NUMBER_OF_KEYS_TO_IMPORT_PER_RPC_REQUEST = 1000

DEFAULT_WORKING_DIRECTORY = os.path.expanduser('~') + "/.Layer2Bridge/"
CONFIG_FILE_PATH = DEFAULT_WORKING_DIRECTORY + "config.json"
LOCKFILE_PATH = DEFAULT_WORKING_DIRECTORY + 'Layer2Bridge.lock'

DEFAULT_LAYER2BRIDGE_DB_NAME = "layer2Bridge.sqlite"
DEFAULT_AUDIT_DB_NAME = "audit.sqlite"


def main():
    if os.path.exists(LOCKFILE_PATH):
        os.remove(LOCKFILE_PATH)
    try:
        oh = Layer2Bridge()
        oh.run()
    except Exception as e:
        OnboardingLogger(e)
        OnboardingLogger(traceback.format_exc())
        OnboardingLogger('Restarting...')



class Layer2Bridge():
    #required config_variables
    database_layer2bridge_name: string = DEFAULT_LAYER2BRIDGE_DB_NAME
    rpc_ip: string = None
    rpc_port: string = None
    rpc_user: string = None
    rpc_password: string = None
    wallet_name: string = None

    #optional config variables
    wallet_private_key_seed_mneumonic: string = None
    testnet: bool = True
    layer2_node_url: string = None
    enable_batching: bool = False
    
    #variables for importing private keys
    import_wallet_privkey_at_startup: bool = False
    wallet_private_key_seed_mneumonic: string = None
    import_wallet_privkey_while_looping: bool = False
    import_wallet_privkey_startup_count: int = 0
    import_wallet_privkey_loop_count: int = 0
    onboarding_signing_private_key: string = None

    #database names
    database_audit_name: string = DEFAULT_AUDIT_DB_NAME

    def loadConfig(self):
        requiredConfigKeysLoaded = False
        try:
            with open(CONFIG_FILE_PATH) as config_file:
                data = json.load(config_file)
                #these throw exceptions if key is not found
                self.database_layer2bridge_name = data["database_layer2bridge_name"]
                #self.database_layer2bridge_name = data.get("database_layer2bridge_name") or DEFAULT_LAYER2BRIDGE_DB_NAME

                self.rpc_ip = data["rpc_ip"]
                self.rpc_port = data["rpc_port"]
                self.rpc_user = data["rpc_user"]
                self.rpc_password = data["rpc_password"]
                self.wallet_name = data["wallet_name"]
                self.layer2_node_url = data["layer2_node_url"]
                self.onboarding_signing_private_key = data["onboarding_signing_private_key"]

                #thse don't throw exceptions if key is notfound, instead they assign null
                self.import_wallet_privkey_at_startup = data.get("import_wallet_privkey_at_startup")
                self.wallet_private_key_seed_mneumonic = data.get("wallet_private_key_seed_mneumonic")
                self.import_wallet_privkey_while_looping = data.get("import_wallet_privkey_while_looping")
                self.import_wallet_privkey_startup_count = data.get("import_wallet_privkey_startup_count")
                self.import_wallet_privkey_loop_count = data.get("import_wallet_privkey_loop_count")
                self.database_audit_name = data.get("database_audit_name") or DEFAULT_AUDIT_DB_NAME

        except FileNotFoundError as e:
            OnboardingLogger("Fatal Error: " + CONFIG_FILE_PATH + " not found. Exiting.")
            exit(1)
        except KeyError as e:
            OnboardingLogger("Error: Cound not find key " + str(e) + " in " + CONFIG_FILE_PATH + " , Exiting.")
            exit(1)

    def import_private_keys(self, count: int, db, nh):
        number_of_keys_left_to_import = count
        t1 = time.time()
        while(number_of_keys_left_to_import > 0):
            number_of_keys_to_import = min(number_of_keys_left_to_import, MAX_NUMBER_OF_KEYS_TO_IMPORT_PER_RPC_REQUEST)
            privkeyBip32Index = db.getImportPrivkeyBip32Index()
            OnboardingLogger("Importing " + str(number_of_keys_to_import) +" private keys starting at index " + str(privkeyBip32Index))
            m = hashlib.sha256()
            m.update(self.wallet_private_key_seed_mneumonic.encode("utf-8"))
            wallet_private_key_seed = m.hexdigest()
            nh.importMultiplePrivkeys(wallet_private_key_seed, privkeyBip32Index, number_of_keys_to_import, True)
            db.setImportPrivkeyBip32Index(privkeyBip32Index + number_of_keys_to_import)
            number_of_keys_left_to_import -= number_of_keys_to_import

            elapsed_time = time.time() - t1

            OnboardingLogger("Done importing private keys. Imported " + str(number_of_keys_to_import) + " keys from index " + str(privkeyBip32Index))
            OnboardingLogger("Time elapsed: " + str(elapsed_time))

    def run(self):
        termination_called = False
        self.loadConfig()

        self.layer2BridgeDB = DatabaseInterface.DB(self.database_layer2bridge_name)
        self.layer2BridgeDB.openOrCreateDB()

        self.auditDB = AuditDatabaseInterface.AuditDatabaseInterface(self.database_audit_name)

        # start bitcoin full node, or attach if it already started
        self.bitcoinRPC = BitcoinRPC(self.rpc_ip, self.rpc_port, self.rpc_user, self.rpc_password, self.wallet_name, self.testnet)
        self.layer2Interface = Layer2Interface.Layer2Interface(self.layer2_node_url, self.onboarding_signing_private_key)

        wallet_loaded: BitcoinRpcLoadWalletResponse = self.bitcoinRPC.loadWallet()
        if(not wallet_loaded.success):
            OnboardingLogger(f"Error: Wallet could not load. {str(wallet_loaded.exception)}")
            return

        if(self.import_wallet_privkey_at_startup):
            self.import_private_keys(self.import_wallet_privkey_startup_count, self.layer2BridgeDB, self.bitcoinRPC)
            return

        self.lastblockhash = self.layer2BridgeDB.getLastBlockHash()
        self.confirmedTransactionsDict = {} #store all confirmed transactions in memory

        pendingConfirmedTransactions = self.layer2BridgeDB.getAllPendingConfirmedTransactions()
        for trx in pendingConfirmedTransactions:
            self.confirmedTransactionsDict[trx.transaction_id] = trx


        while(not termination_called):
            if(self.import_wallet_privkey_while_looping):
                self.import_private_keys(self.import_wallet_privkey_loop_count, self.layer2BridgeDB, self.bitcoinRPC)

            self.getConfirmedTransactionsFromNodeAndSaveToDb()
            self.getPendingWithdrawalsFromLayer2LedgerAndSaveToDb()
            self.getPendingWithdrawalsFromDb()
            self.sendPendingConfirmedDepositsToLayer2Ledger()
            self.sendPendingConfirmedWithdrawalsToLayer2Ledger()
            self.broadcastPendingWithdrawals()
            self.updateAuditDB()

            time.sleep(60*1) #sleep 1 mins
            if os.path.exists(LOCKFILE_PATH):
                termination_called = True
                OnboardingLogger("Termination called through lockfile... ")

        pass

    def getConfirmedTransactionsFromNodeAndSaveToDb(self):
        #get confirmed transactions from the node and save it to the db
        confirmedTransactionsResponse: BitcoinRpcListSinceBlockResponse = self.bitcoinRPC.getConfirmedTransactions(self.lastblockhash)
        if(not confirmedTransactionsResponse.success):
            OnboardingLogger(f"Error: Could not get confirmed transactions from node. {str(confirmedTransactionsResponse.exception)}")
            return
        self.lastblockhash = confirmedTransactionsResponse.lastblock
        getBlockHeaderResponse = self.bitcoinRPC.getBlockHeader(self.lastblockhash)
        if(not getBlockHeaderResponse.success):
            OnboardingLogger(f"Error: Could not get block header from node. {str(getBlockHeaderResponse.exception)}")
            return
        self.blockheight = getBlockHeaderResponse.height

        OnboardingLogger('Latest blockheight: ' +  str(self.blockheight))
        for confirmedTransaction in confirmedTransactionsResponse.transactions:
            if(confirmedTransaction.confirmations >= self.bitcoinRPC.getTargetConfirmations()):
                if((confirmedTransaction.txid, confirmedTransaction.vout, confirmedTransaction.category) not in self.confirmedTransactionsDict):
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


    def broadcastPendingWithdrawals(self):
        #Broadcast withdrawal transactions
        lastBroadcastBlockHeight = self.layer2BridgeDB.getLastBroadcastBlockHeight()
        broadcastTransactionBlockDelay = self.layer2BridgeDB.getBroadcastTransactionBlockDelay()
        targetBroadcastBlockheight = lastBroadcastBlockHeight + broadcastTransactionBlockDelay
        OnboardingLogger("lastBroadcastBlockHeight: " + str(lastBroadcastBlockHeight))
        OnboardingLogger("broadcastTransactionBlockDelay: " + str(broadcastTransactionBlockDelay))
        OnboardingLogger("targetBroadcastBlockheight: " + str(targetBroadcastBlockheight))
        if(len(self.withdrawalTransactionOutputs)):
            if((not self.enable_batching) or (self.blockheight >= (targetBroadcastBlockheight))):
                OnboardingLogger("Broadcasting " +  str(len(self.withdrawalTransactionOutputs)) + " withdrawal outputs")
                broadcastedTransaction = self.bitcoinRPC.broadcastTransaction(self.withdrawalTransactionOutputs)
                withdrawalTrxId = broadcastedTransaction.transaction_id
                if(broadcastedTransaction.success):
                    for key, withdrawalOutput in self.withdrawalTransactionOutputs.items():
                        withdrawalOutput.status = DatabaseInterface.PendingWithdrawal.LAYER1_STATUS_BROADCASTED
                        self.layer2BridgeDB.updatePendingWithdrawal(withdrawalOutput.layer2_withdrawal_id, withdrawalOutput.status, withdrawalTrxId, 0)
                    bitcoinRpcGetTransactionResponse = self.bitcoinRPC.getTransaction(withdrawalTrxId)
                    if(bitcoinRpcGetTransactionResponse.success):
                        withdrawalOutputs = DatabaseInterface.ConfirmedTransaction.fromBitcoinRpcGetTransactionResponse(bitcoinRpcGetTransactionResponse)
                        
                        withdrawalBroadcastedTransactions = []
                        for key, withdrawalOutput in self.withdrawalTransactionOutputs.items(): # do db writes and layer2 updates in seperate loops
                            output = withdrawalOutputs[withdrawalOutput.destination_address]
                            withdrawalBroadcastedTransactions.append(Layer2Interface.Layer2Interface.WithdrawalBroadcastedTransaction(layer1_transaction_id = withdrawalTrxId, layer1_transaction_vout = output.transaction_vout, layer1_address=withdrawalOutput.destination_address, amount = output.amount, layer2_withdrawal_id = withdrawalOutput.layer2_withdrawal_id, signature = ''))
                        self.layer2Interface.sendWithdrawalBroadcasted(withdrawalBroadcastedTransactions)
                    else:
                        OnboardingLogger("Error: Could not get broadcasted transaction from node. " + str(withdrawalOutputs.exception))
                    self.layer2BridgeDB.setLastBroadcastBlockHeight(self.blockheight)
                else:
                    OnboardingLogger("Error: Could not broadcast transaction. " + str(broadcastedTransaction.exception))
            else:
                OnboardingLogger('Batching: waiting for blockheight ' + str(targetBroadcastBlockheight) + ' to broadcast batched transaction. Current blockheight: ' + str(self.blockheight))
        else:
            OnboardingLogger("No withdrawals to broadcast")

    def updateAuditDB(self):
        #update the auditDB if there is new blockheight
        if(self.blockheight > self.auditDB.getLastAuditBlockHeight()):
            addressGroupingsResponse = self.bitcoinRPC.getAddressGroupings()
            if(addressGroupingsResponse.success):
                usedLayer1Addresses: List[AuditDatabaseInterface.AuditLayer1Address] = []
                for addressGrouping in addressGroupingsResponse.address_groupings:
                    for address in addressGrouping:
                        usedLayer1Addresses.append(AuditDatabaseInterface.AuditLayer1Address.fromBitcoinRpcListAddressGroupingsAddress(address))
                self.auditDB.addOrUpdateLayer1Addresses(usedLayer1Addresses, self.blockheight, True)

                #get all the layer1 addresses from the auditDB and send it to the node
                layer1Addresses = self.auditDB.getLayer1Addresses()
                layer1AddressesBalance = 0
                for layer1Address in layer1Addresses:
                    layer1AddressesBalance += layer1Address.balance
                self.layer2Interface.postLayer1AuditReport(self.blockheight, layer1AddressesBalance, layer1Addresses)

if __name__ == "__main__":
    main()
