import { type BIP32API, BIP32Factory } from "bip32";
import * as bip39 from "bip39";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";

const bip32: BIP32API = BIP32Factory(ecc);

export interface MasterKeys {
	master_xprv: string;
	master_xpub: string;
	derivation_path: string;
	testnet: boolean;
}

export interface BitcoinCoreDescriptor {
	desc: string;
	active: boolean;
	internal: boolean;
	range: number[];
	next_index: number;
	timestamp: number | string;
	label: string;
}

const MAINNET = bitcoin.networks.bitcoin;

const TESTNET: bitcoin.Network = {
	messagePrefix: "\x18Bitcoin Signed Message:\n",
	bech32: "tb",
	bip32: {
		public: 0x043587cf,
		private: 0x04358394,
	},
	pubKeyHash: 0x6f,
	scriptHash: 0xc4,
	wif: 0xef,
};

function networkFor(testnet: boolean): bitcoin.Network {
	return testnet ? TESTNET : MAINNET;
}

export function generateMnemonic(wordCount: 12 | 24 = 12): string {
	const strength = wordCount === 12 ? 128 : 256;
	return bip39.generateMnemonic(strength);
}

export function generateMasterKeysSegwit(
	mnemonic: string,
	testnet = false,
): MasterKeys {
	const seed = bip39.mnemonicToSeedSync(mnemonic);
	const network = networkFor(testnet);
	const root = bip32.fromSeed(seed, network);
	const coinType = testnet ? 1 : 0;
	const account = root.derivePath(`m/84'/${coinType}'/0'`);

	return {
		master_xprv: account.toBase58(),
		master_xpub: account.neutered().toBase58(),
		derivation_path: `m/84'/${coinType}'/0'`,
		testnet,
	};
}

export function deriveAddressFromXpubSegwit(
	masterXpub: string,
	change: number,
	addressIndex: number,
	testnet = false,
): string {
	const network = networkFor(testnet);
	const node = bip32.fromBase58(masterXpub, network);
	const child = node.derive(change).derive(addressIndex);
	const { address } = bitcoin.payments.p2wpkh({
		pubkey: child.publicKey,
		network,
	});
	if (!address) {
		throw new Error("Failed to derive SegWit address from xpub");
	}
	return address;
}

function polymod(c: bigint, val: bigint): bigint {
	const c0 = c >> 35n;
	let next = ((c & 0x7ffffffffn) << 5n) ^ val;
	if (c0 & 1n) next ^= 0xf5dee51989n;
	if (c0 & 2n) next ^= 0xa9fdca3312n;
	if (c0 & 4n) next ^= 0x1bab10e32dn;
	if (c0 & 8n) next ^= 0x3706b1677an;
	if (c0 & 16n) next ^= 0x644d626ffdn;
	return next;
}

export function descriptorChecksum(desc: string): string {
	const INPUT_CHARSET =
		"0123456789()[],'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#\"\\ ";
	const CHECKSUM_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

	let c = 1n;
	let cls = 0n;
	let clscount = 0;

	for (const ch of desc) {
		const pos = INPUT_CHARSET.indexOf(ch);
		if (pos === -1) {
			return "";
		}
		c = polymod(c, BigInt(pos & 31));
		cls = cls * 3n + BigInt(pos >> 5);
		clscount += 1;
		if (clscount === 3) {
			c = polymod(c, cls);
			cls = 0n;
			clscount = 0;
		}
	}
	if (clscount > 0) {
		c = polymod(c, cls);
	}
	for (let j = 0; j < 8; j++) {
		c = polymod(c, 0n);
	}
	c ^= 1n;

	let ret = "";
	for (let j = 0; j < 8; j++) {
		const index = Number((c >> BigInt(5 * (7 - j))) & 31n);
		ret += CHECKSUM_CHARSET[index];
	}
	return ret;
}

export function generateBitcoinCoreDescriptorSegwit(
	masterXprv: string,
	_testnet = false,
	addressRange = 1000,
): BitcoinCoreDescriptor[] {
	const receivingDesc = `wpkh(${masterXprv}/0/*)`;
	const changeDesc = `wpkh(${masterXprv}/1/*)`;

	return [
		{
			desc: `${receivingDesc}#${descriptorChecksum(receivingDesc)}`,
			active: true,
			internal: false,
			range: [0, addressRange],
			next_index: 0,
			timestamp: "now",
			label: "BIP84 Receiving",
		},
		{
			desc: `${changeDesc}#${descriptorChecksum(changeDesc)}`,
			active: true,
			internal: true,
			range: [0, addressRange],
			next_index: 0,
			timestamp: "now",
			label: "BIP84 Change",
		},
	];
}
