import * as crypto from 'crypto';
import bs58 from 'bs58';
import secp256k1 from 'secp256k1';

// Creates a layer 2 address from a mneumonic
export function createLayer2AddressPubkey(mneumonic: string): string{
    const seed = crypto.createHash('sha256').update(mneumonic).digest().toString('hex');
    const privateKey = crypto.createHash('sha256').update(seed).digest();
    const publicKey = secp256k1.publicKeyCreate(privateKey, false);
    const base58encodedPublicKey = bs58.encode(publicKey);
    console.log(base58encodedPublicKey);
    return base58encodedPublicKey;
}