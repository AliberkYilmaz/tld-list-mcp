import * as z from 'zod/v4';

import { normalizeRegistrar, normalizeTld } from '../domain/normalization.js';
import { apiPriceType } from '../domain/pricing.js';
import { InputError } from '../errors/errors.js';
import type { ToolDependencies } from './common.js';
import { priceTypeValues, sourceMetadata, unique, validateRegistrars } from './common.js';

export const cheapestRegistrarInputSchema = z.object({
  tld: z.string().trim().min(1).max(253),
  priceType: z.enum(priceTypeValues),
  includeRegistrars: z.array(z.string().trim().min(1)).max(50).optional(),
  excludeRegistrars: z.array(z.string().trim().min(1)).max(50).optional(),
});

export type CheapestRegistrarInput = z.infer<typeof cheapestRegistrarInputSchema>;

export async function cheapestRegistrar(
  input: CheapestRegistrarInput,
  dependencies: ToolDependencies,
) {
  const tld = normalizeTld(input.tld);
  const include = input.includeRegistrars
    ? unique(input.includeRegistrars.map(normalizeRegistrar))
    : undefined;
  const exclude = input.excludeRegistrars
    ? unique(input.excludeRegistrars.map(normalizeRegistrar))
    : undefined;
  await validateRegistrars(dependencies.tldProvider, [...(include ?? []), ...(exclude ?? [])]);

  const result = await dependencies.tldProvider.getCheapestRegistrar({
    tlds: [tld],
    priceTypes: [apiPriceType(input.priceType)],
    ...(include ? { includeRegistrars: include } : {}),
    ...(exclude ? { excludeRegistrars: exclude } : {}),
  });
  const extension = result.data[0];
  if (!extension) throw new InputError(`TLD-List returned no data for .${tld}.`, 'UNSUPPORTED_TLD');

  return {
    ...sourceMetadata(result),
    tld,
    priceType: input.priceType,
    data: extension[input.priceType],
  };
}
