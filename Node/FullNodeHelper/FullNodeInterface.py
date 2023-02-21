import requests
import time
import os
import json
import random
import string
import datetime
import math
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

DEFAULT_TESTNET = True
TESTNET_TARGETCONFIRMATIONS = 3
MAINNET_TARGETCONFIRMATIONS = 6
SATOSHI_PER_BITCOIN = 100000000
BIP32_MAX_INDEX = 2147483647 # (2^31)-1

class BitcoinRPC:
    rpc_ip: string  = None
    rpc_user: string  = None
    rpc_password: string  = None
    rpc_port: string  = None
    wallet_name: string = None
    testnet: bool = None
    rpc_connection : AuthServiceProxy = None

    def __init__(self, rpc_ip, rpc_port, rpc_user, rpc_password, wallet_name, testnet = DEFAULT_TESTNET):
        self.rpc_ip = rpc_ip
        self.rpc_port = rpc_port
        self.rpc_user = rpc_user
        self.rpc_password = rpc_password
        self.wallet_name = wallet_name
        self.testnet = testnet
        print("rpc_port: " + rpc_port)
        self.rpc_connection = AuthServiceProxy("http://%s:%s@%s:%s"%(self.rpc_user, self.rpc_password, self.rpc_ip, self.rpc_port), timeout=120)

    def getTargetConfirmations(self):
        if(self.testnet):
            return TESTNET_TARGETCONFIRMATIONS
        else:
            return MAINNET_TARGETCONFIRMATIONS

    def getTestnetCommandParam(self):
        if(self.testnet):
            return " -testnet "
        return ""

    def loadWallet(self):
        try:
            satus = self.rpc_connection.loadwallet(self.wallet_name)
        except Exception as e:
            print(e)

    def importMultiplePrivkeys(self, seed, startingIndex, numberOfKeysToGenerate, testnet):
        seed_bytes = binascii.unhexlify(seed)
        pubkey_version = Bip32Conf.KEY_NET_VER.Test() if testnet else Bip32Conf.KEY_NET_VER.Main()
        privkey_version = BitcoinConf.WIF_NET_VER.Test() if testnet else BitcoinConf.WIF_NET_VER.Main()

        master_bip32_ctx = Bip32.FromSeed(seed_bytes, pubkey_version)
        print("Master Private key: " + master_bip32_ctx.PrivateKey().ToExtended())
        wif = WifEncoder.Encode(master_bip32_ctx.PrivateKey().Raw().ToBytes(), True, privkey_version)
        descriptors = []
        master_pubkey = master_bip32_ctx.PublicKey().ToExtended()
        print("Master Public key: " + master_pubkey)
        for i in range(startingIndex, startingIndex+numberOfKeysToGenerate):
            divisor = math.floor(i/BIP32_MAX_INDEX)
            remainder = i % BIP32_MAX_INDEX
            bip32_ctx = master_bip32_ctx.ChildKey(44).ChildKey(1).ChildKey(divisor).ChildKey(remainder)
            wif = WifEncoder.Encode(bip32_ctx.PrivateKey().Raw().ToBytes(), True, privkey_version)

            bip32_ctx = Bip32.FromExtendedKey(master_pubkey, pubkey_version)
            bip32_ctx = bip32_ctx.ChildKey(44).ChildKey(1).ChildKey(divisor).ChildKey(remainder)

            descriptor = "pkh(" + master_pubkey + "/44/1/" + str(divisor) + "/" + str(remainder) + ")"
            descriptor_checksum = checksum.AddChecksum(descriptor) #see getdescriptorinfo
            pubkey_bytes = bip32_ctx.PublicKey().RawCompressed().ToBytes()
            address = P2PKH.ToAddress(pubkey_bytes, BitcoinConf.P2PKH_NET_VER.Test())
            importmultiCmd = {'desc': descriptor_checksum, "timestamp": "now", "keys": [wif] }
            descriptors.append(importmultiCmd)
        try:
            status = self.rpc_connection.importmulti(descriptors)
            print(status)
        except Exception as e:
            print(e)

    def broadcastTransaction(self, pendingWithdrawals):
        sendmanyCmd = {}
        subtractfeefrom = set()
        for key, pendingWithdrawal in pendingWithdrawals.items():
            subtractfeefrom.add(pendingWithdrawal.destination_address)
            existingAmount = sendmanyCmd.get(pendingWithdrawal.destination_address, 0)
            sendmanyCmd[pendingWithdrawal.destination_address] = pendingWithdrawal.amount + existingAmount
        for key, value in sendmanyCmd.items():
            sendmanyCmd[key] = sendmanyCmd.get(key)/SATOSHI_PER_BITCOIN #note: must add the values together while they are integers, and then convert them at the end
        comment = 'N/A' #maybe have the guid here
        comment_to = 'N/A' #maybe have the layer2 pubkey here
        minconf = 1 #default minconf value
        print("broadcastTransaction: " + str(sendmanyCmd))

        status = ''
        try:
            status = self.rpc_connection.sendmany("", sendmanyCmd, str(minconf), "", list(subtractfeefrom))
            print('/broadcastTransaction: ' + status)
        except Exception as e:
            print(e)
        return status

    def getConfirmedTransactions(self, lastblockhash = ''):
        targetConfirmations = 0
        if(lastblockhash):
            targetConfirmations = str(self.getTargetConfirmations())

        print('lastblockhash: ' + str(lastblockhash))
        print('targetConfirmations: ' + str(targetConfirmations))
        listsinceblockJSON = ''
        try:
            if (not lastblockhash):
                listsinceblockJSON = self.rpc_connection.listsinceblock()
            else:
                listsinceblockJSON = self.rpc_connection.listsinceblock(lastblockhash, int(targetConfirmations))
            print("listsinceblockJSON: " + str(listsinceblockJSON))
        except Exception as e:
            print("listsinceblockJSON: " + str(e))

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
