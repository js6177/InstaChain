import { createWriteStream, type WriteStream } from "node:fs";
import { Writable } from "node:stream";
import pino, { multistream, type Logger as PinoLogger } from "pino";
import {
	getLogContext,
	getProfilerSessionId,
	getReplicaId,
	resolveReplicaId,
} from "./context";
import { createSessionId } from "./ids";
import { createOtelLogsDestination } from "./otel-logs";
import {
	LOG_SEVERITY_LEVELS,
	LogSeverity,
	type LogSeverityLevel,
} from "./severity";

export interface CreateOpenL2LoggerOptions {
	/** Logical service name included on every structured log entry. */
	serviceName: string;
	/**
	 * Minimum severity to emit. Defaults to {@link LogSeverity.Info}.
	 */
	level?: LogSeverity | LogSeverityLevel;
	/** Override the process session id (mainly for tests). */
	sessionId?: string;
	/**
	 * Docker / process replica identity included on every log as `replica_id`.
	 * Defaults to `OPENL2_REPLICA_ID` or `HOSTNAME` (compose container name).
	 */
	replicaId?: string;
	/** Extra static fields merged into every structured log entry. */
	base?: Record<string, unknown>;
	/**
	 * Optional path for structured NDJSON logs.
	 * OTLP export uses OpenTelemetry (`@openl2/openl2-logger/instrumentation` preload).
	 */
	logFile?: string;
	/**
	 * @deprecated Console always prints the message only. Ignored.
	 */
	prettyJson?: boolean;
}

export interface OpenL2Logger {
	readonly serviceName: string;
	readonly sessionId: string;
	readonly pino: PinoLogger<LogSeverityLevel>;

	child(bindings: Record<string, unknown>): OpenL2Logger;

	info(message: string, fields?: Record<string, unknown>): void;
	performance(message: string, fields?: Record<string, unknown>): void;
	warning(message: string, fields?: Record<string, unknown>): void;
	error(message: string, fields?: Record<string, unknown>): void;
	exception(
		message: string,
		error?: unknown,
		fields?: Record<string, unknown>,
	): void;
	fatal(message: string, fields?: Record<string, unknown>): void;

	/** Log at an explicit severity. */
	log(
		severity: LogSeverity,
		message: string,
		fields?: Record<string, unknown>,
	): void;
}

type SeverityPinoLogger = PinoLogger<LogSeverityLevel>;

interface ParsedLogLine {
	message?: unknown;
}

function wrapPinoLogger(
	pinoLogger: SeverityPinoLogger,
	serviceName: string,
	sessionId: string,
): OpenL2Logger {
	const logAt = (
		severity: LogSeverity,
		message: string,
		fields?: Record<string, unknown>,
	): void => {
		if (fields && Object.keys(fields).length > 0) {
			pinoLogger[severity](fields, message);
			return;
		}
		pinoLogger[severity](message);
	};

	return {
		serviceName,
		sessionId,
		pino: pinoLogger,

		child(bindings: Record<string, unknown>): OpenL2Logger {
			return wrapPinoLogger(
				pinoLogger.child(bindings) as SeverityPinoLogger,
				serviceName,
				sessionId,
			);
		},

		info(message, fields) {
			logAt(LogSeverity.Info, message, fields);
		},
		performance(message, fields) {
			logAt(LogSeverity.Performance, message, fields);
		},
		warning(message, fields) {
			logAt(LogSeverity.Warning, message, fields);
		},
		error(message, fields) {
			logAt(LogSeverity.Error, message, fields);
		},
		exception(message, error, fields) {
			const err =
				error instanceof Error
					? error
					: error === undefined
						? undefined
						: new Error(
								typeof error === "string" ? error : JSON.stringify(error),
							);
			logAt(LogSeverity.Exception, message, {
				...(err ? { err } : {}),
				...fields,
			});
		},
		fatal(message, fields) {
			logAt(LogSeverity.Fatal, message, fields);
		},
		log(severity, message, fields) {
			logAt(severity, message, fields);
		},
	};
}

/** Console sink: human-readable message only (no structured fields). */
function createConsoleMessageDestination(): Writable {
	return new Writable({
		write(chunk, _encoding, callback) {
			const line = chunk.toString();
			try {
				const parsed = JSON.parse(line) as ParsedLogLine;
				const message =
					typeof parsed.message === "string" ? parsed.message : line.trim();
				process.stdout.write(`${message}\n`);
			} catch {
				process.stdout.write(line.endsWith("\n") ? line : `${line}\n`);
			}
			callback();
		},
	});
}

function createLogFileDestination(logFile: string): WriteStream {
	return createWriteStream(logFile, { flags: "a" });
}

/**
 * Create a service-scoped OpenL2 logger backed by Pino.
 *
 * Console output is the log message only. Structured fields go to
 * {@link CreateOpenL2LoggerOptions.logFile} (optional) and to OpenTelemetry
 * Logs when `@openl2/openl2-logger/instrumentation` is preloaded.
 *
 * `session_id` is generated once per call and remains stable for the
 * lifetime of the returned logger instance (typically one per process).
 */
export function createOpenL2Logger(
	options: CreateOpenL2LoggerOptions,
): OpenL2Logger {
	const sessionId = options.sessionId ?? createSessionId();
	const serviceName = options.serviceName;
	const level = options.level ?? LogSeverity.Info;
	const replicaId = resolveReplicaId(options.replicaId);

	const streams: Parameters<typeof multistream>[0] = [
		{ level, stream: createConsoleMessageDestination() },
		{ level, stream: createOtelLogsDestination() },
	];

	if (options.logFile) {
		streams.push({
			level,
			stream: createLogFileDestination(options.logFile),
		});
	}

	const pinoLogger = pino(
		{
			level,
			base: {
				service: serviceName,
				session_id: sessionId,
				...(replicaId ? { replica_id: replicaId } : {}),
				...options.base,
			},
			customLevels: LOG_SEVERITY_LEVELS,
			useOnlyCustomLevels: true,
			messageKey: "message",
			formatters: {
				level(label) {
					return { severity: label };
				},
			},
			mixin() {
				const fields: Record<string, string> = {};
				const requestId = getLogContext()?.request_id;
				if (requestId) {
					fields.request_id = requestId;
				}
				const profilerSessionId = getProfilerSessionId();
				if (profilerSessionId) {
					fields.profiler_session_id = profilerSessionId;
				}
				// Prefer request-scoped override; otherwise base already has replica_id.
				const contextReplicaId = getReplicaId();
				if (contextReplicaId && contextReplicaId !== replicaId) {
					fields.replica_id = contextReplicaId;
				}
				return fields;
			},
		},
		multistream(streams, {
			levels: { ...LOG_SEVERITY_LEVELS },
			dedupe: true,
		}),
	) as SeverityPinoLogger;

	return wrapPinoLogger(pinoLogger, serviceName, sessionId);
}
