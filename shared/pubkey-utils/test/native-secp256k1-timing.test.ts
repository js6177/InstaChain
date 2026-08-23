import { describe, expect, it } from "bun:test";
import bs58 from "bs58";
import * as secp256k1 from "secp256k1";
import { Layer2Address, signMessage, verifyMessage } from "../src/pubkey-utils";

function sha256(data: string | Uint8Array): Uint8Array {
	return new Bun.CryptoHasher("sha256").update(data).digest();
}

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
	return new Bun.CryptoHasher("sha256", key).update(data).digest();
}

function randomPrivateKey(): Uint8Array {
	let privateKey: Uint8Array;
	do {
		privateKey = crypto.getRandomValues(new Uint8Array(32));
	} while (!secp256k1.privateKeyVerify(privateKey));
	return privateKey;
}

function signMessageNative(
	message: string,
	privKeyBytes: Uint8Array,
): Uint8Array {
	const messageHash = sha256(message);
	const { signature } = secp256k1.ecdsaSign(messageHash, privKeyBytes);
	return secp256k1.signatureNormalize(signature);
}

function verifyMessageNative(
	message: string,
	signature: Uint8Array,
	pubKeyUncompressed: Uint8Array,
): boolean {
	try {
		const messageHash = sha256(message);
		return secp256k1.ecdsaVerify(
			signature,
			messageHash,
			pubKeyUncompressed,
		);
	} catch {
		return false;
	}
}

function averageMs(samples: readonly number[]): number {
	if (samples.length === 0) {
		return 0;
	}
	const sum = samples.reduce((total, value) => total + value, 0);
	return Number((sum / samples.length).toFixed(4));
}

describe("native secp256k1 + Bun.CryptoHasher", () => {
	it("hashes with Bun.CryptoHasher (sha256 + hmac-sha256)", () => {
		const digest = sha256("hello");
		expect(digest).toBeInstanceOf(Uint8Array);
		expect(digest.length).toBe(32);
		expect(Buffer.from(digest).toString("hex")).toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);

		const key = new TextEncoder().encode("key");
		const msg = new TextEncoder().encode("msg");
		const mac = hmacSha256(key, msg);
		expect(mac.length).toBe(32);
	});

	it("signs and verifies a message round-trip", () => {
		const privateKey = randomPrivateKey();
		const publicKey = secp256k1.publicKeyCreate(privateKey, false);
		expect(publicKey.length).toBe(65);
		expect(publicKey[0]).toBe(0x04);

		const message = "native-secp256k1-round-trip";
		const signature = signMessageNative(message, privateKey);
		expect(signature.length).toBe(64);
		expect(verifyMessageNative(message, signature, publicKey)).toBe(true);
		expect(
			verifyMessageNative(`${message}-tampered`, signature, publicKey),
		).toBe(false);
	});

	it("rejects an invalid signature", () => {
		const privateKey = randomPrivateKey();
		const publicKey = secp256k1.publicKeyCreate(privateKey, false);
		const signature = signMessageNative("ok", privateKey);
		const broken = new Uint8Array(signature);
		broken[0] ^= 0xff;
		expect(verifyMessageNative("ok", broken, publicKey)).toBe(false);
	});

	it(
		"reports native sign/verify throughput",
		() => {
			const messageCount = Number(
				process.env.VERIFY_BENCH_COUNT ?? "1000",
			);
			expect(Number.isFinite(messageCount) && messageCount > 0).toBe(
				true,
			);

			const privateKey = randomPrivateKey();
			const publicKey = secp256k1.publicKeyCreate(privateKey, false);
			const messages: string[] = [];
			for (let i = 0; i < messageCount; i++) {
				messages.push(`native-bench-${i}-${crypto.randomUUID()}`);
			}

			const signed: Uint8Array[] = [];
			const signLatenciesMs: number[] = [];
			for (const message of messages) {
				const startedAt = performance.now();
				signed.push(signMessageNative(message, privateKey));
				signLatenciesMs.push(performance.now() - startedAt);
			}

			const firstMessage = messages[0];
			const firstSignature = signed[0];
			expect(firstMessage).toBeDefined();
			expect(firstSignature).toBeDefined();
			if (firstMessage === undefined || firstSignature === undefined) {
				throw new Error("expected at least one signed message");
			}

			// Warm up verify path once so the timed loop is steady-state.
			expect(
				verifyMessageNative(firstMessage, firstSignature, publicKey),
			).toBe(true);

			const verifyLatenciesMs: number[] = [];
			for (let i = 0; i < messages.length; i++) {
				const message = messages[i];
				const signature = signed[i];
				expect(message).toBeDefined();
				expect(signature).toBeDefined();
				if (message === undefined || signature === undefined) {
					throw new Error("missing signed message");
				}
				const startedAt = performance.now();
				const valid = verifyMessageNative(
					message,
					signature,
					publicKey,
				);
				verifyLatenciesMs.push(performance.now() - startedAt);
				expect(valid).toBe(true);
			}

			const avgSignMs = averageMs(signLatenciesMs);
			const avgVerifyMs = averageMs(verifyLatenciesMs);
			const verifyElapsedMs = verifyLatenciesMs.reduce(
				(total, value) => total + value,
				0,
			);
			const verifiesPerSecond = Number(
				((messageCount / Math.max(verifyElapsedMs, 1)) * 1000).toFixed(
					2,
				),
			);

			console.log(
				`native secp256k1 verification timing: ${verifiesPerSecond} verifies/s ` +
					`(messages=${messageCount}, avg_sign_ms=${avgSignMs}, ` +
					`avg_verify_ms=${avgVerifyMs})`,
			);

			// Sanity: base58 encode/decode path used by Layer2 addresses.
			const signatureB58 = bs58.encode(firstSignature);
			const pubKeyB58 = bs58.encode(publicKey.slice(1));
			const restoredSig = bs58.decode(signatureB58);
			const restoredPub = new Uint8Array(65);
			restoredPub[0] = 0x04;
			restoredPub.set(bs58.decode(pubKeyB58), 1);
			expect(
				verifyMessageNative(firstMessage, restoredSig, restoredPub),
			).toBe(true);

			expect(verifiesPerSecond).toBeGreaterThan(0);
		},
		{ timeout: 180_000 },
	);
});

describe("Layer2Address with native secp256k1", () => {
	it("signs and verifies via pubkey-utils API", async () => {
		const address = new Layer2Address(
			"",
			"",
			"",
			new Uint8Array(),
			new Uint8Array(),
		);
		address.generateNewAddress();

		const message = "layer2-native-round-trip";
		const signature = await address.signMessage(message);
		expect(await address.verifyMessage(message, signature)).toBe(true);
		expect(await address.verifyMessage(`${message}-x`, signature)).toBe(
			false,
		);

		expect(
			await verifyMessage(
				message,
				signature,
				address.public_key_str_base58,
			),
		).toBe(true);
		expect(
			await signMessage(message, address.private_key_str_base58),
		).toBe(signature);
	});

	it("derives deterministic keys from seed", () => {
		const a = new Layer2Address(
			"",
			"",
			"",
			new Uint8Array(),
			new Uint8Array(),
		);
		const b = new Layer2Address(
			"",
			"",
			"",
			new Uint8Array(),
			new Uint8Array(),
		);
		a.fromSeed("seed-phrase-for-test");
		b.fromSeed("seed-phrase-for-test");
		expect(a.public_key_str_base58).toBe(b.public_key_str_base58);
		expect(a.private_key_str_base58).toBe(b.private_key_str_base58);
	});
});
