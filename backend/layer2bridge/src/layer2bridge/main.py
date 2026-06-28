import asyncio
from pathlib import Path
from typing import Dict, List
import os
from layer2bridge import database_interface as DatabaseInterface
from layer2bridge import audit_database_interface as AuditDatabaseInterface
import traceback
from layer2bridge import layer2interface as Layer2Interface
from layer2bridge.full_node_interface import BitcoinRPC
from layer2bridge.onboarding_logger import OnboardingLogger
from config_loader.loader import (
    get_layer2ledgerbridge_config,
    get_env_specific_output_directory,
    resolve_environment,
)
from config_models.models import Layer2BridgeSettings
from openl2_layer2ledger_api.models.requests import (
    Layer1BroadcastedWithdrawalTransaction,
)
from openl2_messaging.constants import SATOSHI_PER_BITCOIN


DEFAULT_WORKING_DIRECTORY = os.path.expanduser('~') + "/.IC/Layer2Bridge/"

DEFAULT_LAYER2BRIDGE_DB_NAME = "layer2Bridge.sqlite"
DEFAULT_AUDIT_DB_NAME = "audit.sqlite"


async def main():
    bridge = Layer2Bridge()
    try:
        await bridge.run()
    except (asyncio.CancelledError, KeyboardInterrupt):
        OnboardingLogger("Termination requested...")
    except Exception as e:
        OnboardingLogger(f"Unexpected error: {e}")
        OnboardingLogger(traceback.format_exc())
    finally:
        bridge.close()
        OnboardingLogger("Bridge closed.")


class Layer2Bridge():
    settings: Layer2BridgeSettings
    database_layer2bridge_full_path: Path
    database_audit_full_path: Path
    layer2BridgeDB: DatabaseInterface.DB = None
    auditDB: AuditDatabaseInterface.AuditDatabaseInterface = None

    def loadConfig(self, environment: str | None = None):
        environment = resolve_environment(environment)
        self.settings = get_layer2ledgerbridge_config(environment)
        self.database_layer2bridge_full_path = get_env_specific_output_directory(environment) / self.settings.database_layer2bridge_name
        self.database_audit_full_path = get_env_specific_output_directory(environment) / (self.settings.database_audit_name or DEFAULT_AUDIT_DB_NAME)

    async def run(self):
        self.loadConfig()

        self.layer2BridgeDB = DatabaseInterface.DB(self.database_layer2bridge_full_path)
        self.layer2BridgeDB.openOrCreateDB()

        self.auditDB = AuditDatabaseInterface.AuditDatabaseInterface(self.database_audit_full_path)

        # start bitcoin full node, or attach if it already started
        self.bitcoinRPC = BitcoinRPC(self.settings.rpc_settings, self.settings.wallet_name)
        self.layer2Interface = Layer2Interface.Layer2Interface(self.settings.layer2_node_url, self.settings.onboarding_signing_private_key)

        wallet_loaded = await self.bitcoinRPC.loadWallet()
        if not wallet_loaded.name:
            OnboardingLogger(f"Error: Wallet could not load. {wallet_loaded.warning}")
            return

        self.lastblockhash = self.layer2BridgeDB.getLastBlockHash()
        self.confirmedTransactionsDict = {} #store all confirmed transactions in memory

        pendingConfirmedTransactions = self.layer2BridgeDB.getAllPendingConfirmedTransactions()
        for trx in pendingConfirmedTransactions:
            self.confirmedTransactionsDict[(trx.transaction_id, trx.transaction_vout, trx.category)] = trx


        while True:
            await self.getConfirmedTransactionsFromNodeAndSaveToDb()
            await self.getPendingWithdrawalsFromLayer2LedgerAndSaveToDb()
            self.getPendingWithdrawalsFromDb()
            await self.sendPendingConfirmedDepositsToLayer2Ledger()
            await self.sendPendingConfirmedWithdrawalsToLayer2Ledger()
            await self.broadcastPendingWithdrawals()
            await self.updateAuditDB()

            await asyncio.sleep(60*1) #sleep 1 mins

    def close(self):
        if self.layer2BridgeDB:
            self.layer2BridgeDB.close()
        if self.auditDB:
            self.auditDB.close()

    async def getConfirmedTransactionsFromNodeAndSaveToDb(self):
        #get confirmed transactions from the node and save it to the db
        try:
            confirmedTransactionsResponse = await self.bitcoinRPC.getConfirmedTransactions(self.lastblockhash)
        except Exception as e:
            OnboardingLogger(f"Error: Could not get confirmed transactions from node. {e}")
            return

        self.lastblockhash = confirmedTransactionsResponse.lastblock
        
        try:
            getBlockHeaderResponse = await self.bitcoinRPC.getBlockHeader(self.lastblockhash)
            self.blockheight = getBlockHeaderResponse.height
        except Exception as e:
            OnboardingLogger(f"Error: Could not get block header from node. {e}")
            return

        OnboardingLogger('Latest blockheight: ' +  str(self.blockheight))
        for confirmedTransaction in confirmedTransactionsResponse.transactions:
            if confirmedTransaction.confirmations >= self.bitcoinRPC.getTargetConfirmations():
                if (confirmedTransaction.txid, confirmedTransaction.vout, confirmedTransaction.category) not in self.confirmedTransactionsDict:
                    confirmedTransactionDbObject = DatabaseInterface.ConfirmedTransaction().fromBitcoinRpcListSinceBlockTransactions(confirmedTransaction)
                    self.confirmedTransactionsDict[(confirmedTransaction.txid, confirmedTransaction.vout, confirmedTransaction.category)] = confirmedTransactionDbObject #add in memory
                    self.layer2BridgeDB.insertConfirmedTransaction(confirmedTransactionDbObject)
        OnboardingLogger("lastblockhash: " + self.lastblockhash)
        self.layer2BridgeDB.setLastBlockHash(self.lastblockhash)

    async def getPendingWithdrawalsFromLayer2LedgerAndSaveToDb(self):
        #get pending withdrawals from the Layer2Ledger, and save it to the db
        lastwithdrawalTimestamp = int(self.layer2BridgeDB.getLastWithdrawalRequestTimestamp())
        pendingWithdrawals: List[DatabaseInterface.PendingWithdrawal] = []
        try:
            response = await self.layer2Interface.getWithdrawalRequests(lastwithdrawalTimestamp)
            if response.error_code == 0:
                for wr in response.withdrawal_requests:
                    withdrawal = DatabaseInterface.PendingWithdrawal(
                        layer2_withdrawal_id=wr.layer2_withdrawal_id,
                        status=int(DatabaseInterface.PendingWithdrawal.Layer1Status.PENDING),
                        transaction_id='',
                        amount=wr.amount,
                        fee=0,
                        destination_address=wr.layer1_address,
                        confirmations=0,
                        withdrawal_requested_timestamp=wr.withdrawal_requested_timestamp,
                        date_broadcasted=0
                    )
                    pendingWithdrawals.append(withdrawal)
        except Exception as e:
            OnboardingLogger(f"Error getting withdrawal requests: {e}")

        for pendingWithdrawal in pendingWithdrawals:
            self.layer2BridgeDB.insertPendingWithdrawal(pendingWithdrawal)

            if(pendingWithdrawal.withdrawal_requested_timestamp > lastwithdrawalTimestamp):
                lastwithdrawalTimestamp = pendingWithdrawal.withdrawal_requested_timestamp
            OnboardingLogger('New withdrawal recieved. address: ' + pendingWithdrawal.destination_address + ' amount: ' + str(pendingWithdrawal.amount))
        self.layer2BridgeDB.setLastWithdrawalTimestamp(lastwithdrawalTimestamp)
    
    def getPendingWithdrawalsFromDb(self) -> None:
        #get pending withdrawals from the db and prepare it to be broadcasted by the node
        self.withdrawalTransactionOutputs: Dict[str, DatabaseInterface.PendingWithdrawal] = {}
        pendingWithdrawals = self.layer2BridgeDB.getPendingWithdrawals()
        OnboardingLogger('Fetched ' + str(len(pendingWithdrawals)) + ' pending withdrawals from db')
        for pendingWithdrawal in pendingWithdrawals:
            #only broadcast if the minimum amount is greater than the minimum withdrawal amount
            minWithdrawalAmount = self.bitcoinRPC.getMinimumTransactionAmount()
            if(pendingWithdrawal.amount >= minWithdrawalAmount):
                self.withdrawalTransactionOutputs[pendingWithdrawal.layer2_withdrawal_id] = pendingWithdrawal
            else:
                OnboardingLogger(f"Skipping withdrawal {pendingWithdrawal.layer2_withdrawal_id} with amount {pendingWithdrawal.amount} because it is less than the minimum withdrawal amount of {minWithdrawalAmount} satoshis")

    async def sendPendingConfirmedDepositsToLayer2Ledger(self):
        #Send pending confirmed deposit transactions to the Layer2Ledger
        pendingConfirmedDepositTransactions = self.layer2BridgeDB.getPendingConfirmedDepositTransactions()
        
        if(len(pendingConfirmedDepositTransactions)):
            try:
                response = await self.layer2Interface.sendConfirmDeposit(pendingConfirmedDepositTransactions)
                if(response.error_code == 0):
                    for trx in response.transactions:
                        error_code = trx.error_code
                        layer1_transaction_id = trx.layer1_transaction_id
                        layer1_transaction_vout = trx.layer1_transaction_vout
                        if(Layer2Interface.SuccessOrDuplicateErrorCode(error_code)):
                            self.layer2BridgeDB.updateConfirmedTransaction(
                                layer1_transaction_id,
                                layer1_transaction_vout,
                                DatabaseInterface.ConfirmedTransaction.Category.RECIEVE.value,
                                int(DatabaseInterface.ConfirmedTransaction.Layer2Status.CONFIRMED),
                            )
                            OnboardingLogger('Deposit confirmation acknowledged by layer2ledger. transaction_id:' + layer1_transaction_id + ' ' + str(layer1_transaction_vout))
            except Exception as e:
                OnboardingLogger(f"Error sending confirmed deposits: {e}")


    async def sendPendingConfirmedWithdrawalsToLayer2Ledger(self):
        #Send pending confirmed withdrawal transactions to the Layer2Ledger
        pendingConfirmedWithdrawalTransactions = self.layer2BridgeDB.getPendingConfirmedWithdrawalTransactions()

        if(len(pendingConfirmedWithdrawalTransactions)):
            try:
                response = await self.layer2Interface.sendConfirmWithdrawal(pendingConfirmedWithdrawalTransactions)
                if(response.error_code == 0):
                    for trx in response.transactions:
                        error_code = trx.error_code
                        layer1_transaction_id = trx.layer1_transaction_id
                        layer1_transaction_vout = trx.layer1_transaction_vout
                        if(Layer2Interface.SuccessOrDuplicateErrorCode(error_code)):
                            self.layer2BridgeDB.updateConfirmedTransaction(
                                layer1_transaction_id,
                                layer1_transaction_vout,
                                DatabaseInterface.ConfirmedTransaction.Category.SEND.value,
                                int(DatabaseInterface.ConfirmedTransaction.Layer2Status.CONFIRMED),
                            )
                            OnboardingLogger('Withdrawal confirmed. transaction_id:' + layer1_transaction_id + ' ' + str(layer1_transaction_vout))
            except Exception as e:
                OnboardingLogger(f"Error sending confirmed withdrawals: {e}")


    async def broadcastPendingWithdrawals(self):
        #Broadcast withdrawal transactions
        lastBroadcastBlockHeight = self.layer2BridgeDB.getLastBroadcastBlockHeight()
        broadcastTransactionBlockDelay = self.layer2BridgeDB.getBroadcastTransactionBlockDelay()
        targetBroadcastBlockheight = lastBroadcastBlockHeight + broadcastTransactionBlockDelay
        OnboardingLogger("lastBroadcastBlockHeight: " + str(lastBroadcastBlockHeight))
        OnboardingLogger("broadcastTransactionBlockDelay: " + str(broadcastTransactionBlockDelay))
        OnboardingLogger("targetBroadcastBlockheight: " + str(targetBroadcastBlockheight))
        if(len(self.withdrawalTransactionOutputs)):
            if self.blockheight >= targetBroadcastBlockheight:
                OnboardingLogger("Broadcasting " +  str(len(self.withdrawalTransactionOutputs)) + " withdrawal outputs")
                try:
                    withdrawalTrxId = await self.bitcoinRPC.broadcastTransaction(self.withdrawalTransactionOutputs)
                    for key, withdrawalOutput in self.withdrawalTransactionOutputs.items():
                        withdrawalOutput.status = int(DatabaseInterface.PendingWithdrawal.Layer1Status.BROADCASTED)
                        self.layer2BridgeDB.updatePendingWithdrawal(withdrawalOutput.layer2_withdrawal_id, withdrawalOutput.status, withdrawalTrxId, 0)
                    
                    bitcoinRpcGetTransactionResponse = await self.bitcoinRPC.getTransaction(withdrawalTrxId)
                    withdrawalOutputs = DatabaseInterface.ConfirmedTransaction.fromBitcoinRpcGetTransactionResponse(bitcoinRpcGetTransactionResponse)
                    
                    withdrawalBroadcastedTransactions = []
                    for key, withdrawalOutput in self.withdrawalTransactionOutputs.items(): # do db writes and layer2 updates in seperate loops
                        output = withdrawalOutputs[withdrawalOutput.destination_address]
                        withdrawalBroadcastedTransactions.append(Layer1BroadcastedWithdrawalTransaction(layer1_transaction_id = withdrawalTrxId, layer1_transaction_vout = output.transaction_vout, layer1_address=withdrawalOutput.destination_address, amount = output.amount, layer2_withdrawal_id = withdrawalOutput.layer2_withdrawal_id, signature = ''))
                    await self.layer2Interface.sendWithdrawalBroadcasted(withdrawalBroadcastedTransactions)
                    self.layer2BridgeDB.setLastBroadcastBlockHeight(self.blockheight)
                except Exception as e:
                    OnboardingLogger(f"Error broadcasting/processing withdrawals: {e}")
            else:
                OnboardingLogger('Batching: waiting for blockheight ' + str(targetBroadcastBlockheight) + ' to broadcast batched transaction. Current blockheight: ' + str(self.blockheight))
        else:
            OnboardingLogger("No withdrawals to broadcast")

    async def updateAuditDB(self):
        #update the auditDB if there is new blockheight
        if(self.blockheight > self.auditDB.getLastAuditBlockHeight()):
            try:
                addressGroupings = await self.bitcoinRPC.getAddressGroupings()
                usedLayer1Addresses: List[AuditDatabaseInterface.AuditLayer1Address] = []
                for addressGrouping in addressGroupings:
                    for address in addressGrouping:
                        usedLayer1Addresses.append(AuditDatabaseInterface.AuditLayer1Address.fromBitcoinRpcListAddressGroupingsAddress(address))
                self.auditDB.addOrUpdateLayer1Addresses(usedLayer1Addresses, self.blockheight, True)

                #get all the layer1 addresses from the auditDB and send it to the node
                layer1Addresses = self.auditDB.getLayer1Addresses()
                layer1AddressesBalance = 0
                for layer1Address in layer1Addresses:
                    layer1AddressesBalance += layer1Address.balance
                await self.layer2Interface.postLayer1AuditReport(self.blockheight, layer1AddressesBalance, layer1Addresses)
            except Exception as e:
                OnboardingLogger(f"Error updating audit DB: {e}")

if __name__ == "__main__":
    asyncio.run(main())
