const { base58_to_binary, binary_to_base58 } = require('base58-js')
const secp256k1 = require('secp256k1')

var default_hashing_algorithm = 'sha256'
const crypto = require('crypto-browserify')
const SHA256 = s => crypto.createHash(default_hashing_algorithm).update(s, 'utf8').digest('hex')
const SHA256Raw = s => crypto.createHash(default_hashing_algorithm).update(s, 'utf8').digest()


const fromHexString = hexString =>
    new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

const toHexString = bytes =>
    bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');


class Layer2Address{
    constructor(mneumonic = "the quick brown fox jumped over the lazy dog"){
        this.mneumonic = mneumonic.trim().split(/\s+/).join(' ');
        this.fromSeed(SHA256(this.mneumonic));
    }

    fromSeed(seed) {
        this.seed = seed;
        this.private_key = SHA256Raw(seed);
        this.fromPrivateKey(this.private_key);
    }

    fromPrivateKey(privateKey){
        this.private_key = privateKey;
        this.public_key = secp256k1.publicKeyCreate(this.private_key, false);
        this.private_key_str = binary_to_base58(this.private_key);
        this.public_key_str = binary_to_base58(this.public_key);
        this.printSeedAndKeys();
    }

    printSeedAndKeys(){
        console.log("Seed: " + this.seed);
        console.log("private_key: " + binary_to_base58(this.private_key));
        console.log("public_key: " + binary_to_base58(this.public_key));
    }

    getPublicKeyString(){
        return this.public_key_str;
    }

    signMessage(message) {
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

var TransactionTypeMap = {
    [TRX_TRANSFER] : "transfer",
    [TRX_DEPOSIT]: "deposit",
    [TRX_WITHDRAWAL_INITIATED]: "withdrawal"   
};

class Transaction{
    constructor(){
        this.amount = null
        this.fee = DEFAULT_FEE  // will get fees from API
        this.source_address = ''  // pubkey of the source address, whose corresponding private key signed the message
        this.destination_address = ''  // pubkey of the destination address
        this.transaction_type = ''  // can be transfer, deposit, or withdrawal
        this.transaction_hash = ''  // empty, only used in server for chaining transactions
        this.transaction_id = ''  // also known as the nonce, a random 32 byte ascii string to prevent the same transaction being processed more than once
        this.asset_id = null    // represents the asset that is being transacted, i.e bitcoin
        this.signature = ''  // the signature of the message (that was signed using the private key that corresponds to the source_address)
        this.signature_date = ''  // date that the transaction was signed by the sender's private key
        this.layer1_transaction_id = '' // for deposit/withdrawal, this is the layer 1 transaction id
        this.timestamp = 0
        this.node_id = ''
        this.node = null
        this.signed_message = '' // the transfer/deposit/withdraw message string that was built and signed

        // Extra fields, i.e. computed or helper fields that are not part of the minimal backend schema

        // For compatiballity with react MUI DataGrid
        this.id = this.transaction_id
        this.transaction_type_desc = ''
        this.locale_date = ''
    };

    buildTransaction(amount, source_address_pubkey, destination_address_pubkey){
        constructor();
        this.amount = amount;
        this.source_address = source_address_pubkey;
        this.destination_address = destination_address_pubkey;
    }

    fromJSON(data){
        let jsonDict = JSON.parse(JSON.stringify(data, null, 2));
        this.amount = jsonDict["amount"]
        this.fee = jsonDict['fee']
        this.source_address = jsonDict['source_address_pubkey']
        this.destination_address = jsonDict['destination_address_pubkey']
        this.transaction_type = jsonDict['transaction_type']
        this.transaction_type_desc = TransactionTypeMap[this.transaction_type]
        this.transaction_id = jsonDict['transaction_id']
        this.layer1_transaction_id = jsonDict['layer1_transaction_id']
        this.timestamp = jsonDict['timestamp']
        this.locale_date = new Date(this.timestamp * 1000).toLocaleString()
        this.signature = jsonDict['signature']
        this.node_id = jsonDict['node_id']

        this.id = this.transaction_id + ':' + this.node_id

        console.log("Transaction.fromJSON: " + JSON.stringify(jsonDict))
        console.log("Transaction.fromJSON: TransactionTypeMap" + JSON.stringify(TransactionTypeMap))

        console.log("Transaction.fromJSON: transaction_type" + this.transaction_type)
        console.log("Transaction.fromJSON: transaction_type_desc" + this.transaction_type_desc)
    }
}

class Wallet{
    constructor(mneumonic){
        this.layer2address = new Layer2Address(mneumonic);
    }

    getMainAddress(){
        return this.layer2address;
    }

    getMainAddressPubkey(){
        return this.layer2address.public_key_str;
    }
}


class MessageBuilder{
    constructor(layer2LedgerHostname, layer2LedgerNodeId, layer2LedgerAssetId){
        this.layer2LedgerHostname = layer2LedgerHostname;
        this.layer2LedgerNodeId = layer2LedgerNodeId;
        this.layer2LedgerNodeAssetId = layer2LedgerAssetId;
    }

    buildTransferMessage(sourceAddressPubkey, destinationAddressPubkey, amount, fee, transactionIdNonce){
        var message = (this.layer2LedgerNodeId + " " + this.layer2LedgerNodeAssetId + " " + TRX_TRANSFER + " " + sourceAddressPubkey + " " + destinationAddressPubkey + " " + amount + " " + fee + " " + transactionIdNonce);
        console.log('buildTransferMessage: ' + message);
        return message;
    }

    buildGetDepositAddressMessage(layer2AddressPubKey, transactionIdNonce){
        var message = (this.layer2LedgerNodeId + " " + this.layer2LedgerNodeAssetId + " " + INSTRUCTION_GET_DEPOSIT_ADDRESS + layer2AddressPubKey + " " + transactionIdNonce);
        console.log('buildGetDepositAddressMessage: ' + message);
        return message;
    }

    buildWithdrawalRequestMessage(layer2SourceAddressPubKey, layer1WithdrawalAddress, transactionIdNonce, amount){
        var message = (this.layer2LedgerNodeId + " " + this.layer2LedgerNodeAssetId + " " + TRX_WITHDRAWAL_INITIATED +  " " + layer2SourceAddressPubKey + " " + layer1WithdrawalAddress + " " + transactionIdNonce + " " + amount );
        console.log('buildWithdrawalRequestMessage: ' + message);
        return message;
    }
}


export {Wallet, MessageBuilder, Transaction}