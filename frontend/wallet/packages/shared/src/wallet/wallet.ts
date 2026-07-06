import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2';
import bs58 from 'bs58';
import { hmac } from '@noble/hashes/hmac';
import { MNEUMONIC_WORD_COUNT, MNEUMONIC_WORDLIST } from './wordlist';
import type {GetTransactionsResponseTransaction} from '../../../api-layer2ledger/src/generated/models/getTransactionsResponseTransaction';
import type { TransactionType } from '@openl2/openl2-messaging';

secp.etc.hmacSha256Sync = (key, ...msgs) => hmac(sha256, key, secp.etc.concatBytes(...msgs));

function stringToUint8Array(str: string): Uint8Array {
    return new TextEncoder().encode(str);
}

async function signMessage(message: string, privKeyB58: string): Promise<string> {
    const messageHash = sha256(stringToUint8Array(message));
    const privKey = bs58.decode(privKeyB58);
    const signature = await secp.sign(messageHash, privKey);
    const signatureBytes = signature.toCompactRawBytes();
    return bs58.encode(signatureBytes);
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
export type Layer2AddressGenerationType = 'EMPTY' | 'NEW' | 'FROM_MNEMONIC' | 'FROM_PRIVATE_KEY' | 'FROM_PUBLIC_KEY';

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
        this.generation_type = 'EMPTY';
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
        this.generation_type = 'NEW';
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
            this.generation_type = 'FROM_MNEMONIC';
        }else{
            this.generation_type = 'FROM_PRIVATE_KEY';
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
        this.generation_type = 'FROM_PUBLIC_KEY';
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


class Layer2Transaction {
    // Actual transaction info, fields from the layer2 ledger
    // Also corresponds to GetTransactionsResponseTransaction
    amount: number;
    fee: number;
    source_address: string;
    destination_address: string;
    transaction_type: TransactionType;
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
        this.transaction_type = 0 as TransactionType;
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
        this.transaction_type = transaction.transaction_type as TransactionType;
        this.layer2_transaction_id = transaction.layer2_transaction_id;
        this.signature = transaction.signature;
        this.signature_date = transaction.signature_date ? transaction.signature_date : null;
        this.layer1_transaction_id = transaction.layer1_transaction_id ? transaction.layer1_transaction_id : null;
        this.timestamp = transaction.timestamp ? new Date(transaction.timestamp) : undefined;
    }   
}

export { Layer2Wallet, Layer2Address, Layer2Transaction };