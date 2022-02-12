import datetime

from wallet import Wallet, Address, DEFAULT_FEE
import random
import threading
import time
import math
import asyncio
from aiohttp import ClientSession

class FunctionalTestHelper:
    walletName = ''
    wallet: Wallet = None
    fee = DEFAULT_FEE

    def __init__(self, _walletName):
        walletName = _walletName
        self.wallet = Wallet()
        self.wallet.open_wallet(walletName)
        self.wallet.update_wallet_balance()

    def getRichestAddress(self):
        highestBalance = 0
        richestAddress = None
        for address_pubkey, address in self.wallet.addresses.items():
            addressBalance = self.wallet.get_address_balance(address_pubkey) 
            if(addressBalance >= highestBalance):
                richestAddress = address.pubkey
                highestBalance = addressBalance
        return richestAddress

    def consolidateBalances(self):
        destinationAddressPubkey = self.getRichestAddress()
        for source_address_pubkey, source_address in self.wallet.addresses.items():
            if(source_address_pubkey != destinationAddressPubkey):
                sourceAddressBalance = self.wallet.get_address_balance(source_address_pubkey)
                if(sourceAddressBalance > 0):
                    self.wallet.transfer(destinationAddressPubkey, source_address_pubkey, sourceAddressBalance)

    async def push_n_trx_async(self, source_address_pubkey, destination_address_pubkey, amount, trx_count, node_url = None):
        t1 = datetime.datetime.now()
        print("source_address_pubkey: " + source_address_pubkey)
        print("destination_address_pubkey: " + destination_address_pubkey)
        print("amount: " + str(amount))
        tasks = []
        if(not node_url):
            node_url = self.wallet.current_node

        transactions = []
        addresses_count = len(self.wallet.addresses)
        async with ClientSession() as session:
            for i in range(trx_count):
                task = asyncio.ensure_future(self.wallet.create_transaction_async(session, destination_address_pubkey, source_address_pubkey, amount))
                tasks.append(task)
            responses = await asyncio.gather(*tasks)
            t2 = datetime.datetime.now()
            delta = t2 - t1
            print(responses)
            print('Total duration: ' + str(delta))

    def TransferAddressToAddress(self):
        sourceAddressPubkey = self.getRichestAddress()
        destinationAddressPubkey = self.wallet.generate_new_address()

        sourceAddress_balance_before = self.wallet.get_address_balance(sourceAddressPubkey, self.wallet.current_node, True)
        transfer_amount = round(sourceAddress_balance_before * 0.30)

        self.wallet.transfer(destinationAddressPubkey, sourceAddressPubkey, transfer_amount)
        sourceAddress_balance_after = self.wallet.get_address_balance(sourceAddressPubkey, self.wallet.current_node, True)
        destAddress_balance_after = self.wallet.get_address_balance(destinationAddressPubkey, self.wallet.current_node, True)
        fee = DEFAULT_FEE

        assert(sourceAddress_balance_after == sourceAddress_balance_before - transfer_amount)
        assert(destAddress_balance_after == transfer_amount - fee)

        # do the same transfer one more time to ensure it works corretly when the receiving address already has a balance
        sourceAddress_balance_before = self.wallet.get_address_balance(sourceAddressPubkey, self.wallet.current_node, True)
        destAddress_balance_before = self.wallet.get_address_balance(destinationAddressPubkey, self.wallet.current_node, True)

        self.wallet.transfer(destinationAddressPubkey, sourceAddressPubkey, transfer_amount)

        sourceAddress_balance_after = self.wallet.get_address_balance(sourceAddressPubkey, self.wallet.current_node, True)
        destAddress_balance_after = self.wallet.get_address_balance(destinationAddressPubkey, self.wallet.current_node, True)

        assert(sourceAddress_balance_after == sourceAddress_balance_before - transfer_amount)
        assert(destAddress_balance_after == destAddress_balance_before + transfer_amount - fee)

    def TransferMultithreadedToSecondAddress(self):
        destinationAddressLabel = "TransferMultithreadedToSecondAddress destinationAddress"
        destinationAddressPubkey = self.wallet.generate_new_address(destinationAddressLabel)
        sourceAddressPubkey = self.getRichestAddress()
        sourceaddress: Address = self.wallet.addresses[sourceAddressPubkey]
        
        sourceAddress_balance = self.wallet.get_address_balance(sourceAddressPubkey, self.wallet.current_node, True)
        destinationAddress_balance = self.wallet.get_address_balance(destinationAddressPubkey, self.wallet.current_node, True)

        transfer_amount = round(sourceAddress_balance * 0.90)
        trx_count = 10

        print("Sending " + sourceAddressPubkey + " -> " + str(transfer_amount) + " " + destinationAddressPubkey)

        loop = asyncio.get_event_loop()
        future = asyncio.ensure_future(self.push_n_trx_async(sourceAddressPubkey, destinationAddressPubkey, transfer_amount, trx_count, self.wallet.current_node))
        loop.run_until_complete(future)

        self.consolidateBalances()

    def TransferMultithreadedSingleAddressToManyAddresses(self, addressCount = 1000):
        addressesToTransferTo = addressCount
        self.consolidateBalances()

        sourceAddressPubkey = self.getRichestAddress()
        sourceAddress_balance = self.wallet.get_address_balance(sourceAddressPubkey, self.wallet.current_node, True)
        transferAmount = round(sourceAddress_balance/addressesToTransferTo)
        
        addressCount = len(self.wallet.addresses)
        if(addressCount < addressesToTransferTo):
            for i in range(addressesToTransferTo - addressCount):
                addressLabel = "TransferMultithreadedToManyAddresses " + str(i)
                self.wallet.generate_new_address(addressLabel)
        addressesToTransferTo: list = list(self.wallet.addresses) #[:(addressesToTransferTo/2)]
        for destinationAddressPubkey in addressesToTransferTo:
            if(destinationAddressPubkey != sourceAddressPubkey):
                self.wallet.transfer(destinationAddressPubkey, sourceAddressPubkey, transferAmount)

    async def TransferMultithreadedManyAddressesToManyAddresses(self, addressCount = 1000, iterations = math.inf):
        addressesToTransferTo = addressCount
        sourceAddressPubkeys: list = list(self.wallet.addresses)[:math.floor(addressesToTransferTo/2)]
        destAddressPubkeys: list = list(self.wallet.addresses)[-math.floor(addressesToTransferTo/2):]

        i = 0
        while(i < iterations):
            trxCount = 0
            resultsTable = dict()
            error_codes = []
            tasks = []
            t1 = datetime.datetime.now()
            async with ClientSession() as session:
                for i in range(0, len(sourceAddressPubkeys)-1):
                    sourceAddressPubkey = sourceAddressPubkeys[i]
                    destAddressPubkey = destAddressPubkeys[i]
                    sourceAddressBalance = self.wallet.get_address_balance(sourceAddressPubkey)
                    if(sourceAddressBalance > 0):
                        task = asyncio.ensure_future(self.wallet.create_transaction_async(session, destAddressPubkey, sourceAddressPubkey, random.randint(round(sourceAddressBalance*0.60), round(sourceAddressBalance*0.90))))
                        tasks.append(task)
                        trxCount += 1
                responses = await asyncio.gather(*tasks)
                t2 = datetime.datetime.now()
                print('Total duration: ' + str(t2-t1))
                print('Transaction/sec: ' +  str(trxCount/((t2-t1).total_seconds())))
                for response in responses:
                    error_code = response["error_code"]
                    resultsTable[error_code] = resultsTable.get(error_code,0)+1

            #swap the source and dest list
            temp = sourceAddressPubkeys
            sourceAddressPubkeys = destAddressPubkeys
            destAddressPubkeys = temp
            i += 1


testHelper = FunctionalTestHelper("wallet.json")
testHelper.TransferAddressToAddress()
#testHelper.TransferMultithreadedToSecondAddress()
#testHelper.consolidateBalances()
#testHelper.TransferMultithreadedSingleAddressToManyAddresses()
quit()

loop = asyncio.get_event_loop()
future = asyncio.ensure_future(testHelper.TransferMultithreadedManyAddressesToManyAddresses())
loop.run_until_complete(future)
quit()