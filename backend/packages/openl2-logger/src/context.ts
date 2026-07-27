import { AsyncLocalStorage } from "node:async_hooks";

export interface LogContext {
	request_id?: string;
}

const logContextStorage = new AsyncLocalStorage<LogContext>();

/** Read the current request-scoped log context, if any. */
export function getLogContext(): LogContext | undefined {
	return logContextStorage.getStore();
}

/** Read the current request_id from async context. */
export function getRequestId(): string | undefined {
	return logContextStorage.getStore()?.request_id;
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
