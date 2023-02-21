import {DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI} from './Layer2API';
import {Wallet, MessageBuilder, Transaction} from './wallet'
import {v4 as uuidv4} from 'uuid';

class Workspace{
    constructor(layer2ledgerNodeUrl){
        this.layer2ledgerNodeUrl = DEFAULT_LAYER2_HOSTNAME;
        this.layer2LedgerAPI = new Layer2LedgerAPI(layer2ledgerNodeUrl);
        this.layer2LedgerAPI.getNodeInfo(this);
        this.transactions = new Map();
        this.balances = new Map();

        this.onGetBalanceCallback = null;
        this.onGetTransactionsCallback = null;
        this.onTransferTransactionCompletedCallback = null;
    }

    // functions that enable sending messages to the UI to be rendered
    setUiCallbacks(onGetBalanceCallback, onGetTransactionsCallback, onTransferTransactionCompletedCallback, onGetDepositAddressCompletedCallback, onWithdrawalTransactionCompletedCallback){
        this.onGetBalanceCallback = onGetBalanceCallback;
        this.onGetTransactionsCallback = onGetTransactionsCallback;
        this.onTransferTransactionCompletedCallback = onTransferTransactionCompletedCallback;
        this.onGetDepositAddressCompletedCallback = onGetDepositAddressCompletedCallback;
        this.onWithdrawalTransactionCompletedCallback = onWithdrawalTransactionCompletedCallback;

        console.log("setUiCallbacks  onTransferTransactionCompletedCallback" + this.onTransferTransactionCompletedCallback);
        console.log("setUiCallbacks  foo" + this.foo);

        console.log("Workspace.this" +  JSON.stringify(this));
    }

    onGetNodeInfo(data){
        console.log("Workspace.onGetNodeInfo");
        this.layer2LedgerNodeInfo = new Layer2LedgerNodeInfo(this.layer2ledgerNodeUrl, '', 0);
        this.layer2LedgerNodeInfo.fromJSON(data);
        this.messageBuilder = new MessageBuilder(this.layer2LedgerNodeInfo.layer2LedgerNodeUrl, this.layer2LedgerNodeInfo.layer2LedgerNodeId, this.layer2LedgerNodeInfo.layer2LedgerAssetId);
    }

    newWallet(mneumonic){
        this.wallet = new Wallet(mneumonic);
    }

    getBalance(_layer2AddressPubKey = null){
        let layer2AddressPubKey = _layer2AddressPubKey;
        if(layer2AddressPubKey == null){
            layer2AddressPubKey = this.wallet.getMainAddress().getPublicKeyString();         
        }

        this.layer2LedgerAPI.getBalance(this.onGetBalance.bind(this), [layer2AddressPubKey]);
    }

    transfer(destinationAddress, amount, fee = 1){
        let sourceAddress = this.wallet.getMainAddress();
        let trxId = this.generateTransactionIdNonce();
        let message = this.messageBuilder.buildTransferMessage(sourceAddress.getPublicKeyString(), destinationAddress, amount, fee, trxId);
        let signature = sourceAddress.signMessage(message);
        console.log("transfer message: " + message);
        console.log("transfer signature: " + signature);

        this.layer2LedgerAPI.pushTransaction(this.onTransferTransactionCompleted.bind(this), amount, fee, sourceAddress.getPublicKeyString(), destinationAddress, signature, trxId)

    }

    requestWithdrawal(layer1WithdrawalDestinatonAddress, amount){
        let sourceAddress = this.wallet.getMainAddress();

        let trxId = this.generateTransactionIdNonce();
        let message = this.messageBuilder.buildWithdrawalRequestMessage(sourceAddress.getPublicKeyString(), layer1WithdrawalDestinatonAddress, trxId, amount);
        let signature = sourceAddress.signMessage(message);
        this.layer2LedgerAPI.requestWithdrawal(this.onWithdrawalRequestCompleted.bind(this), sourceAddress.getPublicKeyString(), layer1WithdrawalDestinatonAddress, amount, trxId, signature);
    }

    onWithdrawalRequestCompleted(data){
        console.log("onWithdrawalRequestCompleted: " +  JSON.stringify(data));

        let body = JSON.parse(JSON.stringify(data, null, 2));
        this.onWithdrawalTransactionCompletedCallback(Layer2LedgerAPI.getErrorCode(body), Layer2LedgerAPI.getErrorMessage(body));
    }

    getDepositAddress(){
        let layer2Address = this.wallet.getMainAddress();
        let trxId = this.generateTransactionIdNonce();
        let message = this.messageBuilder.buildGetDepositAddressMessage(layer2Address.getPublicKeyString(), trxId);  
        let signature = layer2Address.signMessage(message);

        this.layer2LedgerAPI.getDepositAddress(this.onGetDepositAddress.bind(this), layer2Address.getPublicKeyString(), trxId, signature);
    }

    onGetDepositAddress(data){
        let body = JSON.parse(JSON.stringify(data, null, 2));
        let layer1DepositAddress = body['layer1_deposit_address']
        console.log('layer1DepositAddress: ' + layer1DepositAddress)
        this.onGetDepositAddressCompletedCallback(Layer2LedgerAPI.getErrorCode(body), Layer2LedgerAPI.getErrorMessage(body), layer1DepositAddress)
    }


    
    getTransactions(){
        this.layer2LedgerAPI.getTransactions(this, [this.wallet.getMainAddress().getPublicKeyString()]);
    }

    onGetBalance(data){
        let body = JSON.parse(JSON.stringify(data, null, 2));
        let balances = body['balance'];
        balances.forEach(balanceObject => {
            let layer2AddressPubKey = balanceObject['public_key'];
            let balance = balanceObject['balance'];
            this.balances[layer2AddressPubKey] = balance;
        })
        console.log("Wallet balances: " + JSON.stringify(this.balances));
        this.onGetBalanceCallback(Layer2LedgerAPI.getErrorCode(body), Layer2LedgerAPI.getErrorMessage(body), this.balances);
    }

    onGetTransactions(data){
        let body = JSON.parse(JSON.stringify(data, null, 2));
        let transactions = body['transactions'];
        transactions.forEach(layer2Address => {
            let address = layer2Address['public_key'];
            this.transactions[address] = []

            let addressTransactions = layer2Address['transactions'];
            addressTransactions.forEach(transaction => {
                let trx = new Transaction();
                trx.fromJSON(transaction);
                this.transactions[address].push(trx);
            })
        });
        console.log("Wallet transactions: " + JSON.stringify(this.transactions));
        this.onGetTransactionsCallback(Layer2LedgerAPI.getErrorCode(body), Layer2LedgerAPI.getErrorMessage(body));
    }

    onTransferTransactionCompleted(data){
        console.log("Workspace.this" +  JSON.stringify(this));
        console.log("Workspace.onTransferTransactionCompleted  foo" + this.foo);
        console.log("Workspace.onTransferTransactionCompleted  onTransferTransactionCompletedCallback" + this.onTransferTransactionCompletedCallback);

        let body = JSON.parse(JSON.stringify(data, null, 2));

        console.log("Workspace.onTransferTransactionCompleted body: " +  body);
        this.onTransferTransactionCompletedCallback(Layer2LedgerAPI.getErrorCode(body), Layer2LedgerAPI.getErrorMessage(body));
    }

    generateTransactionIdNonce(){
        return Math.random().toString(36).slice(2);
    }
}

export {Workspace}