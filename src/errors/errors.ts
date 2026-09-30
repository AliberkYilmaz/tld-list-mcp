export type ErrorCode =
  | 'AUTHENTICATION_ERROR'
  | 'RATE_LIMITED'
  | 'UNSUPPORTED_TLD'
  | 'UNKNOWN_REGISTRAR'
  | 'INVALID_INPUT'
  | 'MALFORMED_DOMAIN'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'UNAVAILABLE_FUNCTIONALITY'
  | 'CONFIGURATION_ERROR';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'TLD-List rejected the configured API credentials.') {
    super('AUTHENTICATION_ERROR', message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'TLD-List rate limit reached. Try again after the limit window resets.') {
    super('RATE_LIMITED', message);
  }
}

export class InputError extends AppError {
  constructor(message: string, code: ErrorCode = 'INVALID_INPUT') {
    super(code, message);
  }
}

export class UpstreamTimeoutError extends AppError {
  constructor(service: string, cause?: unknown) {
    super('UPSTREAM_TIMEOUT', `${service} did not respond before the configured timeout.`, {
      cause,
      retryable: true,
    });
  }
}

export class UpstreamError extends AppError {
  constructor(
    service: string,
    message: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super('UPSTREAM_ERROR', `${service}: ${message}`, options);
  }
}

export class UnavailableFunctionalityError extends AppError {
  constructor(message: string) {
    super('UNAVAILABLE_FUNCTIONALITY', message);
  }
}

export function safeError(error: unknown): {
  code: ErrorCode;
  message: string;
  retryable: boolean;
} {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }

  return {
    code: 'UPSTREAM_ERROR',
    message: 'The operation failed unexpectedly. Enable debug logging for local diagnostics.',
    retryable: false,
  };
}
