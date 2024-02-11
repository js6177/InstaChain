import { DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI } from '../services/Layer2API';
import { GetBalanceResponse, GetBalanceResponseBalance } from '../services/messages/GetBalanceResponse';
import GetDepositAddressResponse from '../services/messages/GetDepositAddressResponse';
import { GetNodeInfoResponse } from '../services/messages/GetNodeInfoResponse';

import { GetTransactionsResponse, TransactionGroup, GetTransactionsResponseTransaction } from '../services/messages/GetTransactionsResponse';
import TransferTransactionResponse from '../services/messages/TransferTransactionResponse';
import WithdrawalRequestResponse from '../services/messages/WithdrawalRequestResponse';

import { Workspace } from '../state/Workspace';
import { Wallet, MessageBuilder, Transaction } from '../utils/wallet';

class WorkspaceStateManager{

    public setWorkspaceState: (state: Workspace) => void;
    public layer2ledgerNodeUrl: string;
    public layer2LedgerAPI: Layer2LedgerAPI;
    public workspace: Workspace;
    public layer2LedgerNodeInfo: Layer2LedgerNodeInfo | null;
    public messageBuilder: MessageBuilder | null;

    constructor(setWorkspaceState: (state: Workspace) => void, layer2ledgerNodeUrl: string = DEFAULT_LAYER2_HOSTNAME) {
        this.setWorkspaceState = setWorkspaceState;
        this.layer2ledgerNodeUrl = layer2ledgerNodeUrl;
        this.layer2LedgerAPI = new Layer2LedgerAPI(this.layer2ledgerNodeUrl);
        this.layer2LedgerAPI.getNodeInfo(this.onGetNodeInfo.bind(this));
        this.layer2LedgerNodeInfo = null;
        this.messageBuilder = null;
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
        const layer2AddressPubKey = this.workspace.wallet?.getMainAddress().getPublicKeyString();
        if (layer2AddressPubKey){       
            this.layer2LedgerAPI.getBalance(this.onGetWalletBalance.bind(this), [layer2AddressPubKey]);
        }
    }

    onGetWalletBalance(getBalanceResponse: GetBalanceResponse){
        const addressBalances = new Map<string, number>();
        const balances = getBalanceResponse.balance;
        balances.forEach((balance: GetBalanceResponseBalance) => {
            addressBalances.set(balance.public_key, balance.balance);
        });
        this.workspace.addressBalances = addressBalances;
        this.setLatestWorkspaceState();
    }

    transfer(trxId: string, destinationAddress: string, amount: number, fee = 1){
        if(this.workspace.wallet !== null && this.messageBuilder !== null){
            const sourceAddress = this.workspace.wallet.getMainAddress();
            const sourceAddressPubKey = sourceAddress.getPublicKeyString();
            if(sourceAddressPubKey !== null){
                const message = this.messageBuilder?.buildTransferMessage(sourceAddressPubKey, destinationAddress, amount, fee, trxId);
                const signature = sourceAddress.signMessage(message);
                this.layer2LedgerAPI.pushTransaction(this.onTransferTransactionCompleted.bind(this), amount, fee, sourceAddressPubKey, destinationAddress, signature, trxId);
            }
        }
    }

    onTransferTransactionCompleted(transferTransactionResponse: TransferTransactionResponse, trxId: string){
        this.workspace.transactionResults.set(trxId, transferTransactionResponse);
        this.setLatestWorkspaceState();
    }

    getDepositAddress(trxId: string){
        if(this.workspace.wallet !== null && this.messageBuilder !== null){
            const layer2Address = this.workspace.wallet.getMainAddress();
            const layer2AddressPubKey = layer2Address.getPublicKeyString();
            if(layer2AddressPubKey !== null){
                const message = this.messageBuilder?.buildGetDepositAddressMessage(layer2AddressPubKey, trxId);  
                const signature = layer2Address.signMessage(message);

                this.layer2LedgerAPI.getDepositAddress(this.onGetDepositAddress.bind(this), layer2AddressPubKey, trxId, signature);
            }
        }
    }

    onGetDepositAddress(getDepositAddressResponse: GetDepositAddressResponse, layer2Address: string, trxId: string){
        this.workspace.depositAddresses.set(layer2Address, getDepositAddressResponse.layer1_deposit_address);
        this.workspace.transactionResults.set(trxId, getDepositAddressResponse);
        this.setLatestWorkspaceState();
    }

    requestWithdrawal(trxId: string, layer1WithdrawalDestinatonAddress: string, amount: number){
        if(this.workspace.wallet !== null && this.messageBuilder !== null){

        const sourceAddress = this.workspace.wallet.getMainAddress();
        const sourceAddressPubKey = sourceAddress.getPublicKeyString();
        if(sourceAddressPubKey !== null){
            const message = this.messageBuilder?.buildWithdrawalRequestMessage(sourceAddressPubKey, layer1WithdrawalDestinatonAddress, trxId, amount);
            const signature = sourceAddress.signMessage(message);
            this.layer2LedgerAPI.requestWithdrawal(this.onWithdrawalRequestCompleted.bind(this), sourceAddressPubKey, layer1WithdrawalDestinatonAddress, amount, trxId, signature);
            }
        }
    }

    onWithdrawalRequestCompleted(withdrawalRequestResponse: WithdrawalRequestResponse, trxId: string){
        this.workspace.transactionResults.set(trxId, withdrawalRequestResponse);
        this.setLatestWorkspaceState();
    }

    getTransactions(){
        if(this.workspace.wallet !== null){
            const layer2AddressPubKey = this.workspace.wallet.getMainAddress().getPublicKeyString();
            if(layer2AddressPubKey !== null){
                this.layer2LedgerAPI.getTransactions(this.onGetTransactions.bind(this), [layer2AddressPubKey]);
            }
        }
    }

    onGetTransactions(getTransactionsResponse: GetTransactionsResponse){
        const transactionGroups = getTransactionsResponse.transactions;
        transactionGroups.forEach((transactionGroup: TransactionGroup) => {
            const layer2Address = transactionGroup.public_key;
            this.workspace.transactions.set(layer2Address, []);

            const addressTransactions = transactionGroup.transactions;
            addressTransactions.forEach((transaction: GetTransactionsResponseTransaction) => {
                const trx = new Transaction();
                trx.fromGetTransactionsResponseTransaction(transaction);
                this.workspace?.transactions?.get(layer2Address)?.push(trx);
            })
            this.workspace?.transactions?.get(layer2Address)?.sort((a: { timestamp: number; }, b: { timestamp: number; }) => (a.timestamp < b.timestamp) ? 1 : -1)
        });
        this.setLatestWorkspaceState();
    }

    refreshWallet(){
        this.getTransactions();
        this.getWalletBalance();
    }

    setLatestWorkspaceState(){
        this.setWorkspaceState({
            wallet: this.workspace.wallet,
            transactions: this.workspace.transactions,
            addressBalances: this.workspace.addressBalances,
            transactionResults: this.workspace.transactionResults,
            depositAddresses: this.workspace.depositAddresses,
            layer2ledgerNodeUrl: this.layer2ledgerNodeUrl
        });
    }

    generateTransactionIdNonce(){
        return Math.random().toString(36).slice(2);
    }
}

export {WorkspaceStateManager};