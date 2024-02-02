import { DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI } from '../services/Layer2API';
import GetBalanceResponse from '../services/messages/GetBalanceResponse';
import GetDepositAddressResponse from '../services/messages/GetDepositAddressResponse';
import { GetNodeInfoResponse } from '../services/messages/GetNodeInfoResponse';

import { GetTransactionsResponse, TransactionGroup, GetTransactionsResponseTransaction } from '../services/messages/GetTransactionsResponse';
import TransferTransactionResponse from '../services/messages/TransferTransactionResponse';
import WithdrawalRequestResponse from '../services/messages/WithdrawalRequestResponse';

import { Workspace } from '../state/Workspace';
const { Wallet, MessageBuilder, Transaction } = require('../utils/wallet');

class WorkspaceStateManager{

    public setWorkspaceState: any;
    public layer2ledgerNodeUrl: string;
    public layer2LedgerAPI: Layer2LedgerAPI;
    public workspace: Workspace;
    public layer2LedgerNodeInfo: Layer2LedgerNodeInfo | null;
    public messageBuilder: typeof MessageBuilder;

    constructor(setWorkspaceState: any, layer2ledgerNodeUrl: string = DEFAULT_LAYER2_HOSTNAME) {
        this.setWorkspaceState = setWorkspaceState;
        this.layer2ledgerNodeUrl = layer2ledgerNodeUrl;
        this.layer2LedgerAPI = new Layer2LedgerAPI(this.layer2ledgerNodeUrl);
        this.layer2LedgerAPI.getNodeInfo(this.onGetNodeInfo.bind(this));
        this.layer2LedgerNodeInfo = null;
        this.workspace = new Workspace(this.layer2ledgerNodeUrl);
    }

    onGetNodeInfo(getNodeInfoResponse: GetNodeInfoResponse){
        this.layer2LedgerNodeInfo = new Layer2LedgerNodeInfo(this.layer2ledgerNodeUrl, '', 0);
        this.layer2LedgerNodeInfo.fromGetNodeInfoResponse(getNodeInfoResponse);
        this.messageBuilder = new MessageBuilder(this.layer2LedgerNodeInfo.layer2LedgerNodeUrl, this.layer2LedgerNodeInfo.layer2LedgerNodeId, this.layer2LedgerNodeInfo.layer2LedgerAssetId);

    }

    newWallet(mneumonic: string){
        this.workspace.wallet = new Wallet(mneumonic);
        this.getTransactions();
        this.getWalletBalance();
    }

    getWalletBalance(){
        let layer2AddressPubKey = this.workspace.wallet.getMainAddress().getPublicKeyString();         

        this.layer2LedgerAPI.getBalance(this.onGetWalletBalance.bind(this), [layer2AddressPubKey]);
    }

    onGetWalletBalance(getBalanceResponse: GetBalanceResponse){
        let addressBalances = new Map<string, number>();
        let balances = getBalanceResponse.balance;
        balances.forEach((balance) => {
            addressBalances.set(balance.public_key, balance.balance);
        });
        this.workspace.addressBalances = addressBalances;
        this.setLatestWorkspaceState();
    }

    transfer(trxId: string, destinationAddress: string, amount: number, fee = 1){
        //console.log("WorkspaceStateManager.transfer" + JSON.stringify(this.workspace));
        let sourceAddress = this.workspace.wallet.getMainAddress();
        //let trxId = this.generateTransactionIdNonce();
        let message = this.messageBuilder.buildTransferMessage(sourceAddress.getPublicKeyString(), destinationAddress, amount, fee, trxId);
        let signature = sourceAddress.signMessage(message);
        //console.log("transfer message: " + message);
        //console.log("transfer signature: " + signature);

        this.layer2LedgerAPI.pushTransaction(this.onTransferTransactionCompleted.bind(this), amount, fee, sourceAddress.getPublicKeyString(), destinationAddress, signature, trxId)
    }

    onTransferTransactionCompleted(transferTransactionResponse: TransferTransactionResponse, trxId: string){


        this.workspace.transactionResults.set(trxId, transferTransactionResponse);
        //console.log("transactionResults: " + JSON.stringify(this.workspace.transactionResults));
        this.setLatestWorkspaceState();
    }

    getDepositAddress(trxId: string){
        let layer2Address = this.workspace.wallet.getMainAddress();
        //let trxId = this.generateTransactionIdNonce();
        let message = this.messageBuilder.buildGetDepositAddressMessage(layer2Address.getPublicKeyString(), trxId);  
        let signature = layer2Address.signMessage(message);

        this.layer2LedgerAPI.getDepositAddress(this.onGetDepositAddress.bind(this), layer2Address.getPublicKeyString(), trxId, signature);
    }

    onGetDepositAddress(getDepositAddressResponse: GetDepositAddressResponse, layer2Address: string, trxId: string){
        //console.log('layer1DepositAddress: ' + layer1DepositAddress);
        this.workspace.depositAddresses.set(layer2Address, getDepositAddressResponse.layer1_deposit_address);
        this.workspace.transactionResults.set(trxId, getDepositAddressResponse);
        this.setLatestWorkspaceState();
    }

    requestWithdrawal(trxId: string, layer1WithdrawalDestinatonAddress: string, amount: number){
        let sourceAddress = this.workspace.wallet.getMainAddress();

        let message = this.messageBuilder.buildWithdrawalRequestMessage(sourceAddress.getPublicKeyString(), layer1WithdrawalDestinatonAddress, trxId, amount);
        let signature = sourceAddress.signMessage(message);
        this.layer2LedgerAPI.requestWithdrawal(this.onWithdrawalRequestCompleted.bind(this), sourceAddress.getPublicKeyString(), layer1WithdrawalDestinatonAddress, amount, trxId, signature);
    }

    onWithdrawalRequestCompleted(withdrawalRequestResponse: WithdrawalRequestResponse, trxId: string){


        this.workspace.transactionResults.set(trxId, withdrawalRequestResponse);
        //console.log("transactionResults: " + JSON.stringify(this.workspace.transactionResults));
        this.setLatestWorkspaceState();
    }

    getTransactions(){
        //console.log("WorkspaceStateManager.getTransactions");
        this.layer2LedgerAPI.getTransactions(this.onGetTransactions.bind(this), [this.workspace.wallet.getMainAddress().getPublicKeyString()]);
    }

    onGetTransactions(getTransactionsResponse: GetTransactionsResponse){
        let transactionGroups = getTransactionsResponse.transactions;
        transactionGroups.forEach((transactionGroup: TransactionGroup) => {
            let layer2Address = transactionGroup.public_key;
            this.workspace.transactions.set(layer2Address, []);

            let addressTransactions = transactionGroup.transactions;
            addressTransactions.forEach((transaction: GetTransactionsResponseTransaction) => {
                let trx = new Transaction();
                trx.fromGetTransactionsResponseTransaction(transaction);
                this.workspace.transactions.get(layer2Address).push(trx);
            })
            this.workspace.transactions.get(layer2Address).sort((a: { timestamp: number; }, b: { timestamp: number; }) => (a.timestamp < b.timestamp) ? 1 : -1)
        });
        this.setLatestWorkspaceState();
    }

    refreshWallet(){
        this.getTransactions();
        this.getWalletBalance();
    }

/*     setWalletState(wallet: string){
        this.setWorkspaceState && this.setWorkspaceState((prevState) => ({ ...prevState, wallet: wallet}));
    } */

/*     setTransactionsState(transactions){
        ////console.log("Setting transactions state");
        //console.log("WorkspaceStateManager setting trx count: " + transactions.length);
        //console.log("WorkspaceStateManager.setTransactionsState: " + JSON.stringify(transactions));
        this.setWorkspaceState && this.setWorkspaceState((prevState) => ({ ...prevState, transactions: transactions }));
    } */

/*     setAddressBalancesState(addressBalances){
        //console.log("WorkspaceStateManager.setAddressBalancesState: " + JSON.stringify(addressBalances));
        this.setWorkspaceState && this.setWorkspaceState((prevState) => ({ ...prevState, addressBalances: addressBalances }));
    } */

    setLatestWorkspaceState(){
        //console.log("WorkspaceStateManager.setLatestWorkspaceState");
        this.setWorkspaceState({
            wallet: this.workspace.wallet,
            transactions: this.workspace.transactions,
            addressBalances: this.workspace.addressBalances,
            transactionResults: this.workspace.transactionResults,
            depositAddresses: this.workspace.depositAddresses
        });
    }

    generateTransactionIdNonce(){
        return Math.random().toString(36).slice(2);
    }
}

export {WorkspaceStateManager};