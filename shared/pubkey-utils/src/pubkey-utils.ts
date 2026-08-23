import bs58 from "bs58";
import * as secp256k1 from "secp256k1";

function stringToUint8Array(str: string): Uint8Array {
	return new TextEncoder().encode(str);
}

function sha256(data: string | Uint8Array): Uint8Array {
	return new Bun.CryptoHasher("sha256").update(data).digest();
}

function randomPrivateKey(): Uint8Array {
	let privateKey: Uint8Array;
	do {
		privateKey = crypto.getRandomValues(new Uint8Array(32));
	} while (!secp256k1.privateKeyVerify(privateKey));
	return privateKey;
}

/** Uncompressed SEC1 pubkey (65 bytes, 0x04 || X || Y) from stored 64-byte XY. */
function toUncompressedPublicKey(pubKeyXy: Uint8Array): Uint8Array {
	const uncompressed = new Uint8Array(65);
	uncompressed[0] = 0x04;
	uncompressed.set(pubKeyXy, 1);
	return uncompressed;
}

async function signMessage(
	message: string,
	privKeyB58: string,
): Promise<string> {
	const messageHash = sha256(stringToUint8Array(message));
	const privKey = bs58.decode(privKeyB58);
	const { signature } = secp256k1.ecdsaSign(messageHash, privKey);
	const normalized = secp256k1.signatureNormalize(signature);
	return bs58.encode(normalized);
}

async function verifyMessage(
	message: string,
	signatureB58: string,
	publicKeyB58: string,
): Promise<boolean> {
	try {
		const messageHash = sha256(stringToUint8Array(message));
		const signatureBytes = bs58.decode(signatureB58);
		const publicKeyBytes = bs58.decode(publicKeyB58);
		const uncompressedPubKey = toUncompressedPublicKey(publicKeyBytes);
		return secp256k1.ecdsaVerify(
			signatureBytes,
			messageHash,
			uncompressedPubKey,
		);
	} catch {
		return false;
	}
}

type GeneratedKeypair = [
	privKeyBytes: Uint8Array,
	pubKeyWithTypePrefixBytes: Uint8Array,
];
export type Layer2AddressGenerationType =
	| "EMPTY"
	| "NEW"
	| "FROM_MNEMONIC"
	| "FROM_PRIVATE_KEY"
	| "FROM_PUBLIC_KEY";

class Layer2Address {
	label: string;
	private_key_str_base58: string;
	public_key_str_base58: string;
	private_key_bytes: Uint8Array;
	pub_key_bytes: Uint8Array;
	mnemonicIndex: number;
	generation_type: Layer2AddressGenerationType;

	constructor(
		label: string,
		private_key_str_base58: string,
		public_key_str_base58: string,
		private_key_bytes: Uint8Array,
		pub_key_bytes: Uint8Array,
	) {
		this.label = label;
		this.private_key_str_base58 = private_key_str_base58;
		this.public_key_str_base58 = public_key_str_base58;
		this.private_key_bytes = private_key_bytes;
		this.pub_key_bytes = pub_key_bytes;
		this.mnemonicIndex = -1;
		this.generation_type = "EMPTY";
	}

	// Generates a new address
	generateNewAddress(label: string = ""): void {
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
		this.generation_type = "NEW";
	}

	// From seed generates a private key from seed string
	fromSeed(seed: string, label: string = "", mnemonicIndex: number = -1): void {
		const privKeyBytes = stringToUint8Array(seed);
		// 2. Hash the bytes using SHA-256 to get a deterministic 32-byte digest
		// This digest is your raw private key material (32 bytes / 256 bits).
		const privateKeyRaw = sha256(privKeyBytes);

		this.fromPrivateKeyBytes(privateKeyRaw, label, mnemonicIndex);
	}

	fromPrivateKeyBytes(
		privateKeyBytes: Uint8Array,
		label: string = "",
		mnemonicIndex: number = -1,
	): void {
		const pubKeyWithTypePrefixBytes = secp256k1.publicKeyCreate(
			privateKeyBytes,
			false,
		); // false for uncompressed

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
			this.generation_type = "FROM_MNEMONIC";
		} else {
			this.generation_type = "FROM_PRIVATE_KEY";
		}
	}

	fromPrivateKeyBase58(
		privateKey: string,
		label: string = "",
		mnemonicIndex: number = -1,
	): void {
		const privKeyBytes = bs58.decode(privateKey);
		this.fromPrivateKeyBytes(privKeyBytes, label, mnemonicIndex);
	}

	//Generate an address from a public key. This is for verifying signed messages from an address that isnt ours
	fromPublicKey(publicKey: string, label: string = ""): void {
		const decoded = bs58.decode(publicKey);
		let pubKeyBytes: Uint8Array;
		if (decoded.length === 64) {
			pubKeyBytes = decoded;
		} else if (decoded.length === 65 && decoded[0] === 0x04) {
			pubKeyBytes = decoded.slice(1);
		} else if (decoded.length === 33) {
			const uncompressed = secp256k1.publicKeyConvert(decoded, false);
			pubKeyBytes = uncompressed.slice(1);
		} else {
			throw new Error("Invalid public key encoding");
		}

		const uncompressed = toUncompressedPublicKey(pubKeyBytes);
		if (!secp256k1.publicKeyVerify(uncompressed)) {
			throw new Error("Invalid public key");
		}

		const pubKeyB58 = bs58.encode(pubKeyBytes);

		this.public_key_str_base58 = pubKeyB58;
		this.pub_key_bytes = pubKeyBytes;
		this.label = label;
		this.generation_type = "FROM_PUBLIC_KEY";
	}

	// Generate a randomly generated pubkey/privkey pair
	generateKeypair(): GeneratedKeypair {
		const privKeyBytes = randomPrivateKey();
		const pubKeyWithTypePrefixBytes = secp256k1.publicKeyCreate(
			privKeyBytes,
			false,
		); // false for uncompressed

		return [privKeyBytes, pubKeyWithTypePrefixBytes];
	}

	signMessage(message: string): Promise<string> {
		return signMessage(message, this.private_key_str_base58);
	}

	verifyMessage(message: string, signatureB58: string): Promise<boolean> {
		return verifyMessage(message, signatureB58, this.public_key_str_base58);
	}
}

function createLayer2AddressPubkey(mneumonic: string): string {
	const l2Address = new Layer2Address(
		"",
		"",
		"",
		new Uint8Array(),
		new Uint8Array(),
	);
	l2Address.fromSeed(mneumonic);
	return l2Address.public_key_str_base58;
}

function isPubkeyValidChars(pubkey: string | null): boolean {
	return pubkey !== null && /^[a-zA-Z0-9]+$/.test(pubkey);
}

export {
	createLayer2AddressPubkey,
	isPubkeyValidChars,
	Layer2Address,
	signMessage,
	verifyMessage,
};
