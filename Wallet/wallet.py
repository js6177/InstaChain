import string
import ecdsa
import base58
import json
import string
import random
import hashlib
import time
import math
import connection
import asyncio
import copy
from typing import List
from collections import namedtuple

origin_pubkey = ''

DEFAULT_ELLIPTICAL_CURVE = ecdsa.SECP256k1
DEFAULT_KEY_HASH_FUNCTION = hashlib.sha256
KEY_LENGTH = pow(2,10) # 1024 bit key

DEFAULT_FEE = 1 # 1 satoshi

TRX_TRANSFER = 1  # regular 2nd layer transfer
TRX_DEPOSIT = 2  # when a user deposits btc to a deposit address, then funds get credited to his pubkey
TRX_WITHDRAWAL_INITIATED = 3  # when the user wants to withdraw to a btc address (locks that amount)
TRX_WITHDRAWAL_BROADCASTED = 4 # when the transaction is broadcasted and in the mempool
TRX_WITHDRAWAL_CANCELED = 5  # when the transaction gets removed from the layer1 mempool for any reason
TRX_WITHDRAWAL_CONFIRMED = 6  # when the withdrawal gets confirmed in the layer1 chain
INSTRUCTION_GET_DEPOSIT_ADDRESS = 7 # instruction to get a deposit address

DIRECTION_SENDING = 0
DIRECTION_RECIEVING = 1

#lower 32 bits are used to specify the asset
ASSET_BITCOIN = 1
ASSET_ETHEREUM = 2

ASSET_TESTNET_FLAG = (1 << 32) #bit 32 is the testnet flag
ASSET_STABLECOIN_FLAG = (1 << 33)


# Represents a node in the decentralized network. Each node has it's own ledger,
# and all transactions must belong to a unique node
class Node:
    hostname = ''
    node_id = ''
    name = ''
    asset_id = 0

    def __init__(self, _hostname, _node_id, _name, asset_id = ASSET_BITCOIN|ASSET_TESTNET_FLAG):
        self.hostname = _hostname
        self.node_id = _node_id
        self.name = _name
        self.asset_id = asset_id

    def __dict___(self):
        return vars(self)


class Transaction:
    amount = 0
    fee = DEFAULT_FEE  # will get fees from API
    source_address = ''  # pubkey of the source address, whose corresponding private key signed the message
    destination_address = ''  # pubkey of the destination address
    transaction_type = ''  # can be transfer, deposit, or withdrawal
    transaction_hash = ''  # empty, only used in server for chaining transactions
    transaction_id = ''  # also known as the nonce, a random 32 byte ascii string to prevent the same transaction being processed more than once
    asset_id = 0    # represents the asset that is being transacted, i.e bitcoin
    signature = ''  # the signature of the message (that was signed using the private key that corresponds to the source_address)
    signature_date = ''  #date that the transaction was signed by the sender's private key
    layer1_transaction_id = '' # for deposit/withdrawal, this is the layer 1 transaction id
    node = None

    #These are not part of a transaction, just for bookkeeping purposes and making transaction easier to work with
    direction = None #either sending or receiving

    def fromJSON(self, _node: Node, jsonDict):
        self.amount = jsonDict['amount']
        self.fee = jsonDict['fee']
        self.source_address = jsonDict['source_address_pubkey']
        self.destination_address = jsonDict['destination_address_pubkey']
        self.transaction_type = jsonDict['transaction_type']
        self.transaction_id = jsonDict['transaction_id']
        self.node = _node

    def __hash__(self):
        return hash((self.transaction_id, self.node.node_id))

    def __eq__(self, other):
        return self.__hash__() == other.__hash__()

    #returns a string representing a transaction that can be signed by the source public key to be considered a valid transaction
    def to_spendable_string(self):
        message = self.node.node_id + " " + str(self.node.asset_id) + " " + str(TRX_TRANSFER) + " " + self.source_address + " " + self.destination_address + " " + str(self.amount) + " " + str(self.fee) + " " + self.transaction_id  #+ " " + str(self.signature_date)
        return message

    #for printing
    def __str__(self):
        return json.dumps(self, default= lambda o: o.__dict__)

class Address:
    privkey = ''
    pubkey = ''
    description = ''
    deposit_address = '' #layer1 address, which deposits are credited towards

    #filled in later by wallet:
    balance = 0
    transactions = []

    def to_dict(self):
        return {'pubkey': self.pubkey, 'privkey': self.privkey, 'description': self.description, 'deposit_address': self.deposit_address} #, 'deposit_address': self.deposit_address}

class DepositAddress:
    node_url: string = ''
    layer1_address: string  = ''
    layer2_address: string = ''

    def __init__(self, _node_url, _layer1_address, _layer2_address):
        self.node_url = _node_url
        self.layer1_address = _layer1_address
        self.layer2_address = _layer2_address

    def __dict___(self):
        return vars(self)

class Wallet:
    current_node = ''
    trusted_nodes = dict()
    addresses = dict()
    deposit_addresses = []
    address_balance = dict()
    confirmed_transactions = set()
    name = ''
    path = ''

    def __init__(self):
        self.addresses = dict()
        self.deposit_addresses = []
        self.trusted_nodes = dict()
        name = ''
        path = ''

    def findAddressByDescription(self, description: string):
        foundAddress = None
        for key, address in self.addresses.items():
            if(address.description == description):
                foundAddress = address
                break
        return foundAddress

    def generate_new_address(self, description = ''):
        sk = ecdsa.SigningKey.generate(curve=ecdsa.SECP256k1)
        vk = sk.get_verifying_key()

        urlsafe_pubkey = base58.b58encode(vk.to_string())
        urlsafe_privkey = base58.b58encode(sk.to_string())

        address = Address()
        address.privkey = urlsafe_privkey
        address.pubkey = urlsafe_pubkey
        address.description = description

        key = address.pubkey

        self.addresses[key] = address
        self.save_wallet() #save wallet after 'critical' operations
        print(address.pubkey)
        return key

    def save_wallet(self, print_saved_message = False):
        wallet_dict = {}
        addresses_dict = []
        for key, address in self.addresses.items():
            addresses_dict.append(address.to_dict())
        wallet_dict['addresses'] = addresses_dict
        wallet_dict['deposit_addresses'] = [vars(x) for x in self.deposit_addresses]
        wallet_dict['wallet_name'] = self.name

        wallet_dict['trusted_nodes'] = [vars(x) for key, x in self.trusted_nodes.items()]
        wallet_dict['current_node'] = self.current_node
        f = open(self.path, "w")
        f.write(json.dumps(wallet_dict, indent=4))
        f.close()
        if(print_saved_message):
            print(self.name + " saved")

    def generate_new_wallet(self, wallet_name, node_url = connection.DEFAULT_NODE_HOSTNAME):
        self.name = wallet_name
        self.path = wallet_name
        self.generate_new_address()

        self.add_trusted_node(node_url)
        if(node_url):
            self.current_node = node_url
        self.save_wallet()

    def open_wallet(self, wallet_filename):
        wallet_file = open(wallet_filename, "r")
        self.path = wallet_filename
        body = wallet_file.read()
        body_json = json.loads(body)

        #check for exception if any keys are missing from json file:
        self.name = body_json['wallet_name']
        addresses = body_json['addresses']
        deposit_addresses = body_json.get('deposit_addresses') or []
        trusted_nodes = body_json.get('trusted_nodes') or []
        self.current_node = body_json.get('current_node')

        print('current_node: ' +  self.current_node)

        for trusted_node in trusted_nodes:
            self.trusted_nodes[trusted_node['hostname']] = Node(trusted_node['hostname'], trusted_node['node_id'], trusted_node['name'] )

        if (not self.current_node and len(trusted_nodes)):
            self.current_node = trusted_nodes[0]['hostname']

        for deposit_address in deposit_addresses:
            self.deposit_addresses.append(DepositAddress(deposit_address['node_url'], deposit_address['layer1_address'], deposit_address['layer2_address']))

        for keys in addresses:
            address = Address()
            try:
                address.pubkey = keys['pubkey']
                address.privkey = keys['privkey']
                address.description = keys['description']
                address.deposit_address = keys['deposit_address']
            except:
                pass

            key = address.pubkey
            self.addresses[key] = address

        return body_json

    def add_trusted_node(self, node_url):
        if(node_url):
            node_info_result = connection.getNodeInfo(node_url)
            node = Node(node_url, node_info_result.node_info.node_id, node_info_result.node_info.node_name, node_info_result.node_info.asset_id )
            self.trusted_nodes[node_url] = node

            if(not self.current_node):
                self.current_node = node_url
    
    def clear_cache(self):
        self.address_balance.clear()
        self.confirmed_transactions.clear()
        self.deposit_addresses.clear()
        self.save_wallet()

    @staticmethod
    def sign_string(signing_key, message):
        privkey = ecdsa.SigningKey.from_string(base58.b58decode(signing_key), curve=DEFAULT_ELLIPTICAL_CURVE, hashfunc=DEFAULT_KEY_HASH_FUNCTION)
        signature = base58.b58encode(privkey.sign(message.encode("utf-8")))
        return signature

    def verify_signature(self, message, pubkey, signature, elliptical_curve = DEFAULT_ELLIPTICAL_CURVE, hash_function = DEFAULT_KEY_HASH_FUNCTION):
        print('---verify_signature---')
        print('pubkey', pubkey)
        print('message', message)
        print('signature', signature)
        start_time = time.time()
        verifying_key = ecdsa.VerifyingKey.from_string(base58.b58decode(pubkey), curve=elliptical_curve, hashfunc = hash_function)
        verified = verifying_key.verify(base58.b58decode(signature), message.encode("utf-8"))
        seconds_elapsed = time.time() - start_time
        print('Time (seconds) to verify: ', seconds_elapsed)
        return verified

    @staticmethod
    def generateRandomNonce(length: int):
        return ''.join(random.choice(string.ascii_uppercase + string.ascii_lowercase + string.digits) for _ in range(length))

    def findDepositAddress(self, layer2_address_pubkey, node_url):
        for deposit_address in self.deposit_addresses:
            if(deposit_address.layer2_address == layer2_address_pubkey and deposit_address.node_url == node_url):
                return deposit_address
        return None

    def getTransaction(self, transaction_id, _node_url):
        transactionJSON = connection.getTransaction(_node_url, transaction_id)
        return transactionJSON

    def getDepositAddress(self, address_pubkey, _node_url):
        layer2_address = self.addresses[address_pubkey]
        node_url = _node_url or self.current_node

        layer1_address = None
        deposit_address: DepositAddress = self.findDepositAddress(layer2_address.pubkey, node_url)
        if(deposit_address == None):
            nonce = self.generateRandomNonce(8) #TODO: make const
            #possible todo: check local wallet first
            message = self.trusted_nodes[node_url].node_id + ' ' + str(trx.asset_id) + ' ' + str(INSTRUCTION_GET_DEPOSIT_ADDRESS) + layer2_address.pubkey + ' ' + nonce
            signature = self.sign_string(layer2_address.privkey, message)
            response = connection.getDepositAddress(self.trusted_nodes[node_url].hostname, layer2_address.pubkey, nonce, signature)
            layer1_address = response.layer1_deposit_address
            self.deposit_addresses.append(DepositAddress(node_url, layer1_address, layer2_address.pubkey))
            self.save_wallet()
        else:
            layer1_address = deposit_address.layer1_address
        return layer1_address

    def createWithdrawTransactionRequest(self, source_address_pubkey: string, layer1_withdrawal_address: string, amount: int, _node_url):
        trx = Transaction()
        trx.transaction_id = ''.join(random.choice(string.ascii_uppercase + string.ascii_lowercase + string.digits) for _ in range(32))
        trx.amount = amount
        trx.source_address = source_address_pubkey
        trx.destination_address = layer1_withdrawal_address
        trx.asset_id = self.trusted_nodes[_node_url].asset_id

        address = self.addresses[source_address_pubkey]
        message = self.trusted_nodes[_node_url].node_id + ' ' + str(trx.asset_id) + ' ' + str(TRX_WITHDRAWAL_INITIATED) + ' ' + source_address_pubkey + ' ' + layer1_withdrawal_address + ' ' + trx.transaction_id + ' ' + str(amount)
        trx.signature = Wallet.sign_string(address.privkey, message)
        print('Transaction id: ' + trx.transaction_id)
        return trx

    def withdrawRequest(self, source_address_pubkey: string, layer1_withdrawal_address: string, amount: int, _node_url):
        trx = self.createWithdrawTransactionRequest(source_address_pubkey, layer1_withdrawal_address, amount, _node_url)
        connection.sendWithdrawalRequest(_node_url, source_address_pubkey, layer1_withdrawal_address, amount, trx.transaction_id, trx.signature)

    async def withdrawRequestAsync(self, session, source_address_pubkey: string, layer1_withdrawal_address: string, amount: int, _node_url):
        trx = self.createWithdrawTransactionRequest(source_address_pubkey, layer1_withdrawal_address, amount, _node_url)
        await connection.sendWithdrawalRequestAsync(session, _node_url, source_address_pubkey, layer1_withdrawal_address, amount, trx.transaction_id, trx.signature)

    def push_built_transaction(self, hostname, trx:Transaction):
        connection.pushTransaction(hostname, trx.amount, trx.fee, trx.source_address, trx.destination_address,
                                   trx.signature, trx.transaction_id)

    def transfer(self, destination_address_pubkey, source_address_pubkey, amount, _node_hostname = None):
        node_hostname = _node_hostname or self.current_node

        node = self.trusted_nodes[node_hostname]
        trx = self.create_transaction(destination_address_pubkey, source_address_pubkey, amount, node)
        self.push_built_transaction(node_hostname, trx)

    def create_transaction(self, destination_address_pubkey, source_address_pubkey, amount, node):
        trx = Transaction()
        source_address = self.addresses[source_address_pubkey]
        #TODO add GetSigningKey and GetVerifyingKey with default curve and hashfunc args 
        privkey = ecdsa.SigningKey.from_string(base58.b58decode(source_address.privkey), curve=DEFAULT_ELLIPTICAL_CURVE, hashfunc=DEFAULT_KEY_HASH_FUNCTION)
        pubkey = ecdsa.VerifyingKey.from_string(base58.b58decode(source_address.pubkey), curve=DEFAULT_ELLIPTICAL_CURVE, hashfunc=DEFAULT_KEY_HASH_FUNCTION)

        trx.transaction_id = ''.join(random.choice(string.ascii_uppercase + string.ascii_lowercase + string.digits) for _ in range(32))
        trx.destination_address = destination_address_pubkey
        trx.amount = amount
        trx.source_address = source_address.pubkey
        trx.node = node
        trx.asset_id = node.asset_id

        trx.signature_date = round(time.time()) # date the trx was signed. You can sign a transaction, but push it later

        transaction_str = trx.to_spendable_string() # this will return the transaction in flattened spendable string that the sender will sign
        trx.signature = base58.b58encode(privkey.sign(transaction_str.encode("utf-8")))
        print('Transaction id: ' + trx.transaction_id)
        print('Asset id: ' + hex(trx.asset_id))
        return trx

    async def create_transaction_async(self, session, destination_address_pubkey, source_address_pubkey, amount, _node_hostname = None):
        node_hostname = _node_hostname or self.current_node

        node = self.trusted_nodes[node_hostname]
        trx = self.create_transaction(destination_address_pubkey, source_address_pubkey, amount, node)
        return await connection.pushTransactionAsync(session, node_hostname, trx.amount, trx.fee, trx.source_address, trx.destination_address, trx.signature, trx.transaction_id)


    def update_wallet_balance(self, node_url = None):
        address_list = list(self.addresses.keys())
        self.update_address_balance(address_list, node_url)

    def update_address_balance(self, address_pubkeys: List[str], node_url = None):
        if(node_url):
            #TODO: error checking
            balance_map = json.loads(connection.getAddressBalance(node_url, address_pubkeys))['balance']
            for balance in balance_map:
                self.add_address_balance(node_url, balance['public_key'], balance['balance'])
        else:
            for key, node in self.trusted_nodes.items():
                self.update_address_balance(address_pubkeys, node.hostname)

    def update_wallet_transactions(self):
        address_list = ''
        for key, address in self.addresses.items():
            address_list += address.pubkey + ','
        for key, node in self.trusted_nodes.items():
            self.update_confirmed_transactions(address_list, node.hostname)
        return

    def add_confirmed_transaction(self, trx):
        self.confirmed_transactions.add(trx)

    def add_address_balance(self, node_url, address, balance):
        self.address_balance[(address,node_url)] = balance

    def update_confirmed_transactions(self, address_pubkey, node_url = None):
        #response = json.loads(connection.getAddressTransactions(node_url or self.current_node, address_pubkey), object_hook=lambda d: namedtuple('X', d.keys())(*d.values()))
        response_json = json.loads(connection.getAddressTransactions(node_url or self.current_node, address_pubkey))
        if(int(response_json['error_code']) == connection.ERROR_SUCCESS):
            for addressTransactions in response_json['transactions']:
                transactions_json = addressTransactions['transactions']
                for transaction in transactions_json:
                    trx = Transaction()
                    trx.fromJSON(self.trusted_nodes[node_url], transaction)
                    self.add_confirmed_transaction(trx)

    def get_address_balance(self, address_pubkey, node_url = None, update_balance = False):
        if(update_balance):
            self.update_address_balance([address_pubkey], node_url)
        balance = 0
        if(node_url):
            balance = self.address_balance.get((address_pubkey,node_url),0)
        else:
            for node_url, node in self.trusted_nodes.items():
                balance += self.get_address_balance(address_pubkey, node_url)
        return balance

    def print_wallet_balance(self):
        for key, address in self.addresses.items():
            self.print_address_balance(address.pubkey)

    def print_address_balance(self, address):
        print(address + ': ' + str(self.get_address_balance(address)))

    def print_wallet_transactions(self):
        for key, address in self.addresses.items():
            self.print_address_transactions(address.pubkey)

    def print_address_transactions(self, address):
        print('\nAddress: ' + address)
        data = []
        data.append(["Transaction ID", "Source", "Amount", "Destination"])
        transaction: Transaction
        for transaction in self.confirmed_transactions:
            if(transaction.source_address == address or transaction.destination_address == address):
                source_address = transaction.source_address
                if(transaction.transaction_type == TRX_DEPOSIT):
                    source_address = "DEPOSIT"
                destination_address = transaction.destination_address
                if(transaction.transaction_type == TRX_WITHDRAWAL_INITIATED):
                    destination_address += " (WITHDRAWAL)"

                amount_sign = "-" if (transaction.source_address == address) else "+"
                data.append([transaction.transaction_id, source_address, amount_sign + str(transaction.amount), destination_address])
        for row in data:
            print("{: <50} {: <90} {: <10} {: <50}".format(*row))
