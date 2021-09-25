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


TESTNET = True
WALLET_NAME = "wallet"
BITCOIN_CLI_PATH = 'C:\\Program Files\\Bitcoin\\daemon\\bitcoin-cli.exe '
TESTNET_TARGETCONFIRMATIONS = 3
MAINNET_TARGETCONFIRMATIONS = 6

SATOSHI_PER_BITCOIN = 100000000
BITCOIN_DECIMAL_PLACES = 8

HOSTNAME = 'https://blitz-v1.appspot.com/'

@dataclass
class TransactionOutput:
    toAddress: string
    amount: int

class Communication:
    def getWithdrawalRequests(self, lastwithdrawalTimestamp):
        url = HOSTNAME + 'getWithdrawalRequests'
        data = {'latest_timestamp': lastwithdrawalTimestamp}
        r = requests.get(url, params=data)
        print(r.text)
        return r.text

    def ackWithdrawalRequests(self, guids):
        url = HOSTNAME + 'ackWithdrawalRequests'
        data = {'guids': guids}
        r = requests.post(url, params=data)
        print(r.text)
        return r.text

    def confirmDeposit(self, nonce, layer1_transaction_id, amount, layer1_address, signature):
        url = HOSTNAME + 'depositFunds'
        data = {'nonce': nonce,
                'layer1_transaction_id': layer1_transaction_id,
                'amount': amount,
                'layer1_address': layer1_address,
                'signature': signature}
        r = requests.post(url, params=data)
        print(r.text)
        return r.text

    #TODO: do later
    def confirmWithdrawal(self, withdrawal_id, public_key, signature):
        return
        url = HOSTNAME + 'withdrawalConfirmed'
        data = {'public_key': public_key,
                'withdrawal_id': withdrawal_id,
                'signature': signature}
        r = requests.post(url, params=data)
        print(r.text)
        return r.text

    def sendConfirmDeposit(self, transaction: DatabaseInterface.ConfirmedTransaction):
        nonce = ''.join(random.choice(string.ascii_letters) for i in range(16)) #layer2_transaction_id
        signature = SigningAddress.signDepositConfirmedMessage(transaction.transaction_id, nonce, transaction.amount)
        return self.confirmDeposit(nonce, transaction.transaction_id, transaction.amount, transaction.address, signature)


class NodeHelperRPC:
    rpc_ip = "127.0.0.1"
    rpc_user = "bitcoin"
    rpc_password = "R4tB_*5cJK!7p9"
    rpc_port = "8332"

    rpc_connection : AuthServiceProxy = None

    def __init__(self, *args, **kwargs):
        self.rpc_connection = AuthServiceProxy("http://%s:%s@%s:%s"%(self.rpc_user, self.rpc_password, self.rpc_ip, self.rpc_port))
        return super().__init__(*args, **kwargs)

    def getTargetConfirmations(self):
        if(TESTNET):
            return TESTNET_TARGETCONFIRMATIONS
        else:
            return MAINNET_TARGETCONFIRMATIONS

    def getTestnetCommandParam(self):
        if(TESTNET):
            return " -testnet "
        return ""

    def loadWallet(self, wallet = WALLET_NAME):
        try:
            satus = self.rpc_connection.loadwallet(wallet)
        except Exception as e:
            print(e)
        return
        command = '"' + BITCOIN_CLI_PATH + '"' + self.getTestnetCommandParam() + " loadwallet " + wallet
        loadWalletJSON = os.popen(command).read()

    def importMultiplePrivkeys(self):
        seed_bytes = binascii.unhexlify(b"6eb00bbddcf069084889a8ab4155569165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4")
        pubkey_version = Bip32Conf.KEY_NET_VER.Test()
        privkey_version = BitcoinConf.WIF_NET_VER.Test()
        master_bip32_ctx = Bip32.FromSeed(seed_bytes, pubkey_version)
        print("Master Private key: " + master_bip32_ctx.PrivateKey().ToExtended())
        wif = WifEncoder.Encode(master_bip32_ctx.PrivateKey().Raw().ToBytes(), True, privkey_version)
        #print("Master Private key WIF: " + wif)
        descriptors = []
        master_pubkey = master_bip32_ctx.PublicKey().ToExtended()
        print("Master Public key: " + master_pubkey)
        j = 6
        for i in range(0,10):
            #print("\n")
            bip32_ctx = master_bip32_ctx.ChildKey(44) \
                                .ChildKey(1) \
                                .ChildKey(j)                         \
                                .ChildKey(i)
            # Print keys in extended format
            #print("Extended privkey: " + bip32_ctx.PrivateKey().ToExtended())
            #print("Extended pubkey: " + bip32_ctx.PublicKey().ToExtended())
            wif = WifEncoder.Encode(bip32_ctx.PrivateKey().Raw().ToBytes(), True, privkey_version)
            #print("WIF: " + wif)

            bip32_ctx = Bip32.FromExtendedKey(master_pubkey, pubkey_version)
            bip32_ctx = bip32_ctx.ChildKey(44) \
                                .ChildKey(1) \
                                .ChildKey(j)                         \
                                .ChildKey(i)

            #print("Extended pubkey: " + bip32_ctx.PublicKey().ToExtended())
            descriptor = "pkh(" + master_pubkey + "/44/1/" + str(j) + "/" + str(i) + ")"
            descriptor_checksum = checksum.AddChecksum(descriptor) #see getdescriptorinfo
            #print(descriptor_checksum)
            pubkey_bytes = bip32_ctx.PublicKey().RawCompressed().ToBytes()
            address = P2PKH.ToAddress(pubkey_bytes, BitcoinConf.P2PKH_NET_VER.Test())
            #print(address)
            #importmultiCmd = '[{ "desc" : "' + descriptor_checksum + '","timestamp": "now", "keys": [ "' + wif + '" ] } ]' '{"rescan": false}'
            importmultiCmd = {'desc': descriptor_checksum, "timestamp": "now", "keys": [wif] }
            descriptors.append(importmultiCmd)
            print("address: " + address)

        #print(json.dumps(descriptors))
        command = 'bitcoin-cli.exe ' + self.getTestnetCommandParam() + " -rpcwallet=" + WALLET_NAME + " importmulti '" + json.dumps(descriptors) + "' " + '\'{"rescan": false}\''
        print("command: " + command)
        #importMultiStatusJSON = os.popen(command).read()
        #print(importMultiStatusJSON)

    def broadcastTransaction(self, pendingWithdrawals):
        sendmanyCmd = {}
        for pendingWithdrawal in pendingWithdrawals:
            sendmanyCmd[pendingWithdrawal.destination_address] = pendingWithdrawal.amount #'{0:f}'.format(transactionOutput.amount)
        comment = 'N/A' #maybe have the guid here
        comment_to = 'N/A' #maybe have the layer2 pubkey here
        subtractfeefromamount = True #user pays fees

        #command = '"' + BITCOIN_CLI_PATH + '"' + self.getTestnetCommandParam() + " -rpcwallet=" + WALLET_NAME  + " sendmany " + "\"\"" + " '" + json.dumps(sendmanyCmd) + "' " #+ " " + comment + " " + comment_to + " " + str(subtractfeefromamount)
        command = '"' + BITCOIN_CLI_PATH + '"' + self.getTestnetCommandParam() + " -rpcwallet=" + WALLET_NAME  + " sendmany \"\" {'tb1q0a8r8dtsq6shsndg8jjzdu7dxtu0w6p2kuxx4p': 0.00001} " #+ " " + comment + " " + comment_to + " " + str(subtractfeefromamount)

        broadcastTransactionsJSON = os.popen(command).read()
        print(command)
        print("broadcastTransaction: " + broadcastTransactionsJSON)
        #broadcastTransactionsResponse = json.loads(broadcastTransactionsJSON)
        #transactionsID = broadcastTransactionsResponse["trxid"]
        #print("broadcastTransaction: " + broadcastTransactionsJSON)

    def getConfirmedTransactions(self, lastblockhash = ""):
        targetConfirmations = ""
        if(lastblockhash):
            targetConfirmations = str(self.getTargetConfirmations())
        command = '"' + BITCOIN_CLI_PATH + '"' + self.getTestnetCommandParam() + " -rpcwallet=" + WALLET_NAME + " listsinceblock " + lastblockhash + " " + targetConfirmations
        print(command)
        listsinceblockJSON = os.popen(command).read()
        print(listsinceblockJSON)

        listsinceblockResponse = json.loads(listsinceblockJSON)
        newlastblock = listsinceblockResponse["lastblock"]
        confirmedTransactions = []
        transactions = listsinceblockResponse["transactions"]
        for transaction in transactions:
            confirmedTransactions.append(transaction)
        return newlastblock, confirmedTransactions


def main():
    db = DatabaseInterface.DB()
    db.openOrCreateDB()
    # start bitcoin full node, or attach if it already started
    nh = NodeHelperRPC()
    comm = Communication()

    #nh.importMultiplePrivkeys()
    #return

    nh.loadWallet()
    return
    lastblockhash = db.getLastBlockHash()
    confirmedTransactionsDict = {}
    withdrawalsDict = {}
    #confirmedTransactionsDB = TinyDB('confirmedTransactions.json')
    #pendingWithdrawalsDB = TinyDB('pendingWithdrawals.json')

    #load pending confirmed transactions from the DB
    #q = Query()
    #pendingConfirmedTransactions = confirmedTransactionsDB.search(q.layer2_status == LAYER2_STATUS_PENDING)
    pendingConfirmedTransactions = db.getPendingConfirmedTransactions()
    for trx in pendingConfirmedTransactions:
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
        for confirmedTransactionJSON in confirmedTransactions:
            if(int(confirmedTransactionJSON["confirmations"]) >= nh.getTargetConfirmations()):
                trxid = confirmedTransactionJSON["txid"]
                if(trxid not in confirmedTransactionsDict):
                    confirmedTransaction = DatabaseInterface.ConfirmedTransaction().fromListSinceBlockRpcJson(confirmedTransactionJSON)
                    confirmedTransactionsDict[trxid] = confirmedTransaction #add in memory
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
            if(pendingWithdrawal.withdrawal_requested_timestamp > lastwithdrawalTimestamp):
                lastwithdrawalTimestamp = pendingWithdrawal.withdrawal_requested_timestamp
            print('New withdrawal recieved. address: ' + pendingWithdrawal.destination_address + ' amount: ' + str(pendingWithdrawal.amount))
        db.setLastWithdrawalTimestamp(lastwithdrawalTimestamp)


        pendingConfirmedTransactions = db.getPendingConfirmedDepositTransactions()
        for trx in pendingConfirmedTransactions:
            depositResponseJSON = json.loads(comm.sendConfirmDeposit(trx))
            if(depositResponseJSON['error_code'] == 0):
                db.updateConfirmedTransaction(trx.transaction_id, DatabaseInterface.ConfirmedTransaction.LAYER2_STATUS_CONFIRMED)
                print('Deposit confirmed. transaction_id:' + trx.transaction_id + ' address: ' + trx.address)


        nh.broadcastTransaction([TransactionOutput("tb1q0a8r8dtsq6shsndg8jjzdu7dxtu0w6p2kuxx4p", 0.000001)])
        # get all withdrawals from DB that needs to be broadcasted, and broadcast them
        # check the full node for any recieved transactions (using listtransactions)
        # if there are any recieved transactions, call the confirmDeposit backend API

        time.sleep(60*1) #sleep 1 mins
    pass

if __name__ == "__main__":
    main()
