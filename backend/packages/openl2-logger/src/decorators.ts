import type { OpenL2Logger } from "./logger";

/**
 * Stage 3 method decorator that logs method duration at {@link LogSeverity.Performance}.
 *
 * @example
 * ```ts
 * class Handlers {
 *   @logPerformance(log)
 *   async pushTransaction(body: PushTransactionRequest) { ... }
 * }
 * ```
 */
export function logPerformance(logger: OpenL2Logger) {
	return <This, Args extends unknown[], Return>(
		target: (this: This, ...args: Args) => Return | Promise<Return>,
		context: ClassMethodDecoratorContext<
			This,
			(this: This, ...args: Args) => Return | Promise<Return>
		>,
	) => {
		const methodName = String(context.name);

		return async function (
			this: This,
			...args: Args
		): Promise<Awaited<Return>> {
			const startedAt = performance.now();
			try {
				return await target.call(this, ...args);
			} finally {
				logger.performance(`${methodName} completed`, {
					method: methodName,
					elapsed_ms: Math.round(performance.now() - startedAt),
				});
			}
		};
	};
}
