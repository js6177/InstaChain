# InstaChain
A decentralized, real-time 2nd layer sidechain with instant transaction confirmations and near 0 fees, with a 2-way peg so you can deposit and withdraw btc directly to and from the btc network. It features a decentralized, non-distributed architecture that enables anyone to run a node (a.k.a their own sidechain) and process transactions. Node operators do not need any permission to run a node, and users can connect to any (1 or more) node they choose to.

### Step-by-step Tuturial
Here is a simple tutorial that shows depositing, withdrawing, and transfering using the InstaChain layer2 ledger:

First, clone the repo and navigate to the `/Wallet` folder. This folder contains all the files need to interact with the network.
The wallet itself is a python file, so you will need to first install the depencies located in the `requirements.txt` file. You can install it globally or create a [virtual environment](https://docs.python.org/3/library/venv.html); I prefer the virtual env because it is cleaner.

One the dependencies are installed, run the `wallet-cli.py` file. It should output something like this:

```
PS C:\InstaChain\InstaChain\Wallet> python .\wallet-cli.py
InstaChain Wallet v0.1a - CLI
Warning: config.json not found
```
You can ignore the "Warning: config.json not found", the config file is for things like automatically loading a wallet at startup or setting a default node url.

Now, create a new wallet. Notice, when it prompts it says "(no wallet loaded)" which means you need to either create or load a wallet
```
(no wallet loaded) > new-wallet wallet.json
4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU
``` 
This creates a new wallet called "wallet.json" and automatically generates an address, which is then printed.  
When an address is created, the wallet generate a public key and private key pair. The "address" is the public key that is the source and destination address of a transaction. The private key is needed for signing transactions that spend the funds in that address. If you look at the wallet.json file, you'll see the pubkey/privkey pair.
```
{
    "addresses": [
        {
            "pubkey": "4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU",
            "privkey": "4ayhEYjibFcAuXXXXXXXXXXXXXXXXXXXXXXX",
            "description": "",
            "deposit_address": ""
        }
    ],
    "wallet_name": "wallet.json",
    "trusted_nodes": [
        {
            "hostname": "https://testnet.instachain.io/",
            "node_id": "BbwLnyLR9eVjL2qb",
            "name": "Tesnet Node",
            "asset_id": 4294967297
        }
    ],
    "current_node": "https://testnet.instachain.io/"
}
```
You'll notice that the private key is censored out, this is because this key controls access to the funds in that address. If you lose this key, you will lose access to the funds. So keep this safe and do not disclose it to anyone else.

You can create as many addresses as you want by using the `new-address` command.
```
(no wallet loaded) > new-wallet wallet.json
4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU
```
This also prints the newly generated address. Note that once a wallet is loaded, it will print the wallet name and node it is connected to before the prompt.

You can see all the addreses in the wallet using the `list-addresses` command
```
(wallet.json)(node: https://testnet.instachain.io/) > list-addresses
4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU
613vArFUGhg5MnXdWc5bZg6eiuH2qFAPCgRkvRorFYuEN8TSoFrp2fioC8QMEpFdYT2M4PfPJm5eoUv24pJa3vUY
```

Now that we have an address, we need to deposit funds to it. There are 2 ways to receive funds: either you receive funds from some other layer 2 address via a transfer transaction, or you can deposit (a.k.a peg-in) funds to it. To deposit funds, you will first need to get a deposit address. This is a layer 1 address that credits you layer2 address with funds when it receives layer 1 transactions.
```
(wallet.json)(node: https://testnet.instachain.io/) > get-deposit-address 4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU
mygjCexxwbNTKwCCfAzKzkGKcuwXoETtCm
```
This command will print the layer 1 address you will need to send funds to. In this case, the address is a testnet bitcoin address. Note that this node is live and you can see the address here: https://blockstream.info/testnet/address/mygjCexxwbNTKwCCfAzKzkGKcuwXoETtCm

Once you transfer layer 1 funds, you will see your layer 2 address credited after 3 confirmations (6 confirmations for mainnet bitcoin, 3 for testnet bitcoin)

You can display you wallet balance using the `list-wallet-balance` command:
```
(wallet.json)(node: https://testnet.instachain.io/) > list-wallet-balance
4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU: 120000
613vArFUGhg5MnXdWc5bZg6eiuH2qFAPCgRkvRorFYuEN8TSoFrp2fioC8QMEpFdYT2M4PfPJm5eoUv24pJa3vUY: 0
```

Now let's transfer some of the funds from the first address to the second using the `transfer` command:
```
(wallet.json)(node: https://testnet.instachain.io/) > transfer 613vArFUGhg5MnXdWc5bZg6eiuH2qFAPCgRkvRorFYuEN8TSoFrp2fioC8QMEpFdYT2M4PfPJm5eoUv24pJa3vUY 1500 4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU
Transaction id: kHxA9Cmz5Qqg256vSXT3B3C4LJxeMFat
Asset id: 0x100000001
{"error_code":0,"error_message":"Success"}
```

This will print the error code as well as the transaction id. You can use the transaction id to get the full transaction details using the `view-transaction` command:
```
(wallet.json)(node: https://testnet.instachain.io/) > view-transaction kHxA9Cmz5Qqg256vSXT3B3C4LJxeMFat
{"error_code":0,"error_message":"Success","transaction":{"amount":1500,"destination_address_pubkey":"613vArFUGhg5MnXdWc5bZg6eiuH2qFAPCgRkvRorFYuEN8TSoFrp2fioC8QMEpFdYT2M4PfPJm5eoUv24pJa3vUY","fee":1,"layer1_transaction_id":null,"layer2_withdrawal_id":null,"signature":"4FgTXQTyQnNKPzU4UzMvrjwsRZfjfHRuoTwAB6K6a6N8nJbRSJFN4fKvQWenzpE5RCYj43PPYtqBsc3aiYFWqcNy","signature_date":null,"source_address_pubkey":"4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU","timestamp":1645347924,"transaction_id":"kHxA9Cmz5Qqg256vSXT3B3C4LJxeMFat","transaction_type":1}}
```
Notice the `amount`, `destination_address_pubkey`, and `source_address_pubkey` fields which basically show what the to/from address and amount is. For the rest of the fields, see the design docs.

Once you have funds in a layer 2 address, you can always withdraw to the base layer using the withdraw command. There are no fees for withdrawing, but since this involves a layer 1 transaction, the base layer might charge standard transaction fees which the recipient pays.
```
(wallet.json)(node: https://testnet.instachain.io/) > withdraw 4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU tb1qqj2lkmv3wlccew574e6ft7hawks80lm2d8tf7x 2000
Transaction id: kvBV2I4cP97nuAzlwDDtEdqZSefTpnLw
{"error_code":0,"error_message":"Success"}
```

You can see all transactions in your wallet using the `list-wallet-transactions` command
```
(wallet.json)(node: https://testnet.instachain.io/) > list-wallet-transactions                                                                                                                                                                                                                                                                                                                                                                                                                   
Address: 4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU                                                                                                                                                
Transaction ID                                     Source                                                                                     Amount     Destination                                                                             
npCFjAwlPemPkWlK                                   DEPOSIT                                                                                    +120000    4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU
kHxA9Cmz5Qqg256vSXT3B3C4LJxeMFat                   4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU   -1500      613vArFUGhg5MnXdWc5bZg6eiuH2qFAPCgRkvRorFYuEN8TSoFrp2fioC8QMEpFdYT2M4PfPJm5eoUv24pJa3vUY
kvBV2I4cP97nuAzlwDDtEdqZSefTpnLw                   4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU   -2000      tb1qqj2lkmv3wlccew574e6ft7hawks80lm2d8tf7x (WITHDRAWAL)                                 
                                                                                                                                                                                                                                                 
Address: 613vArFUGhg5MnXdWc5bZg6eiuH2qFAPCgRkvRorFYuEN8TSoFrp2fioC8QMEpFdYT2M4PfPJm5eoUv24pJa3vUY                                                                                                                                                
Transaction ID                                     Source                                                                                     Amount     Destination                                                                             
kHxA9Cmz5Qqg256vSXT3B3C4LJxeMFat                   4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU   +1500      613vArFUGhg5MnXdWc5bZg6eiuH2qFAPCgRkvRorFYuEN8TSoFrp2fioC8QMEpFdYT2M4PfPJm5eoUv24pJa3vUY
```
You can see that it prints a table for every address in your wallet. If the transaction is a deposit, the source address will print  `DEPOSIT` since this is basically a transfer from layer 1 to layer 2. If it is a withdrawal, the destination will be the layer 1 address you deposit to with a "(WITHDRAWAL)" appended to let you know it is a withdrawal. The amount will be a positive or negative integer depending on if funds are moved into or out of you address.

You can also print the transactions for only a specigic address:
```
Address: 4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU
Transaction ID                                     Source                                                                                     Amount     Destination
npCFjAwlPemPkWlK                                   DEPOSIT                                                                                    +120000    4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU
kHxA9Cmz5Qqg256vSXT3B3C4LJxeMFat                   4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU   -1500      613vArFUGhg5MnXdWc5bZg6eiuH2qFAPCgRkvRorFYuEN8TSoFrp2fioC8QMEpFdYT2M4PfPJm5eoUv24pJa3vUY
kvBV2I4cP97nuAzlwDDtEdqZSefTpnLw                   4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU   -2000      tb1qqj2lkmv3wlccew574e6ft7hawks80lm2d8tf7x (WITHDRAWAL)
```

You can see the deposits and withdrawals using the `view-transaction` too. Here is the deposit transactions:
```
(wallet.json)(node: https://testnet.instachain.io/) > view-transaction npCFjAwlPemPkWlK
{"error_code":0,"error_message":"Success","transaction":{"amount":120000,"destination_address_pubkey":"4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU","fee":0,"layer1_transaction_id":"dfed57a458c6ae407d7725561a4e6bbbf14181146817a53ea09459672086ac00","layer2_withdrawal_id":null,"signature":"2KpDjQkc2kbAFYDMfSrYdL3FQMvgFUfRjjen4wQUC2SgxDD5BMx1efdFmW1KdUubycC6Z2MZC8HE7s2wCoDBbtan","signature_date":null,"source_address_pubkey":"4JRFbqPg1ZFDg2y99BFT4uCEToKWpH33171APaiTTPP2LtHvrGUAvjEaDoYKvmixDYwhQqYtMDZ6E9G9EH9tkMTg","timestamp":1645347069,"transaction_id":"npCFjAwlPemPkWlK","transaction_type":2}}
```
The `layer1_transaction_id` field will contain the layer1 transaction id that does the deposit or withdrawal; in this case the deposit transaction is this one: https://blockstream.info/testnet/tx/dfed57a458c6ae407d7725561a4e6bbbf14181146817a53ea09459672086ac00

Likewise, you can see the withdrawal transaction:
```
(wallet.json)(node: https://testnet.instachain.io/) > view-transaction kvBV2I4cP97nuAzlwDDtEdqZSefTpnLw
{"error_code":0,"error_message":"Success","transaction":{"amount":2000,"destination_address_pubkey":"tb1qqj2lkmv3wlccew574e6ft7hawks80lm2d8tf7x","fee":0,"layer1_transaction_id":"954239cf55637ad1780f60433b7667215e90e379be9d0f569eaa2085bb79bf13","layer2_withdrawal_id":"fkeJnijQM0wDHuSu","signature":"5WF8ctx5qDz6S8YBPjsV2iNinju2kaZ3qnnD7V3X6gmxwGjLpYyijW8mULfLHTJWTkcK7CgiEBQHbpjkE6nxTitj","signature_date":null,"source_address_pubkey":"4bhk6kJMRbQR2m62onWdTTZvE74bYcP9huFW2JtNN47nYJX4UdZaZGG6R7x11S7QoL5K62hGB6bwgkA2u1Bfs9EU","timestamp":1645348212,"transaction_id":"kvBV2I4cP97nuAzlwDDtEdqZSefTpnLw","transaction_type":3}}
```
Here is the withdrawal transaction: https://blockstream.info/testnet/tx/954239cf55637ad1780f60433b7667215e90e379be9d0f569eaa2085bb79bf13
Note that both the deposit and withdraw transaction only update the `layer1_transaction_id` once the layer1 transaction gets 3 confirmations. Therefore, right after you send the withdraw, the `layer1_transaction_id` will be null untill the transaction gets confirmed.

You can use the `close-wallet` command to save the wallet (write the wallet to the disk) and close it, though it automatically saves after important commands, like generating a new address.
```
(wallet.json)(node: https://testnet.instachain.io/) > close-wallet
wallet.json saved                                                 
```

Lastly, you can use the `exit` command to save the wallet and exit the program. Then run `wallet-cli` and `open-wallet` to load the wallet again.
```
(wallet.json)(node: https://testnet.instachain.io/) > exit
wallet.json saved

PS C:\InstaChain\InstaChain\Wallet> python .\wallet-cli.py
InstaChain Wallet v0.1a - CLI
Warning: config.json not found

(no wallet loaded) > open-wallet wallet.json
current_node: https://testnet.instachain.io/

(wallet.json)(node: https://testnet.instachain.io/) >
```

And that's all for this tutorial!
