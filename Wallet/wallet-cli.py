import wallet
import json
import shlex
import traceback

DEFAULT_NODE_HOSTNAME = 'https://testnet.instachain.io/'

CONFIG_FILENAME = 'config.json'

COMMANDS_NOT_REQUIRING_WALLET = ['help', 'new_wallet', 'open_wallet', 'exit']

COMMANDS_HELP = {
    'help': ['[command]', 'Displays a help of a command. If no command is given, lists all the commands'],
    'exit': ['', 'Saves and closes any open wallets and exists'],
    'new-wallet': ['<wallet path> [node url]', 'Creates a new wallet file, with 1 address, and connects to the node'],
    'open-wallet': ['<wallet path>', 'Loads a wallet. This wallet is needed for almost all functionality'],
    'close-wallet': ['', 'Safely saves and closes the wallet.'],

    'new-address': ['[label]', 'Generates a new address with an optional label and saves the wallet.'],
    'list-addresses': ['', 'Lists all the pubkeys of addresses in the wallet.'],
    'add-node': ['<node url>', 'Adds a node to the wallet.'],
    'list-nodes': ['', 'List all the nodes of the wallet.'],

    'create-transaction': ['<destination address> <amount> [source address]', 'Creates and signs a transactions. The source address is optional if your wallet only has 1 address. The signed transaction is not broadcasted, instead it is saved as a json and can be broadcasted later'],
    'transfer': ['<destination address> <amount> [source address] [node url]', 'Signs a transaction than broadcasts it, and displayed the return code. The source address is optional if your wallet only has 1 address.'],
    'push-signed-transaction': ['<signed transaction json>', 'Broadcasts a signed transaction'],

    'list-wallet-transactions': ['', 'List all transaction of addresses that belong to the wallet of all nodes'],
    'list-wallet-balance': ['[node]', 'Displays the balance of the wallet (displays the balance of all addresses in your wallet)'],
    'list-address-transactions': ['<address> [node]', 'List all transaction of a specific address. The address does not need to belong to you. If [node] is not specified, it will list the balance of the address from all nodes in your wallet'],
    'list-address-balance': ['<address> [node]', 'Displays the balance of a specific address. If [node] is not specified, it will list the balance of the address from all nodes in your wallet'],

    'get-deposit-address': ['<address> [node]', 'Gets a layer 1 deposit address, whose funds are deposited to your blitz address'],
    'withdraw': ['<layer2 address> <layer1 address> <amount> [node url]', 'Withdraws funds from your layer2 address to the given layer1 address'],

    'view-transaction': ['<transaction id> <node>', 'Displays the transaction information of a transaction id of a node'],
    'clear-cache': ['', 'Clears the local address balances and transactions, so subsequent calls will fetch it from the nodes. Does not clear any existing public or private keys'],
}
#commands = [help, open_wallet, close_wallet, new_address, list_addresses, add_node, list_nodes, create_transaction, transfer, push_signed_transaction, list_wallet_transactions, list_wallet_balance, list_address_transactions, list_address_balance]

credits = """
Special thanks to: 
Jeff Garzik for the python-bitcoinrpc module
Emanuele Bellocchia for the bip_utils module
"""

class WalletCLI():
    wallet_name = None
    wallet = None

    def __init__(self, _wallet_name = None):
        print('InstaChain Wallet v0.1a - CLI')
        self.wallet = None
        self.loadConfig()
        if(_wallet_name):
            self.wallet_name = _wallet_name
            self.wallet = wallet.Wallet()
            self.wallet.open_wallet(self.wallet_name)

    def loadConfig(self):
        try:
            with open(CONFIG_FILENAME) as config_file:
                data = json.load(config_file)
                default_wallet_name = data['default_wallet']
                print(default_wallet_name)
                if(default_wallet_name):
                    self.wallet_name = default_wallet_name
                
        except FileNotFoundError as e:
            print('Warning: ' + CONFIG_FILENAME + ' not found')
        except KeyError as e:
            print('Warning: could not parse config file. JSON parsing error, key not found: ' + str(e))

    def getPromptPrefix(self):
        if(self.wallet):
            return '(' + self.wallet.path + ')(node: ' + self.wallet.current_node + ')'
        else:
            return '(no wallet loaded)'

    #if args[index] exists returns, else returns default
    def getArgument(self, args, index, default = None):
        try:
            return args[index]
        except IndexError:
            return default

    def runCLI(self):
        while(True):
            print(self.getPromptPrefix() + ' >', end =" ")
            args = shlex.split(str(input()))
            if(len(args) > 0):
                cmd = args[0]
                if(cmd not in COMMANDS_HELP):
                    print("command '" + cmd + "' not found. Type 'help' for list of commands")
                    continue
                cmd = cmd.replace('-', '_') #python function names cannot have '-' character
                if(self.wallet == None and cmd not in COMMANDS_NOT_REQUIRING_WALLET):
                    print("Error need to load wallet for this command. Call 'open_wallet' command")
                    continue               
                try:
                    f = getattr(self, cmd)
                    f(args[1:])
                except AttributeError as e:
                    print(traceback.format_exc())
                except Exception as e:
                    print(traceback.format_exc())
            print("")

    def displayCommandHelp(self, command):
        command_info = COMMANDS_HELP[command]
        print(command + ': ' + command_info[0] + ', ' + command_info[1])

    def help(self, args):
        command = self.getArgument(args,0)
        if(command):
            self.displayCommandHelp(command)
        else:
            for key in COMMANDS_HELP:
                self.displayCommandHelp(key)

    def exit(self, args):
        if(self.wallet != None):
            self.close_wallet()
        print(credits)
        exit(0)

    def open_wallet(self, args):
        if(len(args)):
            self.close_wallet()
            if(not self.wallet):
                self.wallet = wallet.Wallet()
            try:
                self.wallet.open_wallet(args[0])
            except Exception as e:
                print(e)
                self.wallet = None
        else:
            print('Usage: open_wallet <wallet path>')

    def new_wallet(self, args):
        wallet_path = args[0]
        node_url = self.getArgument(args, 1) or DEFAULT_NODE_HOSTNAME
        self.close_wallet()
        self.wallet = wallet.Wallet()
        self.wallet.generate_new_wallet(wallet_path, node_url)

    def create_transaction(self, args):
        destination_address = args[0]
        amount = args[1]
        source_address = args[2]
        node_url = self.getArgument(args, 3)
        self.wallet.create_transaction(destination_address, source_address, amount, node_url)

    def transfer(self, args):
        destination_address = args[0]
        amount = args[1]
        source_address = args[2]
        node_url = self.getArgument(args, 3) or self.wallet.current_node
        self.wallet.transfer(destination_address, source_address, amount, node_url)

    def view_transaction(self, args):
        transaction_id = self.getArgument(args, 0)
        node_url = self.getArgument(args, 1) or self.wallet.current_node
        transaction = self.wallet.getTransaction(transaction_id, node_url)
        print(transaction)

    def list_addresses(self, args):
        for address in self.wallet.addresses:
            print(address)

    def list_nodes(self, args):
        for key, node in self.wallet.trusted_nodes.items():
            print(node.__dict___())

    def new_address(self, args):
        label = None
        if(args):
            label = args[0]
        self.wallet.generate_new_address(label)

    def add_node(self, args):
        node_hostname = args[0]
        self.wallet.add_trusted_node(node_hostname)

    def close_wallet(self, args = None):
        if(self.wallet):
            self.wallet.save_wallet(True)
            self.wallet = None
            self.wallet_name = None

    def get_deposit_address(self, args):
        address = args[0]
        node_url = self.getArgument(args, 1) or self.wallet.current_node
        depositAddress = self.wallet.getDepositAddress(address, node_url)
        print(depositAddress)

    def withdraw(self, args):
        address = args[0]
        layer1_withdrawal_address = args[1]
        amount = args[2]
        node_url = self.getArgument(args, 3) or self.wallet.current_node
        self.wallet.withdrawRequest(address, layer1_withdrawal_address, amount, node_url)

    def list_wallet_transactions(self, args):
        self.wallet.update_wallet_transactions()
        self.wallet.print_wallet_transactions()

    def list_wallet_balance(self, args):
        self.wallet.update_wallet_balance()
        self.wallet.print_wallet_balance()

    def list_address_transactions(self, args):
        address = self.getArgument(args,0)
        node_url = self.getArgument(args, 1)
        self.wallet.update_confirmed_transactions(address, node_url or self.wallet.current_node)
        self.wallet.print_address_transactions(address)

    def list_address_balance(self, args):
        address = self.getArgument(args, 0)
        node_url = self.getArgument(args, 1)
        self.wallet.update_address_balance([address], node_url)
        self.wallet.print_address_balance(address)

    def clear_cache(self, args):
        print('Clearing cache...')
        self.wallet.clear_cache()

w = WalletCLI()
w.runCLI()