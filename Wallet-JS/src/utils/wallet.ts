import { GetTransactionsResponseTransaction } from "../services/messages/GetTransactionsResponse";

const { base58_to_binary, binary_to_base58 } = require('base58-js')
const secp256k1 = require('secp256k1')

const default_hashing_algorithm = 'sha256'
const crypto = require('crypto-browserify')

function SHA256(s: string): string {
    return crypto.createHash(default_hashing_algorithm).update(s, 'utf8').digest('hex');
}

function SHA256Raw(s: string): Buffer {
    return crypto.createHash(default_hashing_algorithm).update(s, 'utf8').digest();
}


class Layer2Address{
    public mneumonic: string;
    public seed: string | null = null;
    public private_key: Buffer | null = null;
    public public_key: Buffer | null = null;
    public private_key_str: string | null = null;
    public public_key_str: string | null = null;

    constructor(mneumonic: string = "the quick brown fox jumped over the lazy dog"){
        this.mneumonic = mneumonic.trim().split(/\s+/).join(' ');
        this.fromSeed(SHA256(this.mneumonic));
    }

    fromSeed(seed: string) {
        this.seed = seed;
        this.private_key = SHA256Raw(seed);
        this.fromPrivateKey(this.private_key);
    }

    fromPrivateKey(privateKey: Buffer){
        this.private_key = privateKey;
        this.public_key = secp256k1.publicKeyCreate(this.private_key, false);
        this.private_key_str = binary_to_base58(this.private_key);
        this.public_key_str = binary_to_base58(this.public_key);
        this.printSeedAndKeys();
    }

    printSeedAndKeys(){
        //console.log("Seed: " + this.seed);
        //console.log("private_key: " + binary_to_base58(this.private_key));
        //console.log("public_key: " + binary_to_base58(this.public_key));
        //console.log("private_key_str: " + this.private_key_str);
        //console.log("public_key_str: " + this.public_key_str);
    }

    getPublicKeyString(){
        return this.public_key_str;
    }

    signMessage(message: string) {
        return binary_to_base58(secp256k1.ecdsaSign(SHA256Raw(message), this.private_key).signature);
    }

}

const DEFAULT_FEE = 1 // 1 satoshi

const TRX_TRANSFER = 1;  // regular 2nd layer transfer
const TRX_DEPOSIT = 2;  // when a user deposits btc to a deposit address, then funds get credited to his pubkey
const TRX_WITHDRAWAL_INITIATED = 3;  // when the user wants to withdraw to a btc address (locks that amount)
const TRX_WITHDRAWAL_BROADCASTED = 4; // when the transaction is broadcasted and in the mempool
const TRX_WITHDRAWAL_CANCELED = 5;  // when the transaction gets removed from the layer1 mempool for any reason
const TRX_WITHDRAWAL_CONFIRMED = 6;  // when the withdrawal gets confirmed in the layer1 chain
const INSTRUCTION_GET_DEPOSIT_ADDRESS = 7; // instruction to get a deposit address

type TransactionTypeMap = {
    [key: number]: string;
};

const TransactionTypeMap: TransactionTypeMap = {
    [TRX_TRANSFER]: "transfer",
    [TRX_DEPOSIT]: "deposit",
    [TRX_WITHDRAWAL_INITIATED]: "withdrawal"
};

class Transaction {
    amount: number | null;
    fee: number;
    source_address: string;
    destination_address: string;
    transaction_type: number;
    transaction_hash: string;
    transaction_id: string;
    asset_id: number | null;
    signature: string;
    signature_date: string;
    layer1_transaction_id: string | null;
    timestamp: number;
    node_id: string;
    node: any | null;

    signed_message: string;
    id: string;
    transaction_type_desc: string;
    locale_date: string;

    constructor() {
        this.amount = null;
        this.fee = DEFAULT_FEE;
        this.source_address = '';
        this.destination_address = '';
        this.transaction_type = 0;
        this.transaction_hash = '';
        this.transaction_id = '';
        this.asset_id = null;
        this.signature = '';
        this.signature_date = '';
        this.layer1_transaction_id = '';
        this.timestamp = 0;
        this.node_id = '';
        this.node = null;
        this.signed_message = '';
        this.id = this.transaction_id;
        this.transaction_type_desc = '';
        this.locale_date = '';
    }

    buildTransaction(amount: number, source_address_pubkey: string, destination_address_pubkey: string) {
        this.amount = amount;
        this.source_address = source_address_pubkey;
        this.destination_address = destination_address_pubkey;
    }

    fromGetTransactionsResponseTransaction(getTransactionsResponseTransaction: GetTransactionsResponseTransaction){
        this.amount = getTransactionsResponseTransaction.amount;
        this.fee = getTransactionsResponseTransaction.fee;
        this.source_address = getTransactionsResponseTransaction.source_address_pubkey;
        this.destination_address = getTransactionsResponseTransaction.destination_address_pubkey;
        this.transaction_type = getTransactionsResponseTransaction.transaction_type;
        this.transaction_type_desc = TransactionTypeMap[this.transaction_type];
        this.transaction_id = getTransactionsResponseTransaction.transaction_id;
        this.layer1_transaction_id = getTransactionsResponseTransaction.layer1_transaction_id;
        this.timestamp = getTransactionsResponseTransaction.timestamp;
        this.locale_date = new Date(this.timestamp * 1000).toLocaleString();
        this.signature = getTransactionsResponseTransaction.signature;
        this.node_id = ''; //getTransactionsResponseTransaction.node_id;

        this.id = this.transaction_id + ':' + this.node_id;
    }

    fromJSON(data: any) {
        const jsonDict = JSON.parse(JSON.stringify(data, null, 2));
        this.amount = jsonDict["amount"];
        this.fee = jsonDict['fee'];
        this.source_address = jsonDict['source_address_pubkey'];
        this.destination_address = jsonDict['destination_address_pubkey'];
        this.transaction_type = jsonDict['transaction_type'];
        this.transaction_type_desc = TransactionTypeMap[this.transaction_type];
        this.transaction_id = jsonDict['transaction_id'];
        this.layer1_transaction_id = jsonDict['layer1_transaction_id'];
        this.timestamp = jsonDict['timestamp'];
        this.locale_date = new Date(this.timestamp * 1000).toLocaleString();
        this.signature = jsonDict['signature'];
        this.node_id = jsonDict['node_id'];

        this.id = this.transaction_id + ':' + this.node_id;
    }
}

class Wallet {
    layer2address: Layer2Address;
    uid: string;

    constructor(mneumonic: string) {
        this.layer2address = new Layer2Address(mneumonic);
        this.uid = crypto.randomBytes(20).toString('hex');

        //console.log("Wallet.uid: " + this.uid);
        //console.log("Wallet.layer2addres: " + JSON.stringify(this.layer2address));
    }

    getMainAddress(): Layer2Address {
        return this.layer2address;
    }

    getMainAddressPubkey(): string | null {
        //console.log("Wallet.getMainAddressPubkey: " + this.layer2address.public_key_str);
        return this.layer2address.public_key_str;
    }
}


class MessageBuilder{
    layer2LedgerHostname: string;
    layer2LedgerNodeId: string;
    layer2LedgerNodeAssetId: number;

    constructor(layer2LedgerHostname: string, layer2LedgerNodeId: string, layer2LedgerAssetId: number){
        this.layer2LedgerHostname = layer2LedgerHostname;
        this.layer2LedgerNodeId = layer2LedgerNodeId;
        this.layer2LedgerNodeAssetId = layer2LedgerAssetId;
    }

    buildTransferMessage(sourceAddressPubkey: string, destinationAddressPubkey: string, amount: number, fee: number, transactionIdNonce: string){
        const message = (this.layer2LedgerNodeId + " " + this.layer2LedgerNodeAssetId + " " + TRX_TRANSFER + " " + sourceAddressPubkey + " " + destinationAddressPubkey + " " + amount + " " + fee + " " + transactionIdNonce);
        ////console.log('buildTransferMessage: ' + message);
        return message;
    }

    buildGetDepositAddressMessage(layer2AddressPubKey: string, transactionIdNonce: string){
        const message = (this.layer2LedgerNodeId + " " + this.layer2LedgerNodeAssetId + " " + INSTRUCTION_GET_DEPOSIT_ADDRESS + layer2AddressPubKey + " " + transactionIdNonce);
        ////console.log('buildGetDepositAddressMessage: ' + message);
        return message;
    }

    buildWithdrawalRequestMessage(layer2SourceAddressPubKey: string, layer1WithdrawalAddress: string, transactionIdNonce: string, amount: number){
        const message = (this.layer2LedgerNodeId + " " + this.layer2LedgerNodeAssetId + " " + TRX_WITHDRAWAL_INITIATED +  " " + layer2SourceAddressPubKey + " " + layer1WithdrawalAddress + " " + transactionIdNonce + " " + amount );
        ////console.log('buildWithdrawalRequestMessage: ' + message);
        return message;
    }
}

export {Wallet, MessageBuilder, Transaction}