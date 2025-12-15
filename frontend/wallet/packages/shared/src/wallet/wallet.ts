import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2';
import bs58 from 'bs58';
import { hmac } from '@noble/hashes/hmac';
import { MNEUMONIC_WORD_COUNT, MNEUMONIC_WORDLIST } from './wordlist';
import {GetTransactionsResponseTransaction} from '../../../api-layer2ledger/src/generated/models/getTransactionsResponseTransaction';

secp.etc.hmacSha256Sync = (key, ...msgs) => hmac(sha256, key, secp.etc.concatBytes(...msgs));

function stringToUint8Array(str: string): Uint8Array {
    return new TextEncoder().encode(str);
}

async function signMessage(message: string, privKeyB58: string): Promise<string> {
    const messageHash = sha256(stringToUint8Array(message));
    const privKey = bs58.decode(privKeyB58);
    const signature = await secp.sign(messageHash, privKey);
    const signatureBytes = signature.toCompactRawBytes();
    return bs58.encode(Buffer.from(signatureBytes));
}

async function verifyMessage(message: string, signatureB58: string, publicKeyB58: string): Promise<boolean> {
    try {
        const messageHash = sha256(stringToUint8Array(message));
        const signatureBytes = bs58.decode(signatureB58);
        const publicKeyBytes = bs58.decode(publicKeyB58);

        const uncompressedPubKey = new Uint8Array(65);
        uncompressedPubKey[0] = 0x04;
        uncompressedPubKey.set(publicKeyBytes, 1);

        return secp.verify(signatureBytes, messageHash, uncompressedPubKey);
    } catch (error) {
        return false;
    }
}

type GeneratedKeypair = [privKeyBytes: secp.Bytes, pubKeyWithTypePrefixBytes: secp.Bytes];
enum Layer2AddressGenerationType {
    EMPTY = 'EMPTY',    // No keypair generated
    NEW = 'NEW',        // New keypair randomly generated
    FROM_MNEMONIC = 'FROM_MNEMONIC', // Keypair generated from mnemonic
    FROM_PRIVATE_KEY = 'FROM_PRIVATE_KEY', // Keypair generated from a saved private key,
    FROM_PUBLIC_KEY = 'FROM_PUBLIC_KEY' // Keypair generated from a public key
}

class Layer2Address {
    label: string;
    private_key_str_base58: string;
    public_key_str_base58: string;
    private_key_bytes: Uint8Array;
    pub_key_bytes: Uint8Array;
    mnemonicIndex: number;
    generation_type: Layer2AddressGenerationType;

    constructor(label: string, private_key_str_base58: string, public_key_str_base58: string, private_key_bytes: Uint8Array, pub_key_bytes: Uint8Array) {
        this.label = label;
        this.private_key_str_base58 = private_key_str_base58;
        this.public_key_str_base58 = public_key_str_base58;
        this.private_key_bytes = private_key_bytes;
        this.pub_key_bytes = pub_key_bytes;
        this.mnemonicIndex = -1;
        this.generation_type = Layer2AddressGenerationType.EMPTY;
    }

    // Generates a new address
    generateNewAddress(label: string = '') {
        const [privKeyBytes, pubKeyWithTypePrefixBytes] = this.generateKeypair();
        
        // The first byte is the type of the public key, which is 0x04 for uncompressed, so we slice it off
        const pubKeyBytes = pubKeyWithTypePrefixBytes.slice(1);

        const privKeyB58 = bs58.encode(privKeyBytes);
        const pubKeyB58 = bs58.encode(pubKeyBytes);

        this.private_key_str_base58 = privKeyB58;
        this.public_key_str_base58 = pubKeyB58;
        this.private_key_bytes = privKeyBytes;
        this.pub_key_bytes = pubKeyBytes;
        this.label = label;
        this.generation_type = Layer2AddressGenerationType.NEW;
    }

    // From seed generates a private key from seed string
    fromSeed(seed: string, label: string = '', mnemonicIndex: number = -1) {
        const privKeyBytes = stringToUint8Array(seed);
        // 2. Hash the bytes using SHA-256 to get a deterministic 32-byte digest
        // This digest is your raw private key material (32 bytes / 256 bits).
        const privateKeyRaw = sha256(privKeyBytes);

        this.fromPrivateKeyBytes(privateKeyRaw, label, mnemonicIndex);
    }

    fromPrivateKeyBytes(privateKeyBytes: Uint8Array, label: string = '', mnemonicIndex: number = -1) {
        const pubKeyWithTypePrefixBytes = secp.getPublicKey(privateKeyBytes, false); // false for uncompressed
                
        // The first byte is the type of the public key, which is 0x04 for uncompressed, so we slice it off
        const pubKeyBytes = pubKeyWithTypePrefixBytes.slice(1);

        const privKeyB58 = bs58.encode(privateKeyBytes);
        const pubKeyB58 = bs58.encode(pubKeyBytes);

        this.private_key_str_base58 = privKeyB58;
        this.public_key_str_base58 = pubKeyB58;
        this.private_key_bytes = privateKeyBytes;
        this.pub_key_bytes = pubKeyBytes;
        this.label = label;
        if (mnemonicIndex >= 0) {
            this.mnemonicIndex = mnemonicIndex;
            this.generation_type = Layer2AddressGenerationType.FROM_MNEMONIC;
        }else{
            this.generation_type = Layer2AddressGenerationType.FROM_PRIVATE_KEY;
        }
    }

    fromPrivateKeyBase58(privateKey: string, label: string = '', mnemonicIndex: number = -1) {
        const privKeyBytes = bs58.decode(privateKey);
        this.fromPrivateKeyBytes(privKeyBytes, label, mnemonicIndex);
    }

    //Generate an address from a public key. This is for verifying signed messages from an address that isnt ours
    fromPublicKey(publicKey: string, label: string = '') {
        const pubKeyWithTypePrefixBytes = secp.getPublicKey(publicKey, false); // false for uncompressed
        
        // The first byte is the type of the public key, which is 0x04 for uncompressed, so we slice it off
        const pubKeyBytes = pubKeyWithTypePrefixBytes.slice(1);

        const pubKeyB58 = bs58.encode(pubKeyBytes);

        this.public_key_str_base58 = pubKeyB58;
        this.pub_key_bytes = pubKeyBytes;
        this.label = label;
        this.generation_type = Layer2AddressGenerationType.FROM_PUBLIC_KEY;
    }


    // Generate a randomly generated pubkey/privkey pair
    generateKeypair(): GeneratedKeypair {
        const privKeyBytes: secp.Bytes = secp.utils.randomPrivateKey();
        const pubKeyWithTypePrefixBytes: secp.Bytes = secp.getPublicKey(privKeyBytes, false); // false for uncompressed
        
        return [privKeyBytes, pubKeyWithTypePrefixBytes];  
    }

    signMessage(message: string): Promise<string> {
        return signMessage(message, this.private_key_str_base58);
    }

    verifyMessage(message: string, signatureB58: string): Promise<boolean> {
        return verifyMessage(message, signatureB58, this.public_key_str_base58);
    }
}

class Layer2Wallet {
    addresses: Layer2Address[];
    mnemonic: string[];
    
    constructor() {
        this.addresses = [];
        this.mnemonic = [];
    }

    fromMnemonic(mnemonic: string[], addressesToGenerate: number = 1) {
        this.mnemonic = mnemonic;
        for (let i = 0; i < addressesToGenerate; i++) {
            const address = new Layer2Address('', '', '', new Uint8Array(), new Uint8Array());
            // Private key is the sha256 of the concattinated mnemonic
            const privKeyBytes = sha256(mnemonic.join('-'));
            address.fromPrivateKeyBytes(privKeyBytes, '', i);
            this.addresses.push(address);
        }   
    }

    generateNewMnemonic() {
        this.mnemonic = [];
        for (let i = 0; i < MNEUMONIC_WORD_COUNT; i++) {
            const randomIndex = Math.floor(Math.random() * MNEUMONIC_WORDLIST.length);
            this.mnemonic.push(MNEUMONIC_WORDLIST[randomIndex]);
        }
    }
}

enum Layer2LedgerTransactionType {
    NONE = 0, // Invalid/uninitialized transaction type
    TRANSFER = 1,  // regular layer2 transfer
    DEPOSIT = 2,  // when a user deposits layer1 btc to a deposit address, then funds get credited to their layer2 pubkey
    WITHDRAWAL_INITIATED = 3,  // when the user initiates a withdrawal to a layer1 btc address (locks that amount)
    WITHDRAWAL_BROADCASTED = 4, // when the transaction is broadcasted and in the mempool
    WITHDRAWAL_CANCELED = 5,  // when the transaction gets removed from the layer1 mempool for any reason
    WITHDRAWAL_CONFIRMED = 6,  // when the withdrawal gets confirmed in the layer1 chain
    INSTRUCTION_GET_DEPOSIT_ADDRESS = 7 // instruction to get a deposit address 
}

class Layer2Transaction {
    // Actual transaction info, fields from the layer2 ledger
    // Also corresponds to GetTransactionsResponseTransaction
    amount: number;
    fee: number;
    source_address: string;
    destination_address: string;
    transaction_type: Layer2LedgerTransactionType;
    layer2_transaction_id: string;
    signature: string;
    signature_date: number | null;
    layer1_transaction_id: string | null;
    timestamp: Date | undefined;

    // Meta/auxillary info
    signed_message: string;
    id: string;
    transaction_type_desc: string;
    locale_date: string;

    constructor(){
        this.amount = 0;
        this.fee = 0;
        this.source_address = "";
        this.destination_address = "";
        this.transaction_type = Layer2LedgerTransactionType.NONE;
        this.layer2_transaction_id = "";
        this.signature = "";
        this.signature_date = null;
        this.layer1_transaction_id = null;
        this.timestamp = undefined;
        this.signed_message = "";
        this.id = "";
        this.transaction_type_desc = "";
        this.locale_date = "";
    }

    fromGetTransactionsResponseTransaction(transaction: GetTransactionsResponseTransaction){
        this.amount = transaction.amount;
        this.fee = transaction.fee;
        this.source_address = transaction.source_address_pubkey;
        this.destination_address = transaction.destination_address_pubkey;
        this.transaction_type = transaction.transaction_type;
        this.layer2_transaction_id = transaction.layer2_transaction_id;
        this.signature = transaction.signature;
        this.signature_date = transaction.signature_date ? transaction.signature_date : null;
        this.layer1_transaction_id = transaction.layer1_transaction_id ? transaction.layer1_transaction_id : null;
        this.timestamp = transaction.timestamp ? new Date(transaction.timestamp) : undefined;
    }   
}

class MessageBuilder{
    layer2LedgerNodeId: string;
    layer2LedgerNodeAssetId: number;
    delimeter: string;

    constructor(layer2LedgerNodeId: string, layer2LedgerAssetId: number){
        this.layer2LedgerNodeId = layer2LedgerNodeId;
        this.layer2LedgerNodeAssetId = layer2LedgerAssetId;
        this.delimeter = " ";
    }

    buildTransferMessage(sourceAddressPubkey: string, destinationAddressPubkey: string, amount: number, fee: number, transactionIdNonce: string){
        const message = (this.layer2LedgerNodeId + this.delimeter + this.layer2LedgerNodeAssetId + this.delimeter + Layer2LedgerTransactionType.TRANSFER + this.delimeter + sourceAddressPubkey + this.delimeter + destinationAddressPubkey + this.delimeter + amount + this.delimeter + fee + this.delimeter + transactionIdNonce);
        return message;
    }

    buildGetDepositAddressMessage(layer2AddressPubKey: string, transactionIdNonce: string){
        const message = (this.layer2LedgerNodeId + this.delimeter + this.layer2LedgerNodeAssetId + this.delimeter + Layer2LedgerTransactionType.INSTRUCTION_GET_DEPOSIT_ADDRESS + this.delimeter + layer2AddressPubKey + this.delimeter + transactionIdNonce);
        return message;
    }

    buildWithdrawalRequestMessage(layer2SourceAddressPubKey: string, layer1WithdrawalAddress: string, transactionIdNonce: string, amount: number){
        const message = (this.layer2LedgerNodeId + this.delimeter + this.layer2LedgerNodeAssetId + this.delimeter + Layer2LedgerTransactionType.WITHDRAWAL_INITIATED + this.delimeter + layer2SourceAddressPubKey + this.delimeter + layer1WithdrawalAddress + this.delimeter + transactionIdNonce + this.delimeter + amount );
        return message;
    }
}

export { Layer2Wallet, Layer2Address, Layer2Transaction, Layer2LedgerTransactionType, MessageBuilder };