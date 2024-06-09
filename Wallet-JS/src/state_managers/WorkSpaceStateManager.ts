import { DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI } from '../services/Layer2API';
import GetBalanceRequest from '../services/messages/Requests/GetBalanceRequest';
import GetDepositAddressRequest from '../services/messages/Requests/GetDepositAddressRequest';
import GetTransactionRequest from '../services/messages/Requests/GetTransactionRequest';
import GetTransactionsRequest from '../services/messages/Requests/GetTransactionsRequest';
import PushTransactionRequest from '../services/messages/Requests/PushTransactionRequest';
import RequestWithdrawalRequest from '../services/messages/Requests/RequestWithdrawalRequest';
import { GetBalanceResponse, GetBalanceResponseBalance } from '../services/messages/Responses/GetBalanceResponse';
import GetDepositAddressResponse from '../services/messages/Responses/GetDepositAddressResponse';
import { GetNodeInfoResponse } from '../services/messages/Responses/GetNodeInfoResponse';
import GetTransactionResponse from '../services/messages/Responses/GetTransactionResponse';

import { GetTransactionsResponse, TransactionGroup, GetTransactionsResponseTransaction } from '../services/messages/Responses/GetTransactionsResponse';
import TransferTransactionResponse from '../services/messages/Responses/TransferTransactionResponse';
import WithdrawalRequestResponse from '../services/messages/Responses/WithdrawalRequestResponse';

import { Workspace, SearchResultStatus } from '../state/Workspace';
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
        this.clearWallet();
        this.workspace.wallet = new Wallet(mneumonic);
        this.getWalletTransactions();
        this.getWalletBalance();
    }

    getWalletBalance(){
        const layer2AddressPubKey = this.workspace.wallet?.getMainAddress().getPublicKeyString();
        if (layer2AddressPubKey){  
            const getBalanceRequest: GetBalanceRequest = {
                public_keys: [layer2AddressPubKey]
            };     
            this.layer2LedgerAPI.getBalance(this.onGetWalletBalance.bind(this), getBalanceRequest);
        }
    }

    getAddressBalance(address: string){
        const getBalanceRequest: GetBalanceRequest = {
            public_keys: [address]
        };  
        this.layer2LedgerAPI.getBalance(this.onGetWalletBalance.bind(this), getBalanceRequest, false);
    }

    onGetWalletBalance(getBalanceResponse: GetBalanceResponse, ownAddress: boolean, getTransactions: boolean = true){
        const addressBalances = new Map<string, number>();
        const balances = getBalanceResponse.balance;
        balances.forEach((balance: GetBalanceResponseBalance) => {
            if(balance.address_found){
                addressBalances.set(balance.public_key, balance.balance);

                if(!ownAddress){
                    let searchResultStates: SearchResultStatus | undefined = this.workspace.searchResults.get(balance.public_key);
                    if(searchResultStates === null || searchResultStates === undefined){
                        searchResultStates = new SearchResultStatus();
                        searchResultStates.getAddressBalanceResults = getBalanceResponse;
                        this.workspace.searchResults.set(balance.public_key, searchResultStates);
                    }else{
                        searchResultStates.getAddressBalanceResults = getBalanceResponse;
                        console.log('searchResultStates.balanceResults: ', searchResultStates.getAddressBalanceResults);
                    }

                    if(getTransactions){
                        this.getAddressTransactions(balance.public_key);
                    }
                }
            }
        });
        if(ownAddress){
            this.workspace.addressBalances = addressBalances;
        }else{
            this.workspace.searchedAddressBalances = addressBalances;
        }
        this.setLatestWorkspaceState();
    }



    transfer(trxId: string, destinationAddress: string, amount: number, fee = 1){
        if(this.workspace.wallet !== null && this.messageBuilder !== null){
            const sourceAddress = this.workspace.wallet.getMainAddress();
            const sourceAddressPubKey = sourceAddress.getPublicKeyString();
            if(sourceAddressPubKey !== null){
                const message = this.messageBuilder?.buildTransferMessage(sourceAddressPubKey, destinationAddress, amount, fee, trxId);
                const signature = sourceAddress.signMessage(message);
                const pushTransactionRequest: PushTransactionRequest = {
                    amount: amount,
                    fee: fee,
                    source_address_public_key: sourceAddressPubKey,
                    destination_address_public_key: destinationAddress,
                    transaction_id: trxId,
                    signature: signature
                };
                this.layer2LedgerAPI.pushTransaction(this.onTransferTransactionCompleted.bind(this), pushTransactionRequest);
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

                const getDepositAddressRequest: GetDepositAddressRequest = {
                    layer2_address_pubkey: layer2AddressPubKey,
                    nonce: trxId,
                    signature: signature
                };
                this.layer2LedgerAPI.getDepositAddress(this.onGetDepositAddress.bind(this), getDepositAddressRequest);
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
                const requestWithdrawalRequest: RequestWithdrawalRequest = {
                    amount: amount,
                    source_address_public_key: sourceAddressPubKey,
                    layer1_withdrawal_address: layer1WithdrawalDestinatonAddress,
                    nonce: trxId,
                    signature: signature
                };
                this.layer2LedgerAPI.requestWithdrawal(this.onWithdrawalRequestCompleted.bind(this), requestWithdrawalRequest);
            }
        }
    }

    onWithdrawalRequestCompleted(withdrawalRequestResponse: WithdrawalRequestResponse, trxId: string){
        this.workspace.transactionResults.set(trxId, withdrawalRequestResponse);
        this.setLatestWorkspaceState();
    }

    clearWallet(){
        this.workspace.wallet = null;
        this.workspace.transactions = new Map<string, Transaction[]>();
        this.workspace.addressBalances = new Map<string, number>();
        this.workspace.transactionResults = new Map<string, any>();
        this.workspace.depositAddresses = new Map<string, string>();
        this.setLatestWorkspaceState();
    }

    getWalletTransactions(){
        if(this.workspace.wallet !== null){
            const layer2AddressPubKey = this.workspace.wallet.getMainAddress().getPublicKeyString();
            if(layer2AddressPubKey !== null){
                const getTransactionsRequest: GetTransactionsRequest = {
                    public_keys: [layer2AddressPubKey]
                };
                this.layer2LedgerAPI.getTransactions(this.onGetTransactions.bind(this), getTransactionsRequest);
            }
        }
    }

    getAddressTransactions(address: string){
        const getTransactionsRequest: GetTransactionsRequest = {
            public_keys: [address]
        };
        this.layer2LedgerAPI.getTransactions(this.onGetTransactions.bind(this), getTransactionsRequest, false);
    }

    onGetTransactions(getTransactionsResponse: GetTransactionsResponse, ownAddresses: boolean){
        const transactionGroups = getTransactionsResponse.transactions;
        let transactions = new Map<string, Transaction[]>();
        if(ownAddresses){
            transactions = this.workspace.transactions;
        }else{ 
            transactions = this.workspace.searchedAdressTransactions;
        }
        transactionGroups.forEach((transactionGroup: TransactionGroup) => {
            const layer2Address = transactionGroup.public_key;
            transactions.set(layer2Address, []);

            const addressTransactions = transactionGroup.transactions;
            addressTransactions.forEach((transaction: GetTransactionsResponseTransaction) => {
                const trx = new Transaction();
                trx.fromGetTransactionsResponseTransaction(transaction);
                transactions.get(layer2Address)?.push(trx);
            })
            transactions.get(layer2Address)?.sort((a: { timestamp: number; }, b: { timestamp: number; }) => (a.timestamp < b.timestamp) ? 1 : -1)

            if(!ownAddresses){
                let searchResultStates: SearchResultStatus | undefined = this.workspace.searchResults.get(layer2Address);
                if(searchResultStates === null || searchResultStates === undefined){
                    searchResultStates = new SearchResultStatus();
                    searchResultStates.getTransactionsResults = getTransactionsResponse;
                    this.workspace.searchResults.set(layer2Address, searchResultStates);
                }else{
                    searchResultStates.getTransactionsResults = getTransactionsResponse;
                    console.log('searchResultStates.transactionResults: ', searchResultStates.getTransactionsResults);
                }
            }
        });

        this.setLatestWorkspaceState();
    }

    getTransaction(trxId: string){
        const getTransactionRequest: GetTransactionRequest = {
            transaction_id: trxId
        };
        this.layer2LedgerAPI.getTransaction(this.onGetTransaction.bind(this), getTransactionRequest);
    }

    onGetTransaction(getTransactionResponse: GetTransactionResponse){
        console.log('getTransactionResponse: ', getTransactionResponse);
        const trx = new Transaction();
        if(getTransactionResponse.transaction !== null && getTransactionResponse.transaction !== undefined){
            trx.fromGetTransactionsResponseTransaction(getTransactionResponse.transaction);
            this.workspace.searchedTransaction.set(getTransactionResponse.transaction.transaction_id, trx);
        }

        let searchResultStates: SearchResultStatus | undefined = this.workspace.searchResults.get(trx.transaction_id);
        if(searchResultStates === null || searchResultStates === undefined){
            searchResultStates = new SearchResultStatus();
            searchResultStates.getSingleTransactionResults = getTransactionResponse;
            this.workspace.searchResults.set(getTransactionResponse.transaction_id, searchResultStates);
        }else{
            searchResultStates.getSingleTransactionResults = getTransactionResponse;
            console.log('searchResultStates.transactionResults: ', searchResultStates.getTransactionsResults);
        }    
    }

    refreshWallet(){
        this.getWalletTransactions();
        this.getWalletBalance();
    }

    setLatestWorkspaceState(){
        this.setWorkspaceState({
            wallet: this.workspace.wallet,
            transactions: this.workspace.transactions,
            addressBalances: this.workspace.addressBalances,
            transactionResults: this.workspace.transactionResults,
            depositAddresses: this.workspace.depositAddresses,
            layer2ledgerNodeUrl: this.layer2ledgerNodeUrl,
            searchedAddressBalances: this.workspace.searchedAddressBalances,
            searchedAdressTransactions: this.workspace.searchedAdressTransactions,
            searchResults: this.workspace.searchResults,
            searchedTransaction: this.workspace.searchedTransaction
        });
    }

    generateTransactionIdNonce(){
        return Math.random().toString(36).slice(2);
    }
}

export {WorkspaceStateManager};