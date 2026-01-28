from dataclasses import dataclass, field
import string
from typing import List

from BitcoinRPCResponses.BitcoinRPCResponse import BitcoinRpcResponse

'''
[               (json array)
  [             (json array)
    [           (json array)
      "str",    (string) The bitcoin address
      n,        (numeric) The amount in BTC
      "str",    (string, optional) The label
      ...
    ],
    ...
  ],
  ...
]
'''

@dataclass
class BitcoinRpcListAddressGroupingsAddress():
    address: string = ""
    amount: float = 0.0
    label: string = ""

    def fromJSON(self, json: dict):
        self.address = json[0]
        self.amount = json[1]
        if len(json) > 2:
            self.label = json[2]
        return self
    
@dataclass
class BitcoinRpcListAddressGroupingsResponse(BitcoinRpcResponse):
    address_groupings: List[List[List[BitcoinRpcListAddressGroupingsAddress]]] = field(default_factory=list)

    def fromJSON(self, json: dict):
        self.address_groupings = []
        for address_grouping in json:
            address_grouping_list = []
            for address in address_grouping:
                address_grouping_list.append(BitcoinRpcListAddressGroupingsAddress().fromJSON(address))
            self.address_groupings.append(address_grouping_list)
        return self