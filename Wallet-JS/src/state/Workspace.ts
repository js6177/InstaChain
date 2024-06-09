import { DEFAULT_LAYER2_HOSTNAME} from '../services/Layer2API';
import { Wallet, Transaction } from '../utils/wallet';
import CommonResponse from '../services/messages/Responses/CommonResponse';
import { GetBalanceResponse } from '../services/messages/Responses/GetBalanceResponse';
import GetTransactionResponse from '../services/messages/Responses/GetTransactionResponse';

class SearchResultStatus {
    getAddressBalanceResults: GetBalanceResponse | null = null;
    getTransactionsResults: CommonResponse | null = null;
    getSingleTransactionResults: GetTransactionResponse | null = null;
}

class Workspace {
    public layer2ledgerNodeUrl: string;
    //public mneumonic: string | null;
    public wallet: Wallet | null;
    public transactions: Map<string, Transaction[]>;
    public addressBalances: Map<string, number>;
    public depositAddresses: Map<string, string>;
    public transactionResults: Map<string, CommonResponse>;

    //Addreses and Transactions that are searched through the explorer and are not part of the wallet
    public searchedAddressBalances: Map<string, number>;
    public searchedAdressTransactions: Map<string, Transaction[]>;
    public searchedTransaction: Map<string, Transaction>;
    public searchResults: Map<string, SearchResultStatus>;

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

export {Workspace, SearchResultStatus}