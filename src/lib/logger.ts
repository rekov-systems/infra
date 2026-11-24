type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function log(level: LogLevel, message: string, context?: LogContext) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info(message: string, context?: LogContext) {
    log("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    log("warn", message, context);
  },
  error(message: string, context?: LogContext) {
    log("error", message, context);
  },
};
