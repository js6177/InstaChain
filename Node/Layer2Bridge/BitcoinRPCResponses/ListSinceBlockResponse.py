from dataclasses import dataclass, field
import string
from typing import List

from BitcoinRPCResponses.BitcoinRPCResponse import BitcoinRpcResponse

'''
"transactions" : [                       (json array)
    {                                      (json object)
      "involvesWatchonly" : true|false,    (boolean) Only returns true if imported addresses were involved in transaction.
      "address" : "str",                   (string) The bitcoin address of the transaction.
      "category" : "str",                  (string) The transaction category.
                                           "send"                  Transactions sent.
                                           "receive"               Non-coinbase transactions received.
                                           "generate"              Coinbase transactions received with more than 100 confirmations.
                                           "immature"              Coinbase transactions received with 100 or fewer confirmations.
                                           "orphan"                Orphaned coinbase transactions received.
      "amount" : n,                        (numeric) The amount in BTC. This is negative for the 'send' category, and is positive
                                           for all other categories
      "vout" : n,                          (numeric) the vout value
      "fee" : n,                           (numeric) The amount of the fee in BTC. This is negative and only available for the
                                           'send' category of transactions.
      "confirmations" : n,                 (numeric) The number of confirmations for the transaction. Negative confirmations means the
                                           transaction conflicted that many blocks ago.
      "generated" : true|false,            (boolean) Only present if transaction only input is a coinbase one.
      "trusted" : true|false,              (boolean) Only present if we consider transaction to be trusted and so safe to spend from.
      "blockhash" : "hex",                 (string) The block hash containing the transaction.
      "blockheight" : n,                   (numeric) The block height containing the transaction.
      "blockindex" : n,                    (numeric) The index of the transaction in the block that includes it.
      "blocktime" : xxx,                   (numeric) The block time expressed in UNIX epoch time.
      "txid" : "hex",                      (string) The transaction id.
      "walletconflicts" : [                (json array) Conflicting transaction ids.
        "hex",                             (string) The transaction id.
        ...
      ],
      "time" : xxx,                        (numeric) The transaction time expressed in UNIX epoch time.
      "timereceived" : xxx,                (numeric) The time received expressed in UNIX epoch time.
      "comment" : "str",                   (string) If a comment is associated with the transaction, only present if not empty.
      "bip125-replaceable" : "str",        (string) ("yes|no|unknown") Whether this transaction could be replaced due to BIP125 (replace-by-fee);
                                           may be unknown for unconfirmed transactions not in the mempool
      "abandoned" : true|false,            (boolean) 'true' if the transaction has been abandoned (inputs are respendable). Only available for the
                                           'send' category of transactions.
      "label" : "str",                     (string) A comment for the address/transaction, if any
      "to" : "str"                         (string) If a comment to is associated with the transaction.
    },
    ...
]
'''

@dataclass
class BitcoinRpcListSinceBlockTransactions:
    involvesWatchonly: bool = False
    address: str = ""
    category: str = ""
    amount: float = 0.0
    vout: int = 0
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
    abandoned: bool = False
    label: str = ""
    to: str = ""

    def fromJSON(self, json: dict):
        self.involvesWatchonly = json.get("involvesWatchonly")
        self.address = json.get("address")
        self.category = json.get("category")
        self.amount = json.get("amount")
        self.vout = json.get("vout")
        self.fee = json.get("fee")
        self.confirmations = json.get("confirmations")
        self.generated = json.get("generated")
        self.trusted = json.get("trusted")
        self.blockhash = json.get("blockhash")
        self.blockheight = json.get("blockheight")
        self.blockindex = json.get("blockindex")
        self.blocktime = json.get("blocktime")
        self.txid = json.get("txid")
        self.walletconflicts = json.get("walletconflicts")
        self.time = json.get("time")
        self.timereceived = json.get("timereceived")
        self.comment = json.get("comment")
        self.bip125_replaceable = json.get("bip125-replaceable")
        self.abandoned = json.get("abandoned")
        self.label = json.get("label")
        self.to = json.get("to")
        return self

@dataclass
class BitcoinRpcListSinceBlockResponse(BitcoinRpcResponse):
    lastblock: string = ""
    transactions: List[BitcoinRpcListSinceBlockTransactions] = field(default_factory=list)

    def fromJSON(self, json: dict) -> None:
        self.lastblock = json["lastblock"]
        self.transactions = [BitcoinRpcListSinceBlockTransactions().fromJSON(transaction) for transaction in json["transactions"]]
        return self