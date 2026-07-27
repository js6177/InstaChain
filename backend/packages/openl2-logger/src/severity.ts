/** Severity levels emitted on every OpenL2 log entry. */
export enum LogSeverity {
	Info = "info",
	Warning = "warning",
	Error = "error",
	Exception = "exception",
	Fatal = "fatal",
}

/** Pino custom level values aligned with {@link LogSeverity}. */
export const LOG_SEVERITY_LEVELS = {
	[LogSeverity.Info]: 30,
	[LogSeverity.Warning]: 40,
	[LogSeverity.Error]: 50,
	[LogSeverity.Exception]: 60,
	[LogSeverity.Fatal]: 70,
} as const;

export type LogSeverityLevel = keyof typeof LOG_SEVERITY_LEVELS;
