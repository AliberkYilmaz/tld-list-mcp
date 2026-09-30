import * as z from 'zod/v4';

import type { Cache } from '../cache/cache.js';
import type { Logger } from '../config/logger.js';
import { UpstreamError, UpstreamTimeoutError } from '../errors/errors.js';

const IANA_RDAP_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';

const bootstrapSchema = z.looseObject({
  services: z.array(z.tuple([z.array(z.string()), z.array(z.url())])),
});

type RdapServices = z.infer<typeof bootstrapSchema>['services'];

export type RdapLookupResult =
  | { status: 'registered'; httpStatus: number }
  | { status: 'not_found'; httpStatus: 404 }
  | { status: 'unknown'; httpStatus?: number; reason: string };

export interface RdapClientOptions {
  cache: Cache;
  timeoutMs?: number;
  bootstrapTtlMs?: number;
  domainTtlMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
  logger?: Logger;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class RdapClient {
  readonly #cache: Cache;
  readonly #timeoutMs: number;
  readonly #bootstrapTtlMs: number;
  readonly #domainTtlMs: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof fetch;
  readonly #logger: Logger | undefined;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  #bootstrapPromise: Promise<RdapServices> | undefined;

  constructor(options: RdapClientOptions) {
    this.#cache = options.cache;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#bootstrapTtlMs = options.bootstrapTtlMs ?? 86_400_000;
    this.#domainTtlMs = options.domainTtlMs ?? 300_000;
    this.#maxRetries = options.maxRetries ?? 1;
    this.#fetch = options.fetch ?? fetch;
    this.#logger = options.logger;
    this.#sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async lookupDomain(domain: string): Promise<{ result: RdapLookupResult; cached: boolean }> {
    const cacheKey = `rdap:domain:${domain}`;
    const cached = this.#cache.get<RdapLookupResult>(cacheKey);
    if (cached) return { result: cached, cached: true };

    const baseUrl = await this.#findBaseUrl(domain);
    if (!baseUrl) {
      const result: RdapLookupResult = {
        status: 'unknown',
        reason: 'No HTTPS RDAP service is listed for this TLD in the IANA bootstrap registry.',
      };
      this.#cache.set(cacheKey, result, this.#domainTtlMs);
      return { result, cached: false };
    }

    const result = await this.#fetchDomain(
      `${baseUrl.replace(/\/$/u, '')}/domain/${encodeURIComponent(domain)}`,
    );
    this.#cache.set(cacheKey, result, this.#domainTtlMs);
    return { result, cached: false };
  }

  async #findBaseUrl(domain: string): Promise<string | undefined> {
    const tld = domain.split('.').at(-1)?.toLowerCase();
    if (!tld) return undefined;
    const services = await this.#getBootstrap();

    for (const [tlds, urls] of services) {
      if (!tlds.some((candidate) => candidate.toLowerCase() === tld)) continue;
      return urls.find((url) => url.startsWith('https://'));
    }
    return undefined;
  }

  async #getBootstrap(): Promise<RdapServices> {
    const cacheKey = 'rdap:iana-bootstrap:dns';
    const cached = this.#cache.get<RdapServices>(cacheKey);
    if (cached) return cached;

    if (this.#bootstrapPromise) return this.#bootstrapPromise;
    this.#bootstrapPromise = this.#loadBootstrap(cacheKey);
    try {
      return await this.#bootstrapPromise;
    } finally {
      this.#bootstrapPromise = undefined;
    }
  }

  async #loadBootstrap(cacheKey: string): Promise<RdapServices> {
    const json = await this.#fetchJson(IANA_RDAP_BOOTSTRAP_URL);
    const parsed = bootstrapSchema.safeParse(json);
    if (!parsed.success) {
      throw new UpstreamError('IANA RDAP bootstrap', 'Returned an unexpected response structure.');
    }
    this.#cache.set(cacheKey, parsed.data.services, this.#bootstrapTtlMs);
    return parsed.data.services;
  }

  async #fetchDomain(url: string): Promise<RdapLookupResult> {
    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      try {
        const response = await this.#request(url);
        if (response.status === 404) return { status: 'not_found', httpStatus: 404 };
        if (response.ok) return { status: 'registered', httpStatus: response.status };
        if (response.status >= 500 && attempt < this.#maxRetries) {
          await this.#sleep(200 * 2 ** attempt);
          continue;
        }
        return {
          status: 'unknown',
          httpStatus: response.status,
          reason: `RDAP returned HTTP ${response.status}.`,
        };
      } catch (error) {
        if (attempt < this.#maxRetries && isTransient(error)) {
          await this.#sleep(200 * 2 ** attempt);
          continue;
        }
        if (error instanceof UpstreamTimeoutError) {
          return { status: 'unknown', reason: error.message };
        }
        return { status: 'unknown', reason: 'RDAP lookup failed.' };
      }
    }
    return { status: 'unknown', reason: 'RDAP retry loop ended unexpectedly.' };
  }

  async #fetchJson(url: string): Promise<unknown> {
    const response = await this.#request(url);
    if (!response.ok) {
      throw new UpstreamError('IANA RDAP bootstrap', `HTTP ${response.status}.`, {
        retryable: response.status >= 500,
      });
    }
    try {
      return await response.json();
    } catch (error) {
      throw new UpstreamError('IANA RDAP bootstrap', 'Returned non-JSON data.', { cause: error });
    }
  }

  async #request(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      this.#logger?.debug('Calling RDAP endpoint.', { host: new URL(url).host });
      return await this.#fetch(url, {
        headers: { accept: 'application/rdap+json, application/json' },
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (error) {
      if (controller.signal.aborted) throw new UpstreamTimeoutError('RDAP', error);
      throw new UpstreamError('RDAP', 'Network request failed.', { cause: error, retryable: true });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isTransient(error: unknown): boolean {
  return (
    error instanceof UpstreamTimeoutError || (error instanceof UpstreamError && error.retryable)
  );
}
