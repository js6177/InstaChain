from dataclasses import dataclass, field
import string
from typing import List

from BitcoinRPCResponses.BitcoinRPCResponse import BitcoinRpcResponse

'''
{                                 (json object)
  "hash" : "hex",                 (string) the block hash (same as provided)
  "confirmations" : n,            (numeric) The number of confirmations, or -1 if the block is not on the main chain
  "height" : n,                   (numeric) The block height or index
  "version" : n,                  (numeric) The block version
  "versionHex" : "hex",           (string) The block version formatted in hexadecimal
  "merkleroot" : "hex",           (string) The merkle root
  "time" : xxx,                   (numeric) The block time expressed in UNIX epoch time
  "mediantime" : xxx,             (numeric) The median block time expressed in UNIX epoch time
  "nonce" : n,                    (numeric) The nonce
  "bits" : "hex",                 (string) The bits
  "difficulty" : n,               (numeric) The difficulty
  "chainwork" : "hex",            (string) Expected number of hashes required to produce the current chain
  "nTx" : n,                      (numeric) The number of transactions in the block
  "previousblockhash" : "hex",    (string) The hash of the previous block
  "nextblockhash" : "hex"         (string) The hash of the next block
}


'''

@dataclass
class BitcoinRpcGetBlockHeaderResponse(BitcoinRpcResponse):
    hash: string = ""
    confirmations: int = 0
    height: int = 0
    version: int = 0
    versionHex: string = ""
    merkleroot: string = ""
    time: int = 0
    mediantime: int = 0
    nonce: int = 0
    bits: string = ""
    difficulty: float = 0.0
    chainwork: string = ""
    nTx: int = 0
    previousblockhash: string = ""
    nextblockhash: string = ""
    
    def fromJSON(self, json: dict):
        self.hash = json.get('hash', "")
        self.confirmations = json.get('confirmations', 0)
        self.height = json.get('height', 0)
        self.version = json.get('version', 0)
        self.versionHex = json.get('versionHex', "")
        self.merkleroot = json.get('merkleroot', "")
        self.time = json.get('time', 0)
        self.mediantime = json.get('mediantime', 0)
        self.nonce = json.get('nonce', 0)
        self.bits = json.get('bits', "")
        self.difficulty = json.get('difficulty', 0.0)
        self.chainwork = json.get('chainwork', "")
        self.nTx = json.get('nTx', 0)
        self.previousblockhash = json.get('previousblockhash', "")
        self.nextblockhash = json.get('nextblockhash', "")
        return self