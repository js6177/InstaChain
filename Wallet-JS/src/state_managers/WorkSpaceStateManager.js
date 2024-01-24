import {DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI} from '../services/Layer2API';
import { Workspace } from '../state/Workspace';
import { Wallet, MessageBuilder, Transaction } from '../utils/wallet'

class WorkspaceStateManager{
    constructor(setWorkspaceState, layer2ledgerNodeUrl = DEFAULT_LAYER2_HOSTNAME){
        this.setWorkspaceState = setWorkspaceState;
        this.layer2ledgerNodeUrl = layer2ledgerNodeUrl;
        this.layer2LedgerAPI = new Layer2LedgerAPI(this.layer2ledgerNodeUrl);
        this.layer2LedgerAPI.getNodeInfo(this.onGetNodeInfo.bind(this));
        this.workspace = new Workspace(this.layer2ledgerNodeUrl);
    }

    onGetNodeInfo(data){
        console.log("WorkspaceStateManager.onGetNodeInfo");
        this.layer2LedgerNodeInfo = new Layer2LedgerNodeInfo(this.layer2ledgerNodeUrl, '', 0);
        this.layer2LedgerNodeInfo.fromJSON(data);
        this.messageBuilder = new MessageBuilder(this.layer2LedgerNodeInfo.layer2LedgerNodeUrl, this.layer2LedgerNodeInfo.layer2LedgerNodeId, this.layer2LedgerNodeInfo.layer2LedgerAssetId);

    }

    newWallet(mneumonic){
        this.workspace.wallet = new Wallet(mneumonic);
        this.getTransactions();
        this.getWalletBalance();
    }

    getWalletBalance(){
        let layer2AddressPubKey = this.workspace.wallet.getMainAddress().getPublicKeyString();         

        this.layer2LedgerAPI.getBalance(this.onGetWalletBalance.bind(this), [layer2AddressPubKey]);
    }

    onGetWalletBalance(data){
        let body = JSON.parse(JSON.stringify(data, null, 2));
        console.log("onGetWalletBalance: " + JSON.stringify(body));
        let balances = body['balance'];
        balances.forEach(balanceObject => {
            let layer2AddressPubKey = balanceObject['public_key'];
            let balance = balanceObject['balance'];
            this.workspace.addressBalances[layer2AddressPubKey] = balance;
        })
        console.log("Wallet balances: " + JSON.stringify(this.workspace.addressBalances));
        this.setLatestWorkspaceState();
    }

    transfer(trxId, destinationAddress, amount, fee = 1){
        console.log("WorkspaceStateManager.transfer" + JSON.stringify(this.workspace));
        let sourceAddress = this.workspace.wallet.getMainAddress();
        //let trxId = this.generateTransactionIdNonce();
        let message = this.messageBuilder.buildTransferMessage(sourceAddress.getPublicKeyString(), destinationAddress, amount, fee, trxId);
        let signature = sourceAddress.signMessage(message);
        console.log("transfer message: " + message);
        console.log("transfer signature: " + signature);

        this.layer2LedgerAPI.pushTransaction(this.onTransferTransactionCompleted.bind(this), amount, fee, sourceAddress.getPublicKeyString(), destinationAddress, signature, trxId)
    }

    onTransferTransactionCompleted(data, trxId){
        console.log("onTransferTransactionCompleted" +  JSON.stringify(data));

        let body = JSON.parse(JSON.stringify(data, null, 2));

        this.workspace.transactionResults[trxId] = body;
        console.log("transactionResults: " + JSON.stringify(this.workspace.transactionResults));
        this.setLatestWorkspaceState();
    }

    getDepositAddress(trxId){
        let layer2Address = this.workspace.wallet.getMainAddress();
        //let trxId = this.generateTransactionIdNonce();
        let message = this.messageBuilder.buildGetDepositAddressMessage(layer2Address.getPublicKeyString(), trxId);  
        let signature = layer2Address.signMessage(message);

        this.layer2LedgerAPI.getDepositAddress(this.onGetDepositAddress.bind(this), layer2Address.getPublicKeyString(), trxId, signature);
    }

    onGetDepositAddress(data, layer2Address, trxId){
        let body = JSON.parse(JSON.stringify(data, null, 2));
        let layer1DepositAddress = body['layer1_deposit_address'];
        console.log('layer1DepositAddress: ' + layer1DepositAddress);
        this.workspace.depositAddresses[layer2Address] = layer1DepositAddress;
        this.workspace.transactionResults[trxId] = body;
        this.setLatestWorkspaceState();
    }

    requestWithdrawal(trxId, layer1WithdrawalDestinatonAddress, amount){
        let sourceAddress = this.workspace.wallet.getMainAddress();

        //let trxId = this.generateTransactionIdNonce();
        let message = this.messageBuilder.buildWithdrawalRequestMessage(sourceAddress.getPublicKeyString(), layer1WithdrawalDestinatonAddress, trxId, amount);
        let signature = sourceAddress.signMessage(message);
        this.layer2LedgerAPI.requestWithdrawal(this.onWithdrawalRequestCompleted.bind(this), sourceAddress.getPublicKeyString(), layer1WithdrawalDestinatonAddress, amount, trxId, signature);
    }

    onWithdrawalRequestCompleted(data, trxId){
        console.log("onWithdrawalRequestCompleted: " +  JSON.stringify(data));

        let body = JSON.parse(JSON.stringify(data, null, 2));

        this.workspace.transactionResults[trxId] = body;
        console.log("transactionResults: " + JSON.stringify(this.workspace.transactionResults));
        this.setLatestWorkspaceState();
    }

    getTransactions(){
        console.log("WorkspaceStateManager.getTransactions");
        this.layer2LedgerAPI.getTransactions(this.onGetTransactions.bind(this), [this.workspace.wallet.getMainAddress().getPublicKeyString()]);
    }

    onGetTransactions(data){
        let body = JSON.parse(JSON.stringify(data, null, 2));

        let transactions = body['transactions'];
        transactions.forEach(layer2Address => {
            let address = layer2Address['public_key'];
            this.workspace.transactions[address] = []

            let addressTransactions = layer2Address['transactions'];
            addressTransactions.forEach(transaction => {
                let trx = new Transaction();
                trx.fromJSON(transaction);
                this.workspace.transactions[address].push(trx);
            })
            this.workspace.transactions[address].sort((a, b) => (a.timestamp < b.timestamp) ? 1 : -1)
        });
        this.setLatestWorkspaceState();
    }

    refreshWallet(){
        this.getTransactions();
        this.getWalletBalance();
    }

    setWalletState(wallet){
        this.setWorkspaceState && this.setWorkspaceState((prevState) => ({ ...prevState, wallet: wallet}));
    }

    setTransactionsState(transactions){
        //console.log("Setting transactions state");
        console.log("WorkspaceStateManager setting trx count: " + transactions.length);
        console.log("WorkspaceStateManager.setTransactionsState: " + JSON.stringify(transactions));
        this.setWorkspaceState && this.setWorkspaceState((prevState) => ({ ...prevState, transactions: transactions }));
    }

    setAddressBalancesState(addressBalances){
        console.log("WorkspaceStateManager.setAddressBalancesState: " + JSON.stringify(addressBalances));
        this.setWorkspaceState && this.setWorkspaceState((prevState) => ({ ...prevState, addressBalances: addressBalances }));
    }

    setLatestWorkspaceState(){
        console.log("WorkspaceStateManager.setLatestWorkspaceState");
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