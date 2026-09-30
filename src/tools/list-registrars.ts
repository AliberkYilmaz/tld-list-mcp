import * as z from 'zod/v4';

import type { ToolDependencies } from './common.js';
import { sourceMetadata } from './common.js';

export const listRegistrarsInputSchema = z.object({
  query: z.string().trim().max(100).optional().describe('Case-insensitive registrar ID substring.'),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).max(10_000).default(0),
});

export type ListRegistrarsInput = z.infer<typeof listRegistrarsInputSchema>;

export async function listRegistrars(input: ListRegistrarsInput, dependencies: ToolDependencies) {
  const result = await dependencies.tldProvider.listRegistrars();
  const query = input.query?.toLowerCase();
  const filtered = query
    ? result.data.filter((registrar) => registrar.includes(query))
    : result.data;
  return {
    ...sourceMetadata(result),
    data: filtered.slice(input.offset, input.offset + input.limit),
    pagination: {
      offset: input.offset,
      limit: input.limit,
      returned: Math.min(input.limit, Math.max(0, filtered.length - input.offset)),
      total: filtered.length,
      hasMore: input.offset + input.limit < filtered.length,
    },
  };
}
