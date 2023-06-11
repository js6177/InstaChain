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

SATOSHI_PER_BITCOIN = 100000000
MAX_NUMBER_OF_KEYS_TO_IMPORT_PER_RPC_REQUEST = 1000

CONFIG_FILE_NAME = "config.json"
LOCKFILE_PATH = 'onboardinghelper.lock'

def main():
    if os.path.exists(LOCKFILE_PATH):
        os.remove(LOCKFILE_PATH)
    try:
        oh = OnboardingHelper()
        oh.run()
    except Exception as e:
        print(e)
        print(traceback.format_exc())
        print('Restarting...')



class OnboardingHelper():
    #required config_variables
    database_name: string = None
    rpc_ip: string = None
    rpc_port: string = None
    rpc_user: string = None
    rpc_password: string = None
    wallet_name: string = None

    #optional config variables
    wallet_private_key_seed_mneumonic: string = None
    testnet: bool = True
    layer2_node_url: string = None

    #variables for importing private keys
    import_wallet_privkey_at_startup: bool = False
    wallet_private_key_seed_mneumonic: string = None
    import_wallet_privkey_while_looping: bool = False
    import_wallet_privkey_startup_count: int = 0
    import_wallet_privkey_loop_count: int = 0
    onboarding_signing_private_key: string = None

    def loadConfig(self):
        requiredConfigKeysLoaded = False
        try:
            with open(CONFIG_FILE_NAME) as config_file:
                data = json.load(config_file)
                #these throw exceptions if key is not found
                self.database_name = data["database_name"]
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

        except FileNotFoundError as e:
            print("Fatal Error: " + CONFIG_FILE_NAME + " not found. Exiting.")
        except KeyError as e:
            print("Error: Cound not find key " + str(e) + " in " + CONFIG_FILE_NAME + " , Exiting.")

    def import_private_keys(self, count: int, db, nh):
        number_of_keys_left_to_import = count
        t1 = time.time()
        while(number_of_keys_left_to_import > 0):
            number_of_keys_to_import = min(number_of_keys_left_to_import, MAX_NUMBER_OF_KEYS_TO_IMPORT_PER_RPC_REQUEST)
            privkeyBip32Index = db.getImportPrivkeyBip32Index()
            print("Importing " + str(number_of_keys_to_import) +" private keys starting at index " + str(privkeyBip32Index))
            m = hashlib.sha256()
            m.update(self.wallet_private_key_seed_mneumonic.encode("utf-8"))
            wallet_private_key_seed = m.hexdigest()
            nh.importMultiplePrivkeys(wallet_private_key_seed, privkeyBip32Index, number_of_keys_to_import, True)
            db.setImportPrivkeyBip32Index(privkeyBip32Index + number_of_keys_to_import)
            number_of_keys_left_to_import -= number_of_keys_to_import

            elapsed_time = time.time() - t1

            print("Done importing private keys. Imported " + str(number_of_keys_to_import) + " keys from index " + str(privkeyBip32Index))
            print("Time elapsed: " + str(elapsed_time))

    def run(self):
        termination_called = False
        self.loadConfig()
        parser = argparse.ArgumentParser()
        parser.add_argument('--importprivkeys', dest='importprivkeys', action='store_true', help='Pass this parameter if you need to import private keys to the wallet instead of running the onboarding helper.')
        args = parser.parse_args()

        db = DatabaseInterface.DB(self.database_name)
        db.openOrCreateDB()

        # start bitcoin full node, or attach if it already started
        nh = BitcoinRPC(self.rpc_ip, self.rpc_port, self.rpc_user, self.rpc_password, self.wallet_name, self.testnet)
        comm = Layer2Interface.Layer2Interface(self.layer2_node_url, self.onboarding_signing_private_key)

        nh.loadWallet()

        if(self.import_wallet_privkey_at_startup):
            self.import_private_keys(self.import_wallet_privkey_startup_count, db, nh)
            return

        lastblockhash = db.getLastBlockHash()
        confirmedTransactionsDict = {}
        withdrawalsDict = {}

        pendingConfirmedDepositTransactions = db.getAllPendingConfirmedTransactions()
        for trx in pendingConfirmedDepositTransactions:
            confirmedTransactionsDict[trx.transaction_id] = trx

        pendingWithdrawals = db.getPendingWithdrawals()
        for withdrawal in pendingWithdrawals:
            withdrawalsDict[withdrawal.layer2_withdrawal_id] = withdrawal

        while(not termination_called):
            if(self.import_wallet_privkey_while_looping):
                self.import_private_keys(self.import_wallet_privkey_loop_count, db, nh)

            confirmedTransactions = []
            lastblockhash, confirmedTransactions = nh.getConfirmedTransactions(lastblockhash)

            blockheight = nh.getBlockHeader(lastblockhash)["height"]
            print('Latest blockheight: ' +  str(blockheight))
            for confirmedTransactionJSON in confirmedTransactions:
                if(int(confirmedTransactionJSON["confirmations"]) >= nh.getTargetConfirmations()):
                    trxid = confirmedTransactionJSON["txid"]
                    vout = confirmedTransactionJSON["vout"]
                    category = confirmedTransactionJSON["category"]
                    if((trxid, vout, category) not in confirmedTransactionsDict):
                        confirmedTransaction = DatabaseInterface.ConfirmedTransaction().fromListSinceBlockRpcJson(confirmedTransactionJSON)
                        confirmedTransactionsDict[(trxid, vout, category)] = confirmedTransaction #add in memory
                        db.insertConfirmedTransaction(confirmedTransaction)
            print("lastblockhash: " + lastblockhash)
            db.setLastBlockHash(lastblockhash)

            #get pending withdrawals from the node, and save it to the db
            lastwithdrawalTimestamp = int(db.getLastWithdrawalRequestTimestamp())
            pendingWithdrawals = []
            pendingWithdrawalsJSON = json.loads(comm.getWithdrawalRequests(lastwithdrawalTimestamp))
            if(int(pendingWithdrawalsJSON['error_code']) == 0):
                for pendingWithdrawalJSON in pendingWithdrawalsJSON['withdrawal_requests']:
                    withdrawal = DatabaseInterface.PendingWithdrawal().fromWithdrawalRequestAPIJson(pendingWithdrawalJSON)
                    pendingWithdrawals.append(withdrawal)

            for pendingWithdrawal in pendingWithdrawals:
                db.insertPendingWithdrawal(pendingWithdrawal)

                if(pendingWithdrawal.withdrawal_requested_timestamp > lastwithdrawalTimestamp):
                    lastwithdrawalTimestamp = pendingWithdrawal.withdrawal_requested_timestamp
                print('New withdrawal recieved. address: ' + pendingWithdrawal.destination_address + ' amount: ' + str(pendingWithdrawal.amount))
            db.setLastWithdrawalTimestamp(lastwithdrawalTimestamp)

            withdrawalTransactionOutputs = {}
            pendingWithdrawals = db.getPendingWithdrawals()
            print('Fetched ' + str(len(pendingWithdrawals)) + ' pending withdrawals from db')
            for pendingWithdrawal in pendingWithdrawals:
                withdrawalTransactionOutputs[pendingWithdrawal.layer2_withdrawal_id] = pendingWithdrawal


            pendingConfirmedDepositTransactions = db.getPendingConfirmedDepositTransactions()

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
                            db.updatePendingWithdrawal(withdrawalOutput.layer2_withdrawal_id, withdrawalOutput.status, withdrawalTrxId, 0)
                        withdrawalOutputs = nh.getTransaction(withdrawalTrxId)
                        withdrawalBroadcastedTransactions = []
                        for key, withdrawalOutput in withdrawalTransactionOutputs.items(): # do db writes and layer2 updates in seperate loops
                            output = withdrawalOutputs[withdrawalOutput.destination_address]
                            withdrawalBroadcastedTransactions.append(Layer2Interface.Layer2Interface.WithdrawalBroadcastedTransaction(layer1_transaction_id = withdrawalTrxId, layer1_transaction_vout = output.transaction_vout, layer1_address=withdrawalOutput.destination_address, amount = int(output.amount*SATOSHI_PER_BITCOIN), layer2_withdrawal_id = withdrawalOutput.layer2_withdrawal_id, signature = ''))
                        comm.sendWithdrawalBroadcasted(withdrawalBroadcastedTransactions)
                    db.setLastBroadcastBlockHeight(blockheight)
                else:
                    print('Batching: waiting for blockheight ' + str(targetBroadcastBlockheight) + ' to broadcast batched transaction. Current blockheight: ' + str(blockheight))
            else:
                print("No withdrawals to broadcast")

            time.sleep(60*1) #sleep 1 mins
            if os.path.exists(LOCKFILE_PATH):
                termination_called = True
                print("Termination called through lockfile... ")

        pass

if __name__ == "__main__":
    main()
