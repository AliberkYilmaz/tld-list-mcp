import * as z from 'zod/v4';

import { AppError } from '../errors/errors.js';

const booleanString = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value !== 'false');

const envSchema = z.object({
  TLD_LIST_PUBLIC_KEY: z.string().trim().min(1),
  TLD_LIST_PRIVATE_KEY: z.string().trim().min(1),
  TLD_LIST_API_BASE_URL: z.url().default('https://api.tld-list.com/v1'),
  TLD_LIST_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
  TLD_LIST_MAX_RETRIES: z.coerce.number().int().min(0).max(4).default(2),
  TLD_LIST_CACHE_ENABLED: booleanString,
  TLD_LIST_TLDS_CACHE_TTL_MS: z.coerce.number().int().min(0).default(86_400_000),
  TLD_LIST_REGISTRARS_CACHE_TTL_MS: z.coerce.number().int().min(0).default(86_400_000),
  TLD_LIST_PRICING_CACHE_TTL_MS: z.coerce.number().int().min(0).default(900_000),
  RDAP_ENABLED: booleanString,
  RDAP_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  RDAP_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
  RDAP_BOOTSTRAP_CACHE_TTL_MS: z.coerce.number().int().min(0).default(86_400_000),
  TLD_LIST_MCP_DEBUG: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export interface AppConfig {
  tldList: {
    publicKey: string;
    privateKey: string;
    baseUrl: string;
    timeoutMs: number;
    maxRetries: number;
  };
  cache: {
    enabled: boolean;
    tldsTtlMs: number;
    registrarsTtlMs: number;
    pricingTtlMs: number;
  };
  rdap: {
    enabled: boolean;
    timeoutMs: number;
    maxConcurrency: number;
    bootstrapTtlMs: number;
  };
  debug: boolean;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(environment);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new AppError(
      'CONFIGURATION_ERROR',
      `Invalid or missing environment configuration: ${missing}. See .env.example.`,
    );
  }

  const env = result.data;
  return {
    tldList: {
      publicKey: env.TLD_LIST_PUBLIC_KEY,
      privateKey: env.TLD_LIST_PRIVATE_KEY,
      baseUrl: env.TLD_LIST_API_BASE_URL.replace(/\/$/u, ''),
      timeoutMs: env.TLD_LIST_REQUEST_TIMEOUT_MS,
      maxRetries: env.TLD_LIST_MAX_RETRIES,
    },
    cache: {
      enabled: env.TLD_LIST_CACHE_ENABLED,
      tldsTtlMs: env.TLD_LIST_TLDS_CACHE_TTL_MS,
      registrarsTtlMs: env.TLD_LIST_REGISTRARS_CACHE_TTL_MS,
      pricingTtlMs: env.TLD_LIST_PRICING_CACHE_TTL_MS,
    },
    rdap: {
      enabled: env.RDAP_ENABLED,
      timeoutMs: env.RDAP_REQUEST_TIMEOUT_MS,
      maxConcurrency: env.RDAP_MAX_CONCURRENCY,
      bootstrapTtlMs: env.RDAP_BOOTSTRAP_CACHE_TTL_MS,
    },
    debug: env.TLD_LIST_MCP_DEBUG,
  };
}
