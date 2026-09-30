import * as z from 'zod/v4';

import { normalizeTld } from '../domain/normalization.js';
import type { ToolDependencies } from './common.js';
import { sourceMetadata } from './common.js';

export const listTldsInputSchema = z.object({
  query: z.string().trim().max(100).optional().describe('Case-insensitive TLD substring.'),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).max(20_000).default(0),
  punycode: z.boolean().default(true).describe('Return IDNs as ASCII punycode when true.'),
  omitWithoutRegistrars: z.boolean().default(true),
  includeMetadata: z
    .boolean()
    .default(false)
    .describe('Fetch documented TLD metadata for only the returned page.'),
});

export type ListTldsInput = z.infer<typeof listTldsInputSchema>;

export async function listTlds(input: ListTldsInput, dependencies: ToolDependencies) {
  const result = await dependencies.tldProvider.listTlds({
    punycode: input.punycode,
    omitWithoutRegistrars: input.omitWithoutRegistrars,
  });
  const query = input.query?.toLowerCase().replace(/^\./u, '');
  const filtered = query
    ? result.data.filter((tld) => tld.toLowerCase().includes(query))
    : result.data;
  const page = filtered.slice(input.offset, input.offset + input.limit);

  let data: Array<string | { tld: string; metadata: unknown }> = page;
  let pricingSource: ReturnType<typeof sourceMetadata> | undefined;
  if (input.includeMetadata && page.length > 0) {
    const pricing = await dependencies.tldProvider.getPricing({ tlds: page });
    const byTld = new Map(pricing.data.map((entry) => [entry.tld, entry]));
    data = page.map((tld) => ({
      tld,
      metadata: byTld.get(normalizeTld(tld))?.metadata ?? null,
    }));
    pricingSource = sourceMetadata(pricing);
  }

  return {
    ...sourceMetadata(result),
    ...(pricingSource ? { metadataSource: pricingSource } : {}),
    data,
    pagination: {
      offset: input.offset,
      limit: input.limit,
      returned: page.length,
      total: filtered.length,
      hasMore: input.offset + input.limit < filtered.length,
    },
  };
}
