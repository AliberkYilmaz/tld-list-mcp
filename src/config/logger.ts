export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

const SENSITIVE_KEYS =
  /(?:api.?key|private.?key|public.?key|authorization|credential|secret|token)/iu;

export function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeForLog);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEYS.test(key) ? '[REDACTED]' : sanitizeForLog(item),
      ]),
    );
  }
  return value;
}

export function createLogger(debugEnabled: boolean): Logger {
  const write = (level: 'debug' | 'error', message: string, metadata?: Record<string, unknown>) => {
    const suffix = metadata ? ` ${JSON.stringify(sanitizeForLog(metadata))}` : '';
    process.stderr.write(`[tld-list-mcp] ${level}: ${message}${suffix}\n`);
  };

  return {
    debug(message, metadata) {
      if (debugEnabled) write('debug', message, metadata);
    },
    error(message, metadata) {
      write('error', message, metadata);
    },
  };
}
