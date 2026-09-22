export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  requestId?: string;
  traceId?: string;
  [key: string]: unknown;
}

export interface CreateLoggerOptions {
  service: string;
  level?: LogLevel;
}

export interface Logger {
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(options: CreateLoggerOptions): Logger {
  const minWeight = LEVEL_WEIGHT[options.level ?? 'info'];

  const write = (
    level: LogLevel,
    message: string,
    fields?: LogFields,
  ): void => {
    if (LEVEL_WEIGHT[level] < minWeight) {
      return;
    }
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      service: options.service,
      level,
      message,
      ...fields,
    });
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  };

  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  };
}
