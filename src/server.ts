import { McpServer, type CallToolResult, type JSONValue } from '@modelcontextprotocol/server';

import type { ToolDependencies } from './tools/common.js';
import {
  calculateDomainCost,
  calculateDomainCostInputSchema,
} from './tools/calculate-domain-cost.js';
import { cheapestRegistrar, cheapestRegistrarInputSchema } from './tools/cheapest-registrar.js';
import { checkDomain, checkDomainInputSchema } from './tools/check-domain.js';
import { compareRegistrars, compareRegistrarsInputSchema } from './tools/compare-registrars.js';
import { compareTlds, compareTldsInputSchema } from './tools/compare-tlds.js';
import { listRegistrars, listRegistrarsInputSchema } from './tools/list-registrars.js';
import { listTlds, listTldsInputSchema } from './tools/list-tlds.js';
import { searchTldVariants, searchTldVariantsInputSchema } from './tools/search-tld-variants.js';
import { safeError } from './errors/errors.js';
import { packageName, packageVersion } from './package-metadata.js';

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export function createServer(dependencies: ToolDependencies): McpServer {
  const server = new McpServer(
    { name: packageName, version: packageVersion },
    {
      instructions:
        'Use search_tld_variants for name + extension discovery, compare_registrars for one TLD across selected registrars, compare_tlds for extension-level comparisons, and calculate_domain_cost for same-registrar multi-year arithmetic. TLD-List provides pricing and TLD metadata; RDAP provides availability inference separately.',
    },
  );

  server.registerTool(
    'search_tld_variants',
    {
      title: 'Search TLD variants',
      description:
        'Search one name or up to 20 names across TLDs. Batches TLD-List pricing, optionally filters by price/registrar and availability, and returns separate cheapest registration, renewal, transfer, and same-registrar 3-year costs. Popularity sorting is intentionally unavailable because API v1 does not document ranking data.',
      inputSchema: searchTldVariantsInputSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) => safeToolCall(async () => searchTldVariants(input, dependencies)),
  );

  server.registerTool(
    'check_domain',
    {
      title: 'Check domain availability',
      description:
        'Check one fully qualified domain through the separate RDAP availability provider. A found record means registered; a 404 suggests availability but is explicitly non-authoritative and not a purchase guarantee.',
      inputSchema: checkDomainInputSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) => safeToolCall(async () => checkDomain(input, dependencies)),
  );

  server.registerTool(
    'compare_registrars',
    {
      title: 'Compare registrars',
      description:
        'Compare documented registration, renewal, and/or transfer pricing for one TLD at selected TLD-List registrar IDs, including missing prices, promotions, terms, and notes.',
      inputSchema: compareRegistrarsInputSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) => safeToolCall(async () => compareRegistrars(input, dependencies)),
  );

  server.registerTool(
    'cheapest_registrar',
    {
      title: 'Find cheapest registrar',
      description:
        'Find the cheapest registrar or tied registrars for one TLD and one price type. Uses TLD-List v1 extension/getCheapestRegistrar and supports documented registrar include/exclude lists.',
      inputSchema: cheapestRegistrarInputSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) => safeToolCall(async () => cheapestRegistrar(input, dependencies)),
  );

  server.registerTool(
    'compare_tlds',
    {
      title: 'Compare TLDs',
      description:
        'Batch-compare up to 100 extensions by cheapest registration, renewal, transfer, and same-registrar multi-year ownership cost, with documented TLD metadata.',
      inputSchema: compareTldsInputSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) => safeToolCall(async () => compareTlds(input, dependencies)),
  );

  server.registerTool(
    'calculate_domain_cost',
    {
      title: 'Calculate domain ownership cost',
      description:
        'Calculate 1-10 year ownership cost for one registrar/TLD pair as year-1 registration plus subsequent current renewal prices. Never combines currencies and returns assumptions.',
      inputSchema: calculateDomainCostInputSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) => safeToolCall(async () => calculateDomainCost(input, dependencies)),
  );

  server.registerTool(
    'list_registrars',
    {
      title: 'List TLD-List registrars',
      description:
        'List active TLD-List registrar IDs with substring filtering and pagination. Use these exact IDs in other tools.',
      inputSchema: listRegistrarsInputSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) => safeToolCall(async () => listRegistrars(input, dependencies)),
  );

  server.registerTool(
    'list_tlds',
    {
      title: 'List supported TLDs',
      description:
        'List extensions supported by TLD-List with substring search, pagination, Unicode/punycode selection, and optional documented metadata for the returned page.',
      inputSchema: listTldsInputSchema,
      annotations: readOnlyAnnotations,
    },
    async (input) => safeToolCall(async () => listTlds(input, dependencies)),
  );

  return server;
}

async function safeToolCall<T extends object>(action: () => Promise<T>): Promise<CallToolResult> {
  try {
    const data = await action();
    const structuredContent = JSON.parse(JSON.stringify(data)) as Record<string, JSONValue>;
    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
    };
  } catch (error) {
    const safe = safeError(error);
    const structuredContent = { error: safe } as unknown as Record<string, JSONValue>;
    return {
      isError: true,
      content: [{ type: 'text', text: `${safe.code}: ${safe.message}` }],
      structuredContent,
    };
  }
}
