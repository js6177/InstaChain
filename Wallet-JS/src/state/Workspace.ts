import { DEFAULT_LAYER2_HOSTNAME} from '../services/Layer2API';
import { Wallet, Transaction } from '../utils/wallet';
import CommonResponse from '../services/messages/Responses/CommonResponse';
import { GetBalanceResponse } from '../services/messages/Responses/GetBalanceResponse';
import GetTransactionResponse from '../services/messages/Responses/GetTransactionResponse';
import SearchResultsResponse from '../services/messages/Responses/SearchResultsResponse';


class Workspace {
    public layer2ledgerNodeUrl: string;
    //public mneumonic: string | null;
    public wallet: Wallet | null;
    // Addresses and Transactions that are part of the wallet
    public transactions: Map<string, Transaction[]>; // Key: Layer2 address, Value: List of transactions
    public addressBalances: Map<string, number>;  // Key: Layer2 address, Value: balance
    public depositAddresses: Map<string, string>; // Key: Layer2 address, Value: Layer1 deposit address
    public transactionResults: Map<string, CommonResponse>; // Key: Layer2 transaction id, Value: Result of the transaction

    //Addreses and Transactions that are searched through the explorer and are not part of the wallet
    public searchedAddressBalances: Map<string, number>; // Key: Layer2 address, Value: balance
    public searchedAdressTransactions: Map<string, Transaction[]>; // Key: Layer2 address, Value: List of transactions
    public searchedTransaction: Map<string, Transaction>; // Key: Layer2 transaction id, Value: Transaction

    public searchResults: Map<string, SearchResultsResponse>; // Key: Search text, Value: Results of the search


    constructor(layer2ledgerNodeUrl: string = DEFAULT_LAYER2_HOSTNAME) {
        this.layer2ledgerNodeUrl = layer2ledgerNodeUrl;
        //this.mneumonic = null;
        this.wallet = null;
        this.transactions = new Map();
        this.addressBalances = new Map();
        this.depositAddresses = new Map();
        this.transactionResults = new Map();

        this.searchedAddressBalances = new Map();
        this.searchedAdressTransactions = new Map();
        this.searchedTransaction = new Map();

        this.searchResults = new Map();
    }
}

export {Workspace}