import requests
import time
import os
import json
import random
import string
import datetime
import math
from typing import List
from dataclasses import dataclass
from BitcoinRPCResponses.GetBlockCountResponse import BitcoinRpcGetBlockHeightResponse
from BitcoinRPCResponses.GetBlockHeaderResponse import BitcoinRpcGetBlockHeaderResponse
from BitcoinRPCResponses.GetTransactionResponse import BitcoinRpcGetTransactionResponse
from BitcoinRPCResponses.ListAddressGroupingsResponse import BitcoinRpcListAddressGroupingsResponse
from BitcoinRPCResponses.LoadWalletResponse import BitcoinRpcLoadWalletResponse
from BitcoinRPCResponses.ListSinceBlockResponse import BitcoinRpcListSinceBlockResponse
import DatabaseInterface
from AuditDatabaseInterface import AuditLayer1Address
import SigningAddress
import binascii
import checksum
from bip_utils import Bip32, Bip32Utils, Bip32Conf, BitcoinConf, Bip44BitcoinTestNet, WifEncoder
from bip_utils import P2PKH, P2SH, P2WPKH
from bitcoinrpc.authproxy import AuthServiceProxy, JSONRPCException
import traceback
import argparse
from OnboardingLogger import OnboardingLogger

from BitcoinRPCResponses.SendManyResponse import BitcoinRpcSendManyResponse


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
        OnboardingLogger("rpc_port: " + rpc_port)
        self.rpc_connection = AuthServiceProxy("http://%s:%s@%s:%s"%(self.rpc_user, self.rpc_password, self.rpc_ip, self.rpc_port), timeout=120)

    #TODO: find a way to dynamically get this from the node
    def getMinimumTransactionAmount(self) -> int:
        return 1000

    def getTargetConfirmations(self):
        if(self.testnet):
            return TESTNET_TARGETCONFIRMATIONS
        else:
            return MAINNET_TARGETCONFIRMATIONS

    def getTestnetCommandParam(self):
        if(self.testnet):
            return " -testnet "
        return ""

    def loadWallet(self) -> BitcoinRpcLoadWalletResponse:
        loadWalletResponse: BitcoinRpcLoadWalletResponse = None
        try:
            wallet = self.rpc_connection.loadwallet(self.wallet_name)
            loadWalletResponse = BitcoinRpcLoadWalletResponse(name=wallet, warning=None, success=True)
            #status = self.rpc_connection.loadwallet(self.wallet_name)
        except Exception as e:
            wallet_already_loaded = (e.code==-35)
            loadWalletResponse = BitcoinRpcLoadWalletResponse(name=None, warning=None, exception=e, success=wallet_already_loaded)
            OnboardingLogger(e)
        return loadWalletResponse

    def importMultiplePrivkeys(self, seed, startingIndex, numberOfKeysToGenerate, testnet):
        seed_bytes = binascii.unhexlify(seed)
        pubkey_version = Bip32Conf.KEY_NET_VER.Test() if testnet else Bip32Conf.KEY_NET_VER.Main()
        privkey_version = BitcoinConf.WIF_NET_VER.Test() if testnet else BitcoinConf.WIF_NET_VER.Main()

        master_bip32_ctx = Bip32.FromSeed(seed_bytes, pubkey_version)
        OnboardingLogger("Master Private key: " + master_bip32_ctx.PrivateKey().ToExtended())
        wif = WifEncoder.Encode(master_bip32_ctx.PrivateKey().Raw().ToBytes(), True, privkey_version)
        descriptors = []
        master_pubkey = master_bip32_ctx.PublicKey().ToExtended()
        OnboardingLogger("Master Public key: " + master_pubkey)
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
            OnboardingLogger(status)
        except Exception as e:
            OnboardingLogger(e)

    def broadcastTransaction(self, pendingWithdrawals) -> BitcoinRpcSendManyResponse:
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
        OnboardingLogger("broadcastTransaction: " + str(sendmanyCmd))

        sendManyResponse: BitcoinRpcSendManyResponse = None
        try:
            trx_id = self.rpc_connection.sendmany("", sendmanyCmd, minconf, "", list(subtractfeefrom))
            sendManyResponse = BitcoinRpcSendManyResponse(success=True, exception=None, transaction_id=trx_id)
            OnboardingLogger('/broadcastTransaction: ' + trx_id)
        except Exception as e:
            sendManyResponse = BitcoinRpcSendManyResponse(success=False, exception=e, transaction_id=None)
            OnboardingLogger(e)
        return sendManyResponse

    def getConfirmedTransactions(self, lastblockhash = '') -> BitcoinRpcListSinceBlockResponse:
        targetConfirmations = 0
        if(lastblockhash):
            targetConfirmations = str(self.getTargetConfirmations())

        OnboardingLogger('lastblockhash: ' + str(lastblockhash))
        OnboardingLogger('targetConfirmations: ' + str(targetConfirmations))
        listSinceBlockResponse: BitcoinRpcListSinceBlockResponse = BitcoinRpcListSinceBlockResponse()
        listsinceblockJSON = ''
        try:
            if (not lastblockhash):
                listsinceblockJSON = self.rpc_connection.listsinceblock()
            else:
                listsinceblockJSON = self.rpc_connection.listsinceblock(lastblockhash, int(targetConfirmations))
            listSinceBlockResponse.success = True
            listSinceBlockResponse.fromJSON(listsinceblockJSON)
            OnboardingLogger("listsinceblockJSON: " + str(listsinceblockJSON))
        except Exception as e:
            listSinceBlockResponse.success = False
            listSinceBlockResponse.exception = e
            OnboardingLogger("listsinceblockJSON: " + str(e))
        return listSinceBlockResponse

    def getTransaction(self, transaction_id) -> BitcoinRpcGetTransactionResponse:
        getTransactionResponse: BitcoinRpcGetTransactionResponse = BitcoinRpcGetTransactionResponse()
        try:
            getTransactionJSON = self.rpc_connection.gettransaction(transaction_id)
            getTransactionResponse = BitcoinRpcGetTransactionResponse().fromJSON(getTransactionJSON)
            getTransactionResponse.success = True
        except Exception as e:
            getTransactionResponse.success = False
            getTransactionResponse.exception = e
            OnboardingLogger(e)
        return getTransactionResponse
    
    def getAddressGroupings(self) -> BitcoinRpcListAddressGroupingsResponse:
        addressGroupings: BitcoinRpcListAddressGroupingsResponse = BitcoinRpcListAddressGroupingsResponse()
        try:
            addressGroupingsJson = self.rpc_connection.listaddressgroupings()
            addressGroupings.fromJSON(addressGroupingsJson)
            addressGroupings.success = True
        except Exception as e:
            addressGroupings.success = False
            addressGroupings.exception = e
        return addressGroupings

    def getBlockHeader(self, blockhash) -> BitcoinRpcGetBlockHeaderResponse:
        blockHeader: BitcoinRpcGetBlockHeaderResponse = BitcoinRpcGetBlockHeaderResponse()
        try:
            getBlockHeaderJson = self.rpc_connection.getblockheader(blockhash, True)
            blockHeader = BitcoinRpcGetBlockHeaderResponse().fromJSON(getBlockHeaderJson)
            blockHeader.success = True
        except Exception as e:
            blockHeader.success = False
            blockHeader.exception = e
        return blockHeader
    
    def getBlockHeight(self) -> BitcoinRpcGetBlockHeightResponse:
        blockHeight: BitcoinRpcGetBlockHeightResponse = BitcoinRpcGetBlockHeightResponse()
        try:
            blockHeight.height = self.rpc_connection.getblockcount()
            blockHeight.success = True
        except Exception as e:
            blockHeight.success = False
            blockHeight.exception = e
        return blockHeight
