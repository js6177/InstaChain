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

TESTNET = True
WALLET_NAME = "wallet"
TESTNET_TARGETCONFIRMATIONS = 3
MAINNET_TARGETCONFIRMATIONS = 6
SATOSHI_PER_BITCOIN = 100000000


class BitcoinRPC:
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

    def importMultiplePrivkeys(self, seed, startingIndex, numberOfKeysToGenerate, testnet):
        seed_bytes = binascii.unhexlify(b"1eb00bbddcf069084889a8ab4155569165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4")
        pubkey_version = Bip32Conf.KEY_NET_VER.Test() if testnet else Bip32Conf.KEY_NET_VER.Main()
        privkey_version = BitcoinConf.WIF_NET_VER.Test() if testnet else BitcoinConf.WIF_NET_VER.Main()

        master_bip32_ctx = Bip32.FromSeed(seed_bytes, pubkey_version)
        print("Master Private key: " + master_bip32_ctx.PrivateKey().ToExtended())
        wif = WifEncoder.Encode(master_bip32_ctx.PrivateKey().Raw().ToBytes(), True, privkey_version)
        #print("Master Private key WIF: " + wif)
        descriptors = []
        master_pubkey = master_bip32_ctx.PublicKey().ToExtended()
        print("Master Public key: " + master_pubkey)
        j = 2
        for i in range(startingIndex, startingIndex+numberOfKeysToGenerate):
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
            #print("address: " + address)

        #print(json.dumps(descriptors))
        #command = 'bitcoin-cli.exe ' + self.getTestnetCommandParam() + " -rpcwallet=" + WALLET_NAME + " importmulti '" + json.dumps(descriptors) + "' " + '\'{"rescan": false}\''
        #print("command: " + command)
        try:
            status = self.rpc_connection.importmulti(descriptors)
            print(status)
        except Exception as e:
            print(e)
        print("Master Public key: " + master_pubkey)
        #importMultiStatusJSON = os.popen(command).read()
        #print(importMultiStatusJSON)

    def broadcastTransaction(self, pendingWithdrawals):
        sendmanyCmd = {}
        subtractfeefrom = set()
        for key, pendingWithdrawal in pendingWithdrawals.items():
            subtractfeefrom.add(pendingWithdrawal.destination_address)
            existingAmount = sendmanyCmd.get(pendingWithdrawal.destination_address, 0)
            sendmanyCmd[pendingWithdrawal.destination_address] = pendingWithdrawal.amount + existingAmount #'{0:f}'.format(transactionOutput.amount)
        for key, value in sendmanyCmd.items():
            sendmanyCmd[key] = sendmanyCmd.get(key)/SATOSHI_PER_BITCOIN #note: must add the values together while they are integers, and then convert them at the end
        comment = 'N/A' #maybe have the guid here
        comment_to = 'N/A' #maybe have the layer2 pubkey here
        minconf = 1 #default minconf value
        print("broadcastTransaction: " + str(sendmanyCmd))

        #command = '"' + BITCOIN_CLI_PATH + '"' + self.getTestnetCommandParam() + " -rpcwallet=" + WALLET_NAME  + " sendmany " + "\"\"" + " '" + json.dumps(sendmanyCmd) + "' " #+ " " + comment + " " + comment_to + " " + str(subtractfeefromamount)
        #command = '"' + BITCOIN_CLI_PATH + '"' + self.getTestnetCommandParam() + " -rpcwallet=" + WALLET_NAME  + " sendmany \"\" {'tb1q0a8r8dtsq6shsndg8jjzdu7dxtu0w6p2kuxx4p': 0.00001} " #+ " " + comment + " " + comment_to + " " + str(subtractfeefromamount)

        #broadcastTransactionsJSON = os.popen(command).read()
        #print(command)
        #print("broadcastTransaction: " + broadcastTransactionsJSON)
        status = ''
        try:
            status = self.rpc_connection.sendmany("", sendmanyCmd, str(minconf), "", list(subtractfeefrom))
            print('/broadcastTransaction: ' + status)
        except Exception as e:
            print(e)
        return status
        #broadcastTransactionsResponse = json.loads(broadcastTransactionsJSON)
        #transactionsID = broadcastTransactionsResponse["trxid"]
        #print("broadcastTransaction: " + broadcastTransactionsJSON)

    def getConfirmedTransactions(self, lastblockhash = ''):
        targetConfirmations = 0
        if(lastblockhash):
            targetConfirmations = str(self.getTargetConfirmations())
        #command = '"' + BITCOIN_CLI_PATH + '"' + self.getTestnetCommandParam() + " -rpcwallet=" + WALLET_NAME + " listsinceblock " + lastblockhash + " " + targetConfirmations
        #print(command)
        #listsinceblockJSON = os.popen(command).read()
        print('lastblockhash: ' + lastblockhash)
        print('targetConfirmations: ' + str(targetConfirmations))
        listsinceblockJSON = ''
        try:
            if (not lastblockhash):
                listsinceblockJSON = self.rpc_connection.listsinceblock()
            else:
                listsinceblockJSON = self.rpc_connection.listsinceblock(lastblockhash, int(targetConfirmations))
            print(listsinceblockJSON)
        except Exception as e:
            print(e)

        #print(listsinceblockJSON)

        #listsinceblockResponse = json.load(listsinceblockJSON)
        newlastblock = listsinceblockJSON["lastblock"]
        confirmedTransactions = []
        transactions = listsinceblockJSON["transactions"]
        for transaction in transactions:
            confirmedTransactions.append(transaction)
        return newlastblock,confirmedTransactions

    def getTransaction(self, transaction_id):
        outputs = {}
        gettransactionJSON = self.rpc_connection.gettransaction(transaction_id)
        return DatabaseInterface.ConfirmedTransaction.fromGetTransaction(gettransactionJSON)
        transactionDetails = gettransactionJSON["details"]
        for transaction in transactionDetails:
            output = DatabaseInterface.ConfirmedTransaction(transaction_id = transaction_id, layer2_status=None, transaction_vout=transaction["vout"], amount = transaction["amount"], fee=transaction["fee"], address=transaction["address"], category = transaction["category"], confirmations=0, timestamp=0, blockheight=0 )
            outputs[output.address] = output
        return outputs

    def getBlockHeader(self, blockhash):
        blockHeaderDict = self.rpc_connection.getblockheader(blockhash, True)
        return blockHeaderDict

    def getBlockHeader(self, blockhash):
        blockHeaderDict = self.rpc_connection.getblockheader(blockhash, True)
        return blockHeaderDict