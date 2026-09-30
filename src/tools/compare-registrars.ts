import * as z from 'zod/v4';

import { normalizeRegistrar, normalizeTld } from '../domain/normalization.js';
import { InputError } from '../errors/errors.js';
import type { ToolDependencies } from './common.js';
import { priceTypeValues, sourceMetadata, unique, validateRegistrars } from './common.js';

export const compareRegistrarsInputSchema = z.object({
  tld: z.string().trim().min(1).max(253),
  registrars: z.array(z.string().trim().min(1)).min(1).max(50),
  priceTypes: z
    .array(z.enum(priceTypeValues))
    .min(1)
    .max(3)
    .default([...priceTypeValues]),
});

export type CompareRegistrarsInput = z.infer<typeof compareRegistrarsInputSchema>;

export async function compareRegistrars(
  input: CompareRegistrarsInput,
  dependencies: ToolDependencies,
) {
  const tld = normalizeTld(input.tld);
  const registrars = unique(input.registrars.map(normalizeRegistrar));
  await validateRegistrars(dependencies.tldProvider, registrars);
  const result = await dependencies.tldProvider.getPricing({
    tlds: [tld],
    includeRegistrars: registrars,
  });
  const extension = result.data[0];
  if (!extension) throw new InputError(`TLD-List returned no data for .${tld}.`, 'UNSUPPORTED_TLD');

  const requested = new Set(input.priceTypes);
  return {
    ...sourceMetadata(result),
    tld,
    currencyPolicy: 'Prices are compared only within the currency reported on each quote.',
    data: extension.registrars.map((entry) => ({
      registrar: entry.registrar,
      registrarName: entry.registrarName,
      ...(requested.has('registration') ? { registration: entry.registration ?? null } : {}),
      ...(requested.has('renewal') ? { renewal: entry.renewal ?? null } : {}),
      ...(requested.has('transfer') ? { transfer: entry.transfer ?? null } : {}),
      promotions: entry.promotions ?? [],
      terms: entry.terms ?? {},
      notes: entry.notes ?? {},
    })),
    missingRegistrars: registrars.filter(
      (registrar) => !extension.registrars.some((entry) => entry.registrar === registrar),
    ),
  };
}
