import * as z from 'zod/v4';

import { normalizeRegistrar, normalizeTld } from '../domain/normalization.js';
import { calculateOwnershipCost } from '../domain/pricing.js';
import { InputError } from '../errors/errors.js';
import type { ToolDependencies } from './common.js';
import { sourceMetadata, validateRegistrars } from './common.js';

export const calculateDomainCostInputSchema = z.object({
  tld: z.string().trim().min(1).max(253),
  years: z.number().int().min(1).max(10),
  registrar: z.string().trim().min(1).max(100),
});

export type CalculateDomainCostInput = z.infer<typeof calculateDomainCostInputSchema>;

export async function calculateDomainCost(
  input: CalculateDomainCostInput,
  dependencies: ToolDependencies,
) {
  const tld = normalizeTld(input.tld);
  const registrar = normalizeRegistrar(input.registrar);
  await validateRegistrars(dependencies.tldProvider, [registrar]);
  const result = await dependencies.tldProvider.getPricing({
    tlds: [tld],
    includeRegistrars: [registrar],
  });
  const extension = result.data[0];
  if (!extension) throw new InputError(`TLD-List returned no data for .${tld}.`, 'UNSUPPORTED_TLD');
  const quote = extension.registrars.find((entry) => entry.registrar === registrar);
  if (!quote) {
    throw new InputError(`${registrar} has no TLD-List pricing for .${tld}.`);
  }
  const cost = calculateOwnershipCost(quote, input.years);
  if (!cost) {
    throw new InputError(
      `${registrar} does not have the registration and renewal prices needed for a ${input.years}-year calculation on .${tld}.`,
    );
  }
  return { ...sourceMetadata(result), tld, data: cost };
}
