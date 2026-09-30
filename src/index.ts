#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import {
  RdapAvailabilityAdapter,
  UnknownAvailabilityAdapter,
} from './adapters/availability-adapter.js';
import { TldListAdapter } from './adapters/tld-list-adapter.js';
import { MemoryTtlCache } from './cache/cache.js';
import { RdapClient } from './clients/rdap-client.js';
import { TldListClient } from './clients/tld-list-client.js';
import { loadConfig } from './config/env.js';
import { createLogger } from './config/logger.js';
import { safeError } from './errors/errors.js';
import { createServer } from './server.js';

export { createServer } from './server.js';
export type {
  DomainAvailabilityProvider,
  TldDataProvider,
  Money,
  RegistrarPrice,
  TldPricing,
} from './domain/types.js';

export async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.debug);
  const cache = new MemoryTtlCache({ enabled: config.cache.enabled });
  const tldClient = new TldListClient({
    ...config.tldList,
    logger,
  });
  const tldProvider = new TldListAdapter({
    client: tldClient,
    cache,
    tldsTtlMs: config.cache.tldsTtlMs,
    registrarsTtlMs: config.cache.registrarsTtlMs,
    pricingTtlMs: config.cache.pricingTtlMs,
  });
  const availabilityProvider = config.rdap.enabled
    ? new RdapAvailabilityAdapter({
        client: new RdapClient({
          cache,
          timeoutMs: config.rdap.timeoutMs,
          bootstrapTtlMs: config.rdap.bootstrapTtlMs,
          logger,
        }),
        maxConcurrency: config.rdap.maxConcurrency,
      })
    : new UnknownAvailabilityAdapter();
  const server = createServer({ tldProvider, availabilityProvider });
  const transport = new StdioServerTransport();

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  await server.connect(transport);
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  main().catch((error: unknown) => {
    const safe = safeError(error);
    process.stderr.write(`[tld-list-mcp] ${safe.code}: ${safe.message}\n`);
    process.exitCode = 1;
  });
}
