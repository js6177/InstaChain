/** Create a new opaque id for sessions or requests. */
export function createId(): string {
	return crypto.randomUUID();
}

/** Create a request id suitable for client propagation. */
export function createRequestId(): string {
	return createId();
}

/** Create a session id for a backend service process lifetime. */
export function createSessionId(): string {
	return createId();
}
