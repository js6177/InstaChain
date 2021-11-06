import datetime

from wallet import Wallet, DEFAULT_FEE
import random
import threading
import time
import asyncio
from aiohttp import ClientSession

SAMPLE_DEPOSIT_ADDRESS = 'qm69MA3CkMCs8zNznAjZShowgZ2jVug8pCZfNVfnhijYig7RF5ZNMZjVr4t6zr43ZxQCnG5UhDeffMRknWsTvC6'
deposit_signing_key_pubkey = '3vwcEpbUqMTHBzFKeEtFsLZ5fei2P8XHzd1pAoSuoRs35pSAegKGLicSaFhTkjAJBtiqV9VxzGPf3nH8sxg4Jp4n'

FULL_NODE_WALLET_NAME = "full_node_wallet.json"

def create_new_wallet(wallet_name, node_url):
    new_wallet = Wallet()
    new_wallet.generate_new_wallet(wallet_name, node_url)
    #new_wallet.add_trusted_node(node_url)
    new_wallet.save_wallet()
    return new_wallet

def get_wallet_balance(w):
    #w.update_balance()
    #w.update_transactions()
    w.update_balance(SAMPLE_DEPOSIT_ADDRESS)

    print(w.addresses[SAMPLE_DEPOSIT_ADDRESS].balance)

    #w.withdrawRequest()

    w.print_balance()
    #w.print_transactions()
    #print(w.transactions)

def get_deposit_address(w, layer2_address):
    layer1_address = w.getDepositAddress(layer2_address, w.current_node)
    w.save_wallet()
    return layer1_address

def depositFunds(w, layer2_address, amount, node_url = None):
    full_node_wallet = Wallet()
    full_node_wallet.open_wallet(FULL_NODE_WALLET_NAME)
    #get_deposit_address(w)
    #this function will only be called from a full node
    #37XuVSEpWW4trkfmvWzegTHQt7BdktSKUs
    #deposit_to_address = SAMPLE_DEPOSIT_ADDRESS
    #w.update_address_balance(layer2_address)
    #print(w.addresses[deposit_to_address].balance)
    #deposit_address = w.addresses[SAMPLE_DEPOSIT_ADDRESS].deposit_address #'37XuVSEpWW4trkfmvWzegTHQt7BdktSKUs'
    deposit_address = w.findDepositAddress(layer2_address, node_url or w.current_node).layer1_address
    print('depositing to layer2 address: ' + layer2_address)
    print('depositing to layer1 address: ' + deposit_address)
    signing_key_address = deposit_signing_key_pubkey
    full_node_wallet.depositFunds(signing_key_address, deposit_address, amount, w.current_node)
    #w.update_address_balance(layer2_address)
    #print(w.addresses[deposit_to_address].balance)

def push_n_trx(w, trx_count = 10):
    transactions = []
    addresses_count = len(w.addresses)
    for i in range(trx_count):
        payable_address, address = random.choice(list(w.addresses.items()))
        #destination_address = random.randint(1, addresses_count-1)
        #source_address = random.randint(1, addresses_count-1)
        amount = random.randint(10, 1000)
        #trx = w.create_transaction(w.addresses[destination_address].get_payable_address(), w.addresses[source_address], amount)
        #asyncio.run(w.create_transaction(payable_address, address, amount))
        trx = w.transfer(payable_address, SAMPLE_DEPOSIT_ADDRESS, amount)
        transactions.append(trx)

def create_n_trx(w, trx_count = 10):
    transactions = []
    addresses_count = len(w.addresses)
    for i in range(trx_count):
        payable_address, address = random.choice(list(w.addresses.items()))
        #destination_address = random.randint(1, addresses_count-1)
        #source_address = random.randint(1, addresses_count-1)
        amount = random.randint(10, 1000)
        #trx = w.create_transaction(w.addresses[destination_address].get_payable_address(), w.addresses[source_address], amount)
        #asyncio.run(w.create_transaction(payable_address, address, amount))
        trx = w.create_transaction(payable_address, SAMPLE_DEPOSIT_ADDRESS, amount)
        #trx_dict = trx.__str__()
        print(trx)
        transactions.append(trx)

def withdrawFromAddress(w, layer1_withdrawal_address = 'tb1qfleu7fchf8c762fezw80f4vzuxm5xryq5u0j95', layer2_withdraw_from_address = 'BeX78KTvMJ2b8UVj6CHmaZ3JEg3yjPov1f3HMbDqAhhp'):
    
    w.update_address_balance(layer2_withdraw_from_address)
    print(w.get_address_balance(layer2_withdraw_from_address))
    #source_address = ''
    #get_wallet_balance(w)
    #w.withdrawRequest(withdraw_from, withdrawal_address, 10)
    w.withdrawRequest(layer2_withdraw_from_address, layer1_withdrawal_address, 12, w.current_node)

    w.update_address_balance(layer2_withdraw_from_address)
    print(w.get_address_balance(layer2_withdraw_from_address))
    #for i in range(20):
    #    Wallet.withdrawRequest(w, w.addresses[i], withdrawal_address, 10)

def pushTrxMultithreaded(w):
    threads = list()
    for i in range(10):
        x = threading.Thread(target=push_100_trx, args=(w,))
        threads.append(x)
        x.start()

    for index, thread in enumerate(threads):
        thread.join()



async def withdraw_n_trx_async(w: Wallet, source_address_pubkey, layer1_withdrawal_address, amount, trx_count, node_url):
    t1 = datetime.datetime.now()
    tasks = []

    transactions = []
    addresses_count = len(w.addresses)
    async with ClientSession() as session:
        for i in range(trx_count):
            task = asyncio.ensure_future(w.withdrawRequestAsync(session, source_address_pubkey, layer1_withdrawal_address, amount, node_url))
            tasks.append(task)
        responses = await asyncio.gather(*tasks)
        t2 = datetime.datetime.now()
        delta = t2 - t1
        print(responses)
        print('Total duration: ' + str(delta))


async def run(w):
    loop = asyncio.get_event_loop()
    future = asyncio.ensure_future(push_100_trx_async(w))
    loop.run_until_complete(future)


def DepositCheckBalance():
    description = "Generate a new address, and deposit 100 sats into it. Then check balance to see if it deposited"
    deposit_amount = 100
    w = Wallet()
    w.open_wallet('nodeapi_test5.json')
    new_address = w.generate_new_address('DepositCheckBalance AddressA' + str(random.randint(10, 1000)))

    new_address_balance = w.get_address_balance(new_address, w.current_node, True)
    print("new_address_balance: " + str(new_address_balance))

    layer1_address = w.getDepositAddress(new_address, w.current_node)
    depositFunds(w, new_address, deposit_amount)

    new_address_balance = w.get_address_balance(new_address, w.current_node, True)
    print("new_address_balance: " + str(new_address_balance))

    assert new_address_balance == deposit_amount

def DepositTransferCheckBalance():
    description = "Generate a new address, and deposit 100 sats into it. Then transfer to another address, and check balance of both addresses"
    deposit_amount = 100
    transfer_amount = 10
    fee = DEFAULT_FEE
    w = Wallet()
    w.open_wallet('nodeapi_test5.json')
    addressA = w.generate_new_address('DepositTransferCheckBalance AddressA' + str(random.randint(10, 1000)))

    addressA_balance = w.get_address_balance(addressA, w.current_node, True)
    print("addressA balance: " + str(addressA_balance))

    layer1_address = w.getDepositAddress(addressA, w.current_node)
    depositFunds(w, addressA, deposit_amount)

    addressA_balance = w.get_address_balance(addressA, w.current_node, True)
    print("addressA balance: " + str(addressA_balance))

    assert addressA_balance == deposit_amount

    addressB = w.generate_new_address('DepositTransferCheckBalance AddressB' + str(random.randint(10, 1000)))

    w.transfer(addressB, addressA, transfer_amount, None)
    addressA_balance = w.get_address_balance(addressA, w.current_node, True)
    addressB_balance = w.get_address_balance(addressB, w.current_node, True)

    print("addressA balance: " + str(addressA_balance))
    print("addressB balance: " + str(addressB_balance))
    
    assert addressA_balance == deposit_amount - transfer_amount
    assert addressB_balance == transfer_amount - fee

def DepositTransferCheckBalanceMultithreaded():
    description = "Generate a new address, and deposit 100 sats into it. Then assynchronously transfer 90 sats to another address, and repeat the transaction 10 times. Check balance of both addresses. Only 1 transaction should have happened."
    deposit_amount = 100
    transfer_amount = 10
    fee = DEFAULT_FEE
    w = Wallet()
    w.open_wallet('nodeapi_test5.json')
    addressA = w.generate_new_address('DepositTransferCheckBalance AddressA' + str(random.randint(10, 1000)))

    addressA_balance = w.get_address_balance(addressA, w.current_node, True)
    print("addressA balance: " + str(addressA_balance))

    layer1_address = w.getDepositAddress(addressA, w.current_node)
    depositFunds(w, addressA, deposit_amount)

    addressA_balance = w.get_address_balance(addressA, w.current_node, True)
    print("addressA balance: " + str(addressA_balance))

    assert addressA_balance == deposit_amount

    addressB = w.generate_new_address('DepositTransferCheckBalance AddressB' + str(random.randint(10, 1000)))

    loop = asyncio.get_event_loop()
    future = asyncio.ensure_future(push_n_trx_async(w, addressA, addressB, transfer_amount, 10, w.current_node))
    loop.run_until_complete(future)

    w.transfer(addressB, addressA, transfer_amount, None)
    addressA_balance = w.get_address_balance(addressA, w.current_node, True)
    addressB_balance = w.get_address_balance(addressB, w.current_node, True)

    print("addressA balance: " + str(addressA_balance))
    print("addressB balance: " + str(addressB_balance))
    
    assert addressA_balance == deposit_amount - transfer_amount
    assert addressB_balance == transfer_amount - fee

def DepositWithdrawalCheckBalance():
    description = "Generate a new address, and deposit 100 sats into it. Then withdraw 10 sats from it and check balance"
    deposit_amount = 100
    withdrawal_amount = 10
    withdrawal_fee = 0
    w = Wallet()
    w.open_wallet('nodeapi_test5.json')
    addressA = w.generate_new_address('DepositTransferCheckBalance AddressA' + str(random.randint(10, 1000)))

    addressA_balance = w.get_address_balance(addressA, w.current_node, True)
    print("addressA balance: " + str(addressA_balance))

    layer1_address = w.getDepositAddress(addressA, w.current_node)
    depositFunds(w, addressA, deposit_amount)

    addressA_balance = w.get_address_balance(addressA, w.current_node, True)
    print("addressA balance: " + str(addressA_balance))

    assert addressA_balance == deposit_amount

    w.withdrawRequest(addressA, 'some_layer1_address', withdrawal_amount, w.current_node)
    addressA_balance = w.get_address_balance(addressA, w.current_node, True)
    print("addressA balance: " + str(addressA_balance))
    assert addressA_balance == deposit_amount - withdrawal_amount - withdrawal_fee

def DepositWithdrawalCheckBalanceAsync():
    description = "Generate a new address, and deposit 100 sats into it. Then withdraw 10 sats from it multiple times, and make sure it only withdrew once"
    deposit_amount = 100
    withdrawal_amount = 90
    withdrawal_fee = 0
    w = Wallet()
    w.open_wallet('nodeapi_test5.json')
    addressA = w.generate_new_address('DepositTransferCheckBalance AddressA' + str(random.randint(10, 1000)))

    addressA_balance = w.get_address_balance(addressA, w.current_node, True)
    print("addressA balance: " + str(addressA_balance))

    layer1_address = w.getDepositAddress(addressA, w.current_node)
    depositFunds(w, addressA, deposit_amount)

    addressA_balance = w.get_address_balance(addressA, w.current_node, True)
    print("addressA balance: " + str(addressA_balance))

    assert addressA_balance == deposit_amount

    loop = asyncio.get_event_loop()
    future = asyncio.ensure_future(withdraw_n_trx_async(w, addressA, 'some_layer1_address', withdrawal_amount, 10, w.current_node))
    loop.run_until_complete(future)

    #w.withdrawRequest(addressA, 'some_layer1_address', withdrawal_amount, w.current_node)
    addressA_balance = w.get_address_balance(addressA, w.current_node, True)
    print("addressA balance: " + str(addressA_balance))
    assert addressA_balance == deposit_amount - withdrawal_amount - withdrawal_fee




def TestSendTransactionsToMany(walletName = 'w.json', transactionCount = 1, sourceAddress = 'T34PvmuSYujm1Xpx5hwyFJtR6MZyjCLoLkAP7Rnx7bJmtWZuJ8NXh4zsqmAqZYk6uVoagCXYtW2Y4uaRjbEPzyA'):
    trxCount = 0
    w = Wallet()
    w.open_wallet('w.json')
    w.update_wallet_balance()
    addressCount = len(w.addresses)
    addressList = list(w.addresses.items())
    for i in range(transactionCount):
        destinationAddress = sourceAddress
        while(destinationAddress == sourceAddress):
            destinationAddress, _ = random.choice(addressList)
        w.transfer(destinationAddress, sourceAddress, random.randint(100,9999))
        trxCount += 1
    return trxCount

def ConsolidateTransactionsToAddress(walletName = 'w.json', destinationAddress = 'T34PvmuSYujm1Xpx5hwyFJtR6MZyjCLoLkAP7Rnx7bJmtWZuJ8NXh4zsqmAqZYk6uVoagCXYtW2Y4uaRjbEPzyA'):
    trxCount = 0
    w = Wallet()
    w.open_wallet('w.json')
    w.update_wallet_balance()

    for sourceAddress, _ in w.addresses.items():
        amount = 0
        if(sourceAddress != destinationAddress):
            amount = w.get_address_balance(sourceAddress)

        w.transfer(destinationAddress, sourceAddress, amount)
        trxCount += 1
    return trxCount

async def TestSendTransactionsToManyAsync(walletName = 'w.json', transactionCount = 1, sourceAddress = 'T34PvmuSYujm1Xpx5hwyFJtR6MZyjCLoLkAP7Rnx7bJmtWZuJ8NXh4zsqmAqZYk6uVoagCXYtW2Y4uaRjbEPzyA'):
    t1 = datetime.datetime.now()
    trxCount = 0
    w = Wallet()
    w.open_wallet('w.json')
    w.update_wallet_balance()
    addressCount = len(w.addresses)
    addressList = list(w.addresses.items())
    resultsTable = dict()
    error_codes = []
    tasks = []
    async with ClientSession() as session:
        for i in range(transactionCount):
            destinationAddress = sourceAddress
            while(destinationAddress == sourceAddress):
                destinationAddress, _ = random.choice(addressList)
            task = asyncio.ensure_future(w.create_transaction_async(session, destinationAddress, sourceAddress, random.randint(100,9999)))
            tasks.append(task)
            trxCount += 1
        responses = await asyncio.gather(*tasks)
        t2 = datetime.datetime.now()
        print('Total duration: ' + str(t2-t1))
        #print(responses)
        for response in responses:
            error_code = response["error_code"]
            resultsTable[error_code] = resultsTable.get(error_code,0)+1
    print(resultsTable)
    return trxCount

async def TestSendTransactionToWalletAsync(sourceWalletName, destWalletName, count):
    
    trxCount = 0
    sourceWallet = Wallet()
    sourceWallet.open_wallet(sourceWalletName)
    sourceWallet.update_wallet_balance()

    destWallet = Wallet()
    destWallet.open_wallet(destWalletName)
    destWallet.update_wallet_balance()

    sourceWalletAddressCount = len(sourceWallet.addresses)
    destWalletAddressCount = len(destWallet.addresses)

    sourceWalletAddressList = list(sourceWallet.addresses.keys())
    destWalletAddressList = list(destWallet.addresses.keys())

    resultsTable = dict()
    error_codes = []
    tasks = []
    sendToSameAddressOnce = True
    addressesSentTo = set()
    t1 = datetime.datetime.now()
    async with ClientSession() as session:
        for sourceAddress in sourceWalletAddressList:
            if(sourceWallet.get_address_balance(sourceAddress) > 0):
                destinationAddress = random.choice(destWalletAddressList)
                alreadySent = (destinationAddress in addressesSentTo)
                addressesSentTo.add(destinationAddress)
                if(not sendToSameAddressOnce or not alreadySent):      
                    task = asyncio.ensure_future(sourceWallet.create_transaction_async(session, destinationAddress, sourceAddress, random.randint(100, 999)))
                    tasks.append(task)
                    trxCount += 1
        responses = await asyncio.gather(*tasks)
        t2 = datetime.datetime.now()
        print('Total duration: ' + str(t2-t1))
        print('Transaction/sec: ' +  str(trxCount/((t2-t1).total_seconds())))
        #print(responses)
        for response in responses:
            error_code = response["error_code"]
            resultsTable[error_code] = resultsTable.get(error_code,0)+1
    print(resultsTable)
    sourceWallet.save_wallet()
    destWallet.save_wallet()
    return trxCount

async def push_n_trx_async(w: Wallet, source_address_pubkey, destination_address_pubkey, amount, trx_count, node_url = None):
    t1 = datetime.datetime.now()
    print("source_address_pubkey: " + source_address_pubkey)
    print("destination_address_pubkey: " + destination_address_pubkey)
    print("amount: " + str(amount))
    tasks = []
    if(not node_url):
        node_url = w.current_node

    transactions = []
    addresses_count = len(w.addresses)
    async with ClientSession() as session:
        for i in range(trx_count):
            task = asyncio.ensure_future(w.create_transaction_async(session, destination_address_pubkey, source_address_pubkey, amount))
            tasks.append(task)
        responses = await asyncio.gather(*tasks)
        t2 = datetime.datetime.now()
        delta = t2 - t1
        print(responses)
        print('Total duration: ' + str(delta))

def createAddresses(walletName, addressCount):
    w = Wallet()
    w.open_wallet(walletName)
    for i in range(addressCount):
        w.generate_new_address()
    w.save_wallet()

if(False):
    createAddresses('w.json', 500)
    createAddresses('w2.json', 500)
    quit()

trxCount = 0
sendingWallet = 'w.json'
recievingWallet = 'w2.json'
if(False):
    trxCount += TestSendTransactionsToMany('w.json', 500)
while(True):
    #trxCount += ConsolidateTransactionsToAddress()
    loop = asyncio.get_event_loop()
    future = asyncio.ensure_future(TestSendTransactionToWalletAsync(sendingWallet, recievingWallet, 500))
    loop.run_until_complete(future)
    temp = sendingWallet
    sendingWallet = recievingWallet
    recievingWallet = temp 
    
    print("Total transaction count: " +  str(trxCount))
#ConsolidateTransactionsToAddress()
quit()

#DepositCheckBalance()
#DepositTransferCheckBalance()
#DepositWithdrawalCheckBalance()
#DepositTransferCheckBalanceMultithreaded()

#TODO:
'''
deposit
transfer
async transfer
withdrawal
'''