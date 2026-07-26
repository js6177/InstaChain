/** Throw if `bun` is not on PATH (required prerequisite for setup/test scripts). */
export function requireBun(): string {
	const bunPath = Bun.which("bun");
	if (!bunPath) {
		throw new Error(
			"bun is required but was not found on PATH. " +
				"Install it from https://bun.sh and try again.",
		);
	}
	return bunPath;
}
