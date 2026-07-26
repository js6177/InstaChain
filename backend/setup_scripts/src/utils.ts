export function str2bool(value: string | boolean): boolean {
	if (typeof value === "boolean") {
		return value;
	}
	const normalized = value.toLowerCase();
	if (["yes", "true", "t", "y", "1"].includes(normalized)) {
		return true;
	}
	if (["no", "false", "f", "n", "0"].includes(normalized)) {
		return false;
	}
	throw new Error(`Boolean value expected, got: ${value}`);
}

export function generateSecurePassword(length = 32): string {
	// Exclude '#' — ambiguous in bitcoin.conf (starts a comment).
	const alphabet =
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@$%^&*()-_=+";
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	let password = "";
	for (const byte of bytes) {
		password += alphabet[byte % alphabet.length];
	}
	return password;
}

export function generateAlphanumericId(length = 16): string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	let id = "";
	for (const byte of bytes) {
		id += alphabet[byte % alphabet.length];
	}
	return id;
}
