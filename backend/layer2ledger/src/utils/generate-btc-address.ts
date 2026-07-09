import { BIP32Factory } from 'bip32';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

const bip32 = BIP32Factory(ecc);

const TESTNET = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'tb',
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

export function generateBtcTestnetAddress(
  masterPublicKey: string,
  addressIndex: number,
): string | null {
  try {
    const node = bip32.fromBase58(masterPublicKey, TESTNET);
    const child = node.derive(0).derive(addressIndex);
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: child.publicKey,
      network: TESTNET,
    });
    return address ?? null;
  } catch {
    return null;
  }
}
