import { DEFAULT_LAYER2_HOSTNAME, Layer2LedgerNodeInfo, Layer2LedgerAPI } from '../services/Layer2API';
import GetBalanceRequest from '../services/messages/Layer2Ledger/Requests/GetBalanceRequest';
import GetDepositAddressRequest from '../services/messages/Layer2Ledger/Requests/GetDepositAddressRequest';
import GetTransactionRequest from '../services/messages/Layer2Ledger/Requests/GetTransactionRequest';
import GetTransactionsRequest from '../services/messages/Layer2Ledger/Requests/GetTransactionsRequest';
import PushTransactionRequest from '../services/messages/Layer2Ledger/Requests/PushTransactionRequest';
import RequestWithdrawalRequest from '../services/messages/Layer2Ledger/Requests/RequestWithdrawalRequest';
import SearchRequest from '../services/messages/Layer2Ledger/Requests/SearchRequest';
import { GetBalanceResponse, GetBalanceResponseBalance } from '../services/messages/Layer2Ledger/Responses/GetBalanceResponse';
import GetDepositAddressResponse from '../services/messages/Layer2Ledger/Responses/GetDepositAddressResponse';
import { GetNodeInfoResponse } from '../services/messages/Layer2Ledger/Responses/GetNodeInfoResponse';
import GetTransactionResponse from '../services/messages/Layer2Ledger/Responses/GetTransactionResponse';

import { GetTransactionsResponse, TransactionGroup, GetTransactionsResponseTransaction } from '../services/messages/Layer2Ledger/Responses/GetTransactionsResponse';
import SearchResultsResponse from '../services/messages/Layer2Ledger/Responses/SearchResultsResponse';
import TransferTransactionResponse from '../services/messages/Layer2Ledger/Responses/TransferTransactionResponse';
import WithdrawalRequestResponse from '../services/messages/Layer2Ledger/Responses/WithdrawalRequestResponse';
import { SearchUserRequest } from '../services/messages/Layer2OAuthManager/Request/SearchUserRequest';
import { OAuthUser, UserKeys } from '../services/messages/Layer2OAuthManager/Response/OAuthResponse';
import {Layer2OAuthManagerAPI} from '../services/Layer2OAuthManagerAPI';

import { Workspace } from '../state/Workspace';
import { Wallet, MessageBuilder, Transaction } from '../utils/wallet';
import { SearchUserResponse } from '../services/messages/Layer2OAuthManager/Response/SearchUserResponse';
import { UnifiedSearchResults } from '../services/messages/Common/UnifiedSearchResults';

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
        this.workspace.walletManager.createNewWallet(mneumonic);
        this.getWalletTransactions();
        this.getWalletBalance();
    }

    addOAuthUser(oauthUser: OAuthUser, userKeys: UserKeys, setAsMainWallet: boolean = true){
        this.workspace.walletManager.addOAuthUser(oauthUser, userKeys, setAsMainWallet);
        this.getWalletTransactions();
        this.getWalletBalance();
        this.setLatestWorkspaceState();
    }

    logoutOAuthUser(oauthUserId: string | null){
        this.workspace.walletManager.logoutOAuthUser(oauthUserId);
        //this.clearWallet();
        this.setLatestWorkspaceState();
    }

    getMainWalletId(){
        return this.workspace.walletManager.getMainWalletId();
    }

    getMainWallet(){
        return this.workspace.walletManager.getMainWallet();
    }

    getMainWalletAddressPubKey(){
        return this.getMainWallet()?.getMainAddress().getPublicKeyString();
    }

    getWalletBalance(){
        const layer2AddressPubKey = this.workspace.walletManager.getMainWalletAddressPubkey();
        if (layer2AddressPubKey){  
            const getBalanceRequest: GetBalanceRequest = {
                public_keys: [layer2AddressPubKey]
            };     
            this.layer2LedgerAPI.getBalance(this.onGetWalletBalance.bind(this), getBalanceRequest);
        }
    }

    getAddressBalance(address: string, fromSearch: boolean = false){
        const getBalanceRequest: GetBalanceRequest = {
            public_keys: [address]
        };  
        this.layer2LedgerAPI.getBalance(this.onGetWalletBalance.bind(this), getBalanceRequest, false, false, fromSearch, address);
    }

    onGetWalletBalance(getBalanceResponse: GetBalanceResponse, ownAddress: boolean, getTransactions: boolean = true, fromSearch: boolean = false, searchedAddress: string = ''){
        const addressBalances = new Map<string, number>();
        const balances = getBalanceResponse.balance;
        balances.forEach((balance: GetBalanceResponseBalance) => {
            if(/*balance.address_found*/ true){
                addressBalances.set(balance.public_key, balance.balance);

                if(!ownAddress){
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
        if(this.workspace.walletManager.wallets.size > 0 && this.messageBuilder !== null){
            const sourceAddress = this.workspace.walletManager.getMainWalletAddress();
            if(sourceAddress !== null){
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
            else{
                console.log('Source address is null. Possibly wallet is not loaded');
            }
        }else{
            if(this.workspace.walletManager.wallets.size === 0){
                console.log('No wallets found');
            }
            else{
                console.log('Message builder is null');
            }
        }
    }

    onTransferTransactionCompleted(transferTransactionResponse: TransferTransactionResponse, trxId: string){
        this.workspace.transactionResults.set(trxId, transferTransactionResponse);
        this.setLatestWorkspaceState();
    }

    getDepositAddress(trxId: string){
        if(this.workspace.walletManager.wallets.size > 0 && this.messageBuilder !== null){
            const layer2Address = this.workspace.walletManager.getMainWalletAddress();
            if(layer2Address !== null){
                const layer2AddressPubKey = layer2Address.getPublicKeyString();
                if(layer2AddressPubKey !== null)
                {
                    const message = this.messageBuilder?.buildGetDepositAddressMessage(layer2AddressPubKey, trxId);  
                    const signature = layer2Address.signMessage(message);

                    const getDepositAddressRequest: GetDepositAddressRequest = {
                        layer2_address_pubkey: layer2AddressPubKey,
                        nonce: trxId,
                        signature: signature
                    };
                    this.layer2LedgerAPI.getDepositAddress(this.onGetDepositAddress.bind(this), getDepositAddressRequest);
                }else{
                    console.log('layer2AddressPubKey is null');
                }
            }else{
                console.log('layer2Address is null');
            }
        }else{
            if(this.workspace.walletManager.wallets.size === 0){
                console.log('No wallets found');
            }
            else{
                console.log('Message builder is null');
            }
        }
    }

    onGetDepositAddress(getDepositAddressResponse: GetDepositAddressResponse, layer2Address: string, trxId: string){
        this.workspace.depositAddresses.set(layer2Address, getDepositAddressResponse.layer1_deposit_address);
        this.workspace.transactionResults.set(trxId, getDepositAddressResponse);
        this.setLatestWorkspaceState();
    }

    requestWithdrawal(trxId: string, layer1WithdrawalDestinatonAddress: string, amount: number){
        if(this.workspace.walletManager.wallets.size > 0 && this.messageBuilder !== null){

            const sourceAddress = this.workspace.walletManager.getMainWalletAddress();
            if(sourceAddress !== null){
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
            }else{
                console.log('Source address is null. Possibly wallet is not loaded');
            }
        }else{
            if(this.workspace.walletManager.wallets.size === 0){
                console.log('No wallets found');
            }
            else{
                console.log('Message builder is null');
            }
        }
    }

    onWithdrawalRequestCompleted(withdrawalRequestResponse: WithdrawalRequestResponse, trxId: string){
        this.workspace.transactionResults.set(trxId, withdrawalRequestResponse);
        this.setLatestWorkspaceState();
    }

    clearWallet(){
        //this.workspace.wallet = null;
        //this.workspace.walletManager.clearWallets();
        this.workspace.transactions = new Map<string, Transaction[]>();
        this.workspace.addressBalances = new Map<string, number>();
        this.workspace.transactionResults = new Map<string, any>();
        this.workspace.depositAddresses = new Map<string, string>();
        this.setLatestWorkspaceState();
    }

    getWalletTransactions(){
        if(this.workspace.walletManager.wallets.size > 0){
            const layer2AddressPubKey = this.workspace.walletManager.getMainWalletAddressPubkey();
            if(layer2AddressPubKey !== null){
                const getTransactionsRequest: GetTransactionsRequest = {
                    public_keys: [layer2AddressPubKey]
                };
                this.layer2LedgerAPI.getTransactions(this.onGetTransactions.bind(this), getTransactionsRequest);
            }
        }else{
            console.log('No wallets found');
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
        });

        this.setLatestWorkspaceState();
    }

    getTransaction(trxId: string, fromSearch: boolean = false){
        const getTransactionRequest: GetTransactionRequest = {
            transaction_id: trxId
        };
        this.layer2LedgerAPI.getTransaction(this.onGetTransaction.bind(this), getTransactionRequest, fromSearch);
    }

    onGetTransaction(getTransactionResponse: GetTransactionResponse, fromSearch: boolean = false){
        console.log('getTransactionResponse: ', getTransactionResponse);
        const trx = new Transaction();
        if(getTransactionResponse.transaction !== null && getTransactionResponse.transaction !== undefined){
            trx.fromGetTransactionsResponseTransaction(getTransactionResponse.transaction);
            this.workspace.searchedTransaction.set(getTransactionResponse.transaction.transaction_id, trx);
        }

        this.setLatestWorkspaceState();
    }

    refreshWallet(){
        this.getWalletTransactions();
        this.getWalletBalance();
    }

    searchOAuthUser(searchText: string){
        Layer2OAuthManagerAPI.searchOAuthUser(searchText, this.onSearchOAuthUser.bind(this));
    }

    onSearchOAuthUser(searchUserRequest: SearchUserRequest,  searchUserResponse: SearchUserResponse){
        console.log('searchUserRequest: ', searchUserResponse);
        // Create or update a UnifiedSearchResults result with the oauthUserSearchResults as searchUserResponse, and update workspace.searchResults with it
        let unifiedSearchResults: UnifiedSearchResults = this.workspace.searchResults.get(searchUserRequest.keyword) as UnifiedSearchResults;
        if(unifiedSearchResults === null || unifiedSearchResults === undefined){
            unifiedSearchResults = {
                layer2SearchResults: null,
                oauthUserSearchResults: searchUserResponse
            };
        }
        else{
            unifiedSearchResults.oauthUserSearchResults = searchUserResponse;
        }
        this.workspace.searchResults.set(searchUserRequest.keyword, unifiedSearchResults);
        
        if(searchUserResponse.users !== null){
            this.workspace.searchedOAuthUsers.set(searchUserRequest.keyword, searchUserResponse.users);
        }
        this.setLatestWorkspaceState();
    }

    search(searchText: string){
        const searchRequest: SearchRequest = {
            search_string: searchText,
            search_type: '*'
        };
        this.layer2LedgerAPI.search(this.onSearchResults.bind(this), searchRequest);
    }

    onSearchResults(searchResults: SearchResultsResponse){
        console.log('searchResults: ', searchResults);
        let unifiedSearchResults: UnifiedSearchResults = this.workspace.searchResults.get(searchResults.search_string) as UnifiedSearchResults;
        if(unifiedSearchResults === null || unifiedSearchResults === undefined){
            unifiedSearchResults = {
                layer2SearchResults: searchResults,
                oauthUserSearchResults: null
            };
        }else{
            unifiedSearchResults.layer2SearchResults = searchResults;
        }
        this.workspace.searchResults.set(searchResults.search_string, unifiedSearchResults);

        if(searchResults.l2_address !== null){
            this.workspace.searchedAddressBalances.set(searchResults.search_string, searchResults.l2_address.balance);
        }
        if(searchResults.l2_transaction !== null){
            const transaction = new Transaction();
            transaction.fromGetTransactionsResponseTransaction(searchResults.l2_transaction);
            this.workspace.searchedTransaction.set(searchResults.search_string, transaction);
        }
        this.setLatestWorkspaceState();
    }

    setLatestWorkspaceState(){
        this.setWorkspaceState({
            //wallet: this.workspace.wallet,
            walletManager: this.workspace.walletManager,
            transactions: this.workspace.transactions,
            addressBalances: this.workspace.addressBalances,
            transactionResults: this.workspace.transactionResults,
            depositAddresses: this.workspace.depositAddresses,
            layer2ledgerNodeUrl: this.layer2ledgerNodeUrl,
            searchedAddressBalances: this.workspace.searchedAddressBalances,
            searchedAdressTransactions: this.workspace.searchedAdressTransactions,
            searchedTransaction: this.workspace.searchedTransaction,
            searchedOAuthUsers: this.workspace.searchedOAuthUsers,
            searchResults: this.workspace.searchResults
        });
    }

    generateTransactionIdNonce(){
        return Math.random().toString(36).slice(2);
    }
}

export {WorkspaceStateManager};