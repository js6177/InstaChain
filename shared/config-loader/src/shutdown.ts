let shutdownInstalled = false;

/** Exit promptly on container stop (Docker SIGTERM) instead of waiting for stop_grace_period. */
export function registerProcessShutdown(
	cleanup?: () => void | Promise<void>,
): void {
	if (shutdownInstalled) {
		return;
	}
	shutdownInstalled = true;

	let shuttingDown = false;
	const handle = (signal: NodeJS.Signals): void => {
		if (shuttingDown) {
			return;
		}
		shuttingDown = true;
		console.log(`Received ${signal}, shutting down`);
		void Promise.resolve(cleanup?.()).finally(() => process.exit(0));
	};

	process.on("SIGTERM", handle);
	process.on("SIGINT", handle);
}
