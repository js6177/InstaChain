import { DEFAULT_LAYER2_HOSTNAME} from '../services/Layer2API';
import { Wallet, Transaction } from '../utils/wallet';
import CommonResponse from '../services/messages/CommonResponse';


class Workspace {
    public layer2ledgerNodeUrl: string;
    //public mneumonic: string | null;
    public wallet: Wallet | null;
    public transactions: Map<string, Transaction[]>;
    public addressBalances: Map<string, number>;
    public depositAddresses: Map<string, string>;
    public transactionResults: Map<string, CommonResponse>;

    constructor(layer2ledgerNodeUrl: string = DEFAULT_LAYER2_HOSTNAME) {
        this.layer2ledgerNodeUrl = layer2ledgerNodeUrl;
        //this.mneumonic = null;
        this.wallet = null;
        this.transactions = new Map();
        this.addressBalances = new Map();
        this.depositAddresses = new Map();
        this.transactionResults = new Map();
    }
}

export {Workspace}