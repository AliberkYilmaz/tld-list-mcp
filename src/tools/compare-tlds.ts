import * as z from 'zod/v4';

import { normalizeRegistrar, normalizeTld } from '../domain/normalization.js';
import { cheapestForType, cheapestOwnershipCost } from '../domain/pricing.js';
import type { ToolDependencies } from './common.js';
import { assertBatchSize, sourceMetadata, unique, validateRegistrars } from './common.js';

export const compareTldsInputSchema = z.object({
  tlds: z.array(z.string().trim().min(1).max(253)).min(1).max(100),
  years: z.number().int().min(1).max(10).default(3),
  includeRegistrars: z.array(z.string().trim().min(1)).max(50).optional(),
  excludeRegistrars: z.array(z.string().trim().min(1)).max(50).optional(),
});

export type CompareTldsInput = z.infer<typeof compareTldsInputSchema>;

export async function compareTlds(input: CompareTldsInput, dependencies: ToolDependencies) {
  const tlds = unique(input.tlds.map(normalizeTld));
  assertBatchSize('TLD list', tlds.length, 100);
  const include = input.includeRegistrars
    ? unique(input.includeRegistrars.map(normalizeRegistrar))
    : undefined;
  const exclude = input.excludeRegistrars
    ? unique(input.excludeRegistrars.map(normalizeRegistrar))
    : undefined;
  await validateRegistrars(dependencies.tldProvider, [...(include ?? []), ...(exclude ?? [])]);

  const result = await dependencies.tldProvider.getPricing({
    tlds,
    ...(include ? { includeRegistrars: include } : {}),
    ...(exclude ? { excludeRegistrars: exclude } : {}),
  });
  const returned = new Set(result.data.map((entry) => entry.tld));

  return {
    ...sourceMetadata(result),
    years: input.years,
    calculation: 'year 1 registration + (years - 1) × current renewal price at one registrar',
    currencyPolicy: 'Costs with different currencies are never combined or ranked together.',
    data: result.data.map((entry) => ({
      tld: entry.tld,
      unicodeTld: entry.unicodeTld,
      pricing: {
        registration: cheapestForType(entry.registrars, 'registration'),
        renewal: cheapestForType(entry.registrars, 'renewal'),
        transfer: cheapestForType(entry.registrars, 'transfer'),
      },
      ownershipCost: cheapestOwnershipCost(entry.registrars, input.years),
      metadata: entry.metadata ?? null,
    })),
    unsupportedTlds: tlds.filter((tld) => !returned.has(tld)),
  };
}
