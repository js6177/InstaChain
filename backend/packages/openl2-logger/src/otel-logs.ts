import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { Writable } from "node:stream";
import type { LogSeverityLevel } from "./severity";

const SEVERITY_NUMBER: Record<LogSeverityLevel, SeverityNumber> = {
	info: SeverityNumber.INFO,
	performance: SeverityNumber.INFO2,
	warning: SeverityNumber.WARN,
	error: SeverityNumber.ERROR,
	exception: SeverityNumber.ERROR3,
	fatal: SeverityNumber.FATAL,
};

const OMIT_KEYS = new Set([
	"message",
	"severity",
	"level",
	"time",
	"pid",
	"hostname",
]);

interface ParsedLogLine {
	message?: unknown;
	severity?: unknown;
	[key: string]: unknown;
}

function toAttributeValue(
	value: unknown,
): string | number | boolean | undefined {
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}
	if (value == null) {
		return undefined;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

/**
 * Pino destination that emits each log line through the OpenTelemetry Logs API.
 * No-op until NodeSDK is started (see `@openl2/openl2-logger/instrumentation`).
 */
export function createOtelLogsDestination(): Writable {
	const otelLogger = logs.getLogger("openl2-logger", "1");

	return new Writable({
		write(chunk, _encoding, callback) {
			try {
				const parsed = JSON.parse(String(chunk)) as ParsedLogLine;
				const severityText =
					typeof parsed.severity === "string" ? parsed.severity : "info";
				const severityNumber =
					SEVERITY_NUMBER[severityText as LogSeverityLevel] ??
					SeverityNumber.INFO;
				const body =
					typeof parsed.message === "string"
						? parsed.message
						: String(chunk).trim();

				const attributes: Record<string, string | number | boolean> = {};
				for (const [key, value] of Object.entries(parsed)) {
					if (OMIT_KEYS.has(key)) {
						continue;
					}
					const attr = toAttributeValue(value);
					if (attr !== undefined) {
						attributes[key] = attr;
					}
				}

				otelLogger.emit({
					body,
					severityText,
					severityNumber,
					attributes,
				});
			} catch {
				/* ignore malformed pino lines */
			}
			callback();
		},
	});
}
