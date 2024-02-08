from dataclasses import dataclass, field
import string
from typing import List

from BitcoinRPCResponses.BitcoinRPCResponse import BitcoinRpcResponse

'''
{                                          (json object)
  "amount" : n,                            (numeric) The amount in BTC
  "fee" : n,                               (numeric) The amount of the fee in BTC. This is negative and only available for the
                                           'send' category of transactions.
  "confirmations" : n,                     (numeric) The number of confirmations for the transaction. Negative confirmations means the
                                           transaction conflicted that many blocks ago.
  "generated" : true|false,                (boolean) Only present if transaction only input is a coinbase one.
  "trusted" : true|false,                  (boolean) Only present if we consider transaction to be trusted and so safe to spend from.
  "blockhash" : "hex",                     (string) The block hash containing the transaction.
  "blockheight" : n,                       (numeric) The block height containing the transaction.
  "blockindex" : n,                        (numeric) The index of the transaction in the block that includes it.
  "blocktime" : xxx,                       (numeric) The block time expressed in UNIX epoch time.
  "txid" : "hex",                          (string) The transaction id.
  "walletconflicts" : [                    (json array) Conflicting transaction ids.
    "hex",                                 (string) The transaction id.
    ...
  ],
  "time" : xxx,                            (numeric) The transaction time expressed in UNIX epoch time.
  "timereceived" : xxx,                    (numeric) The time received expressed in UNIX epoch time.
  "comment" : "str",                       (string) If a comment is associated with the transaction, only present if not empty.
  "bip125-replaceable" : "str",            (string) ("yes|no|unknown") Whether this transaction could be replaced due to BIP125 (replace-by-fee);
                                           may be unknown for unconfirmed transactions not in the mempool
  "details" : [                            (json array)
    {                                      (json object)
      "involvesWatchonly" : true|false,    (boolean) Only returns true if imported addresses were involved in transaction.
      "address" : "str",                   (string) The bitcoin address involved in the transaction.
      "category" : "str",                  (string) The transaction category.
                                           "send"                  Transactions sent.
                                           "receive"               Non-coinbase transactions received.
                                           "generate"              Coinbase transactions received with more than 100 confirmations.
                                           "immature"              Coinbase transactions received with 100 or fewer confirmations.
                                           "orphan"                Orphaned coinbase transactions received.
      "amount" : n,                        (numeric) The amount in BTC
      "label" : "str",                     (string) A comment for the address/transaction, if any
      "vout" : n,                          (numeric) the vout value
      "fee" : n,                           (numeric) The amount of the fee in BTC. This is negative and only available for the
                                           'send' category of transactions.
      "abandoned" : true|false             (boolean) 'true' if the transaction has been abandoned (inputs are respendable). Only available for the
                                           'send' category of transactions.
    },
    ...
  ],
  "hex" : "hex",                           (string) Raw data for transaction
  "decoded" : {                            (json object) Optional, the decoded transaction (only present when `verbose` is passed)
    ...                                    Equivalent to the RPC decoderawtransaction method, or the RPC getrawtransaction method when `verbose` is passed.
  }
'''

@dataclass
class BitcoinRpcGetTransactionResponseDetails():
    involvesWatchonly: bool = False
    address: str = ""
    category: str = ""
    amount: float = 0.0
    label: str = ""
    vout: int = 0
    fee: float = 0.0
    abandoned: bool = False

    def fromJSON(self, json: dict):
        self.involvesWatchonly = json.get("involvesWatchonly", False)
        self.address = json.get("address", "")
        self.category = json.get("category", "")
        self.amount = json.get("amount", 0.0)
        self.label = json.get("label", "")
        self.vout = json.get("vout", 0)
        self.fee = json.get("fee", 0.0)
        self.abandoned = json.get("abandoned", False)
        return self
    
@dataclass
class BitcoinRpcGetTransactionResponse(BitcoinRpcResponse):
    amount: float = 0.0
    fee: float = 0.0
    confirmations: int = 0
    generated: bool = False
    trusted: bool = False
    blockhash: str = ""
    blockheight: int = 0
    blockindex: int = 0
    blocktime: int = 0
    txid: str = ""
    walletconflicts: List[str] = field(default_factory=list)
    time: int = 0
    timereceived: int = 0
    comment: str = ""
    bip125_replaceable: str = ""
    details: List[BitcoinRpcGetTransactionResponseDetails] = field(default_factory=list)
    hex: str = ""
    decoded: dict = field(default_factory=dict)

    def fromJSON(self, json: dict):
        self.amount = json.get("amount", 0.0)
        self.fee = json.get("fee", 0.0)
        self.confirmations = json.get("confirmations", 0)
        self.generated = json.get("generated", False)
        self.trusted = json.get("trusted", False)
        self.blockhash = json.get("blockhash", "")
        self.blockheight = json.get("blockheight", 0)
        self.blockindex = json.get("blockindex", 0)
        self.blocktime = json.get("blocktime", 0)
        self.txid = json.get("txid", "")
        self.walletconflicts = json.get("walletconflicts", [])
        self.time = json.get("time", 0)
        self.timereceived = json.get("timereceived", 0)
        self.comment = json.get("comment", "")
        self.bip125_replaceable = json.get("bip125-replaceable", "")
        details = json.get("details", [])
        for detail in details:
            self.details.append(BitcoinRpcGetTransactionResponseDetails().fromJSON(detail))
        self.hex = json.get("hex", "")
        self.decoded = json.get("decoded", {})
        return self
