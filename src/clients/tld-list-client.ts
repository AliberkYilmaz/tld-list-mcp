import * as z from 'zod/v4';

import type { Logger } from '../config/logger.js';
import {
  AuthenticationError,
  InputError,
  RateLimitError,
  UpstreamError,
  UpstreamTimeoutError,
} from '../errors/errors.js';
import type { ApiPriceType } from '../domain/types.js';

const apiErrorSchema = z.looseObject({
  code: z.union([z.string(), z.number()]).transform(String),
  message: z.string().optional(),
  parameter: z.union([z.string(), z.array(z.string())]).optional(),
});

const envelopeSchema = z.looseObject({
  status: z.enum(['SUCCESS', 'FAIL']),
  errors: z.array(apiErrorSchema).default([]),
  seconds: z.number().optional(),
  data: z.unknown().optional(),
});

export const rawRegistrarPricingSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  currency: z.string().optional(),
  price: z.union([z.string(), z.number()]).optional(),
  priceOriginal: z.union([z.string(), z.number()]).optional(),
  pricetype: z.enum(['register', 'renewal', 'transfer']).optional(),
  prices: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  pricesOriginal: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  promo: z.looseObject({}).optional(),
  promos: z.array(z.looseObject({})).optional(),
  terms: z.record(z.string(), z.unknown()).optional(),
  notes: z.record(z.string(), z.unknown()).optional(),
  freeFeatures: z
    .array(
      z.looseObject({
        name: z.string(),
        count: z.number().optional(),
        duration: z.number().optional(),
      }),
    )
    .optional(),
});

const categorySchema = z.looseObject({
  id: z.number().optional(),
  idstr: z.string().optional(),
  name: z.string().optional(),
  desc: z.string().optional(),
});

export const rawExtensionSchema = z.looseObject({
  name: z.string(),
  punycode: z.string().optional(),
  registrars: z.array(rawRegistrarPricingSchema).optional(),
  category: z.union([z.array(categorySchema), categorySchema, z.string()]).optional(),
  dnssecSupported: z.boolean().optional(),
  whoisPrivacySupported: z.boolean().optional(),
  hasPremiumDomains: z.record(z.string(), z.boolean()).optional(),
  localPresenceRequired: z.boolean().optional(),
  restrictions: z.string().optional(),
  intendedUsage: z.string().optional(),
  targetMarket: z.string().optional(),
  language: z.string().optional(),
  translation: z.string().optional(),
  registryUrl: z.string().optional(),
  type: z.string().optional(),
  level: z.number().int().optional(),
  registerMinYears: z.number().int().optional(),
  registerMaxYears: z.number().int().optional(),
  renewalMinYears: z.number().int().optional(),
  pricingUpdated: z.string().optional(),
  infoUpdated: z.string().optional(),
});

export const rawCheapestExtensionSchema = z.looseObject({
  name: z.string(),
  punycode: z.string().optional(),
  currency: z.string().optional(),
  cheapest: z
    .looseObject({
      register: z.array(rawRegistrarPricingSchema).optional(),
      renewal: z.array(rawRegistrarPricingSchema).optional(),
      transfer: z.array(rawRegistrarPricingSchema).optional(),
    })
    .optional(),
});

export type RawRegistrarPricing = z.infer<typeof rawRegistrarPricingSchema>;
export type RawExtension = z.infer<typeof rawExtensionSchema>;
export type RawCheapestExtension = z.infer<typeof rawCheapestExtensionSchema>;

export interface TldListClientOptions {
  publicKey: string;
  privateKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
  logger?: Logger;
  sleep?: (milliseconds: number) => Promise<void>;
}

type Endpoint =
  'extension/get' | 'extension/getNames' | 'extension/getCheapestRegistrar' | 'registrar/getIds';

export class TldListClient {
  readonly #publicKey: string;
  readonly #privateKey: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof fetch;
  readonly #logger: Logger | undefined;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  constructor(options: TldListClientOptions) {
    this.#publicKey = options.publicKey;
    this.#privateKey = options.privateKey;
    this.#baseUrl = (options.baseUrl ?? 'https://api.tld-list.com/v1').replace(/\/$/u, '');
    this.#timeoutMs = options.timeoutMs ?? 15_000;
    this.#maxRetries = options.maxRetries ?? 2;
    this.#fetch = options.fetch ?? fetch;
    this.#logger = options.logger;
    this.#sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async getExtensionNames(options?: {
    wantPunycode?: boolean;
    omitExtensionsWithoutRegistrars?: boolean;
  }): Promise<string[]> {
    return this.#post(
      'extension/getNames',
      {
        ...(options?.wantPunycode === undefined ? {} : { wantPunycode: options.wantPunycode }),
        ...(options?.omitExtensionsWithoutRegistrars === undefined
          ? {}
          : { omitExtensionsWithoutRegistrars: options.omitExtensionsWithoutRegistrars }),
      },
      z.array(z.string()),
    );
  }

  async getExtensions(options?: {
    extensions?: string[];
    includeFields?: string[];
    excludeFields?: string[];
    includeRegistrars?: string[];
    excludeRegistrars?: string[];
    omitExtensionsWithoutRegistrars?: boolean;
  }): Promise<RawExtension[]> {
    return this.#post('extension/get', options ?? {}, z.array(rawExtensionSchema));
  }

  async getCheapestRegistrars(options?: {
    pricetypes?: ApiPriceType[];
    extensions?: string[];
    includeRegistrars?: string[];
    excludeRegistrars?: string[];
    omitExtensionsWithoutRegistrars?: boolean;
  }): Promise<RawCheapestExtension[]> {
    return this.#post(
      'extension/getCheapestRegistrar',
      options ?? {},
      z.array(rawCheapestExtensionSchema),
    );
  }

  async getRegistrarIds(): Promise<string[]> {
    return this.#post('registrar/getIds', {}, z.array(z.string()));
  }

  async #post<T>(endpoint: Endpoint, parameters: object, dataSchema: z.ZodType<T>): Promise<T> {
    const body = {
      ...parameters,
      apiKeyPublic: this.#publicKey,
      apiKeyPrivate: this.#privateKey,
    };

    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      try {
        this.#logger?.debug('Calling TLD-List API.', { endpoint, attempt });
        return await this.#requestOnce(endpoint, body, dataSchema);
      } catch (error) {
        if (!isRetryable(error) || attempt === this.#maxRetries) throw error;
        const backoffMs = 250 * 2 ** attempt + Math.floor(Math.random() * 100);
        this.#logger?.debug('Retrying transient TLD-List error.', { endpoint, attempt, backoffMs });
        await this.#sleep(backoffMs);
      }
    }

    throw new UpstreamError('TLD-List', 'Retry loop ended unexpectedly.');
  }

  async #requestOnce<T>(endpoint: Endpoint, body: object, dataSchema: z.ZodType<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const response = await this.#fetch(`${this.#baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) throw new AuthenticationError();
      if (response.status === 429) throw new RateLimitError();

      let json: unknown;
      try {
        json = await response.json();
      } catch (error) {
        throw new UpstreamError('TLD-List', 'Returned a non-JSON response.', {
          cause: error,
          retryable: response.status >= 500,
        });
      }

      if (!response.ok) {
        throw new UpstreamError('TLD-List', `HTTP ${response.status}.`, {
          retryable: response.status >= 500,
        });
      }

      const envelopeResult = envelopeSchema.safeParse(json);
      if (!envelopeResult.success) {
        throw new UpstreamError('TLD-List', 'Returned an unexpected response structure.');
      }

      const envelope = envelopeResult.data;
      if (envelope.status === 'FAIL') throw mapApiErrors(envelope.errors);

      const dataResult = dataSchema.safeParse(envelope.data);
      if (!dataResult.success) {
        throw new UpstreamError(
          'TLD-List',
          'Returned data that does not match the documented schema.',
        );
      }
      return dataResult.data;
    } catch (error) {
      if (controller.signal.aborted) throw new UpstreamTimeoutError('TLD-List', error);
      if (
        error instanceof AuthenticationError ||
        error instanceof RateLimitError ||
        error instanceof InputError ||
        error instanceof UpstreamError
      ) {
        throw error;
      }
      throw new UpstreamError('TLD-List', 'Network request failed.', {
        cause: error,
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function mapApiErrors(errors: Array<z.infer<typeof apiErrorSchema>>): Error {
  const codes = new Set(errors.map((error) => error.code));
  if (codes.has('AUTH_INVALID') || codes.has('ACCOUNT_INACTIVE') || codes.has('NO_ACCESS')) {
    return new AuthenticationError();
  }
  if (codes.has('RATE_LIMITED')) return new RateLimitError();

  const parameters = errors.flatMap((error) => {
    if (Array.isArray(error.parameter)) return error.parameter;
    return error.parameter ? [error.parameter] : [];
  });
  const detail = errors.map((error) => error.message ?? error.code).join('; ');
  if (codes.has('PARAMETER_INVALID') || codes.has('PARAMETER_REQUIRED')) {
    const suffix = parameters.length > 0 ? ` (${parameters.join(', ')})` : '';
    return new InputError(`TLD-List rejected a request parameter${suffix}: ${detail}`);
  }

  const retryable = codes.has('502') || codes.has('SYSTEM') || codes.has('RESPONSE_TIMEOUT');
  return new UpstreamError('TLD-List', detail || 'Request failed.', { retryable });
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof UpstreamTimeoutError || (error instanceof UpstreamError && error.retryable)
  );
}
