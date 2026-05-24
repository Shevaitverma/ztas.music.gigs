type LogLevel = "info" | "warn" | "error" | "debug";

interface LogPayload {
  [key: string]: unknown;
}

interface Logger {
  info: (message: string, payload?: LogPayload) => void;
  warn: (message: string, payload?: LogPayload) => void;
  error: (message: string, payload?: LogPayload) => void;
  debug: (message: string, payload?: LogPayload) => void;
}

const isDevelopment = process.env.NODE_ENV === "development";

function formatMessage(level: LogLevel, message: string, payload?: LogPayload): string {
  const timestamp = new Date().toISOString();
  const payloadStr = payload ? ` ${JSON.stringify(payload)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${payloadStr}`;
}

function log(level: LogLevel, message: string, payload?: LogPayload): void {
  const formattedMessage = formatMessage(level, message, payload);

  switch (level) {
    case "info":
      // eslint-disable-next-line no-console
      console.info(formattedMessage);
      break;
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(formattedMessage);
      break;
    case "error":
      // eslint-disable-next-line no-console
      console.error(formattedMessage);
      break;
    case "debug":
      if (isDevelopment) {
        // eslint-disable-next-line no-console
        console.debug(formattedMessage);
      }
      break;
  }
}

export const logger: Logger = {
  info: (message: string, payload?: LogPayload) => log("info", message, payload),
  warn: (message: string, payload?: LogPayload) => log("warn", message, payload),
  error: (message: string, payload?: LogPayload) => log("error", message, payload),
  debug: (message: string, payload?: LogPayload) => log("debug", message, payload),
};


