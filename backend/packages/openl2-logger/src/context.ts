import { AsyncLocalStorage } from "node:async_hooks";

export interface LogContext {
	request_id?: string;
	/** Active profiler session id for correlating performance logs. */
	profiler_session_id?: string;
	/**
	 * Docker / process replica identity (e.g. compose container hostname).
	 * Prefer the process-wide value from {@link resolveReplicaId}.
	 */
	replica_id?: string;
}

const logContextStorage = new AsyncLocalStorage<LogContext>();

/** Process-wide profiler session (set by start/stopProfilerSession on a replica). */
let processProfilerSessionId: string | undefined;

/** Process-wide replica id override (defaults from env / hostname). */
let processReplicaId: string | undefined;

/** Read the current request-scoped log context, if any. */
export function getLogContext(): LogContext | undefined {
	return logContextStorage.getStore();
}

/** Read the current request_id from async context. */
export function getRequestId(): string | undefined {
	return logContextStorage.getStore()?.request_id;
}

/**
 * Read the active profiler session id from request context, or the process-wide
 * value set by {@link setProfilerSessionId}.
 */
export function getProfilerSessionId(): string | undefined {
	return (
		logContextStorage.getStore()?.profiler_session_id ?? processProfilerSessionId
	);
}

/**
 * Set or clear the process-wide profiler session id included on every log line
 * via the logger mixin as `profiler_session_id`.
 */
export function setProfilerSessionId(sessionId: string | undefined): void {
	processProfilerSessionId = sessionId;
}

/**
 * Resolve the replica id for this process.
 *
 * Order: explicit override → {@link setReplicaId} → `OPENL2_REPLICA_ID` →
 * `HOSTNAME` (Docker Compose sets this to the container name, e.g.
 * `…-layer2ledgerapihandler-3`).
 */
export function resolveReplicaId(explicit?: string): string | undefined {
	const fromExplicit = explicit?.trim();
	if (fromExplicit) {
		return fromExplicit;
	}
	if (processReplicaId) {
		return processReplicaId;
	}
	const fromEnv = process.env.OPENL2_REPLICA_ID?.trim();
	if (fromEnv) {
		return fromEnv;
	}
	const fromHostname = process.env.HOSTNAME?.trim();
	return fromHostname || undefined;
}

/** Read the active replica id (request context, then process-wide resolution). */
export function getReplicaId(): string | undefined {
	return logContextStorage.getStore()?.replica_id ?? resolveReplicaId();
}

/**
 * Set or clear the process-wide replica id included on every log line as
 * `replica_id`.
 */
export function setReplicaId(replicaId: string | undefined): void {
	processReplicaId = replicaId?.trim() || undefined;
}

/**
 * Bind log context for the remainder of the current async resource chain.
 * Prefer this in server lifecycle hooks that cannot wrap the handler callback.
 *
 * Note: `enterWith` can segfault under Bun + Elysia derive; prefer child
 * loggers with `request_id` bindings in request handlers.
 */
export function enterLogContext(context: LogContext): void {
	logContextStorage.enterWith(context);
}

/**
 * Run `fn` with the given log context bound for the async call chain.
 */
export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
	return logContextStorage.run(context, fn);
}
