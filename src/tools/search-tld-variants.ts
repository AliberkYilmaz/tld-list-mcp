import * as z from 'zod/v4';

import {
  buildDomain,
  normalizeLabel,
  normalizeRegistrar,
  normalizeTld,
} from '../domain/normalization.js';
import { cheapestForType, cheapestOwnershipCost } from '../domain/pricing.js';
import { sortTldPricing } from '../domain/sorting.js';
import type { TldPricing } from '../domain/types.js';
import { InputError } from '../errors/errors.js';
import type { ToolDependencies } from './common.js';
import { assertBatchSize, sourceMetadata, unique, validateRegistrars } from './common.js';

const MAX_NAMES = 20;
const MAX_EXPLICIT_TLDS = 100;
const MAX_DOMAIN_CHECKS = 500;
const MAX_DISCOVERY_AVAILABILITY_CHECKS = 200;

export const searchTldVariantsInputSchema = z
  .object({
    name: z.string().trim().min(1).max(63).optional(),
    names: z.array(z.string().trim().min(1).max(63)).min(1).max(MAX_NAMES).optional(),
    tlds: z.array(z.string().trim().min(1).max(253)).min(1).max(MAX_EXPLICIT_TLDS).optional(),
    availableOnly: z.boolean().default(false),
    maxRegistrationPrice: z.number().nonnegative().optional(),
    maxRenewalPrice: z.number().nonnegative().optional(),
    maxTransferPrice: z.number().nonnegative().optional(),
    registrars: z.array(z.string().trim().min(1)).max(50).optional(),
    excludeRegistrars: z.array(z.string().trim().min(1)).max(50).optional(),
    sortBy: z
      .enum([
        'registration_price',
        'renewal_price',
        'transfer_price',
        'three_year_cost',
        'alphabetical',
      ])
      .default('alphabetical'),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .superRefine((value, context) => {
    if ((value.name === undefined) === (value.names === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'Provide exactly one of name or names.',
        path: ['name'],
      });
    }
    if (value.names && value.names.length > 1 && !value.tlds) {
      context.addIssue({
        code: 'custom',
        message: 'Bulk searches with multiple names must specify tlds.',
        path: ['tlds'],
      });
    }
  });

export type SearchTldVariantsInput = z.infer<typeof searchTldVariantsInputSchema>;

export async function searchTldVariants(
  input: SearchTldVariantsInput,
  dependencies: ToolDependencies,
) {
  const names = unique((input.names ?? [input.name as string]).map(normalizeLabel));
  assertBatchSize('Name list', names.length, MAX_NAMES);
  const include = input.registrars ? unique(input.registrars.map(normalizeRegistrar)) : undefined;
  const exclude = input.excludeRegistrars
    ? unique(input.excludeRegistrars.map(normalizeRegistrar))
    : undefined;
  await validateRegistrars(dependencies.tldProvider, [...(include ?? []), ...(exclude ?? [])]);

  let tlds: string[];
  let namesSource: ReturnType<typeof sourceMetadata> | undefined;
  if (input.tlds) {
    tlds = unique(input.tlds.map(normalizeTld));
  } else {
    const listed = await dependencies.tldProvider.listTlds({
      punycode: true,
      omitWithoutRegistrars: true,
    });
    tlds = listed.data.map(normalizeTld);
    namesSource = sourceMetadata(listed);
  }

  const pricing = await dependencies.tldProvider.getPricing({
    tlds,
    ...(include ? { includeRegistrars: include } : {}),
    ...(exclude ? { excludeRegistrars: exclude } : {}),
  });
  const filtered = pricing.data.filter((entry) => passesPriceFilters(entry, input));
  const sorted = sortTldPricing(filtered, input.sortBy);

  const maximumTldsToCheck = input.tlds
    ? sorted.length
    : Math.min(
        sorted.length,
        Math.max(50, Math.min(MAX_DISCOVERY_AVAILABILITY_CHECKS, input.limit * 3)),
      );
  const candidates = sorted.slice(0, maximumTldsToCheck);
  const domains = names.flatMap((name) =>
    candidates.map((entry) => ({ name, entry, domain: buildDomain(name, entry.tld).ascii })),
  );
  assertBatchSize('Domain availability batch', domains.length, MAX_DOMAIN_CHECKS);

  const availability = await dependencies.availabilityProvider.checkDomains(
    domains.map((entry) => entry.domain),
  );
  const availabilityByDomain = new Map(availability.map((entry) => [entry.domain, entry]));
  const results = domains
    .map(({ entry, domain }) => {
      const status = availabilityByDomain.get(domain);
      if (!status) throw new InputError(`No availability result was produced for ${domain}.`);
      return {
        domain,
        unicodeDomain: status.unicodeDomain,
        tld: entry.tld,
        unicodeTld: entry.unicodeTld,
        available: status.available,
        availabilitySource: status.availabilitySource,
        availabilityInference: status.inference,
        availabilityAuthoritative: status.authoritative,
        availabilityMessage: status.message,
        availabilityCheckedAt: status.checkedAt,
        availabilityCached: status.cached,
        pricing: {
          registration: cheapestForType(entry.registrars, 'registration'),
          renewal: cheapestForType(entry.registrars, 'renewal'),
          transfer: cheapestForType(entry.registrars, 'transfer'),
          threeYearCost: cheapestOwnershipCost(entry.registrars, 3),
        },
        metadata: entry.metadata ?? null,
      };
    })
    .filter((entry) => !input.availableOnly || entry.available === true)
    .slice(0, input.limit);

  return {
    ...sourceMetadata(pricing),
    ...(namesSource ? { tldNamesSource: namesSource } : {}),
    data: results,
    summary: {
      namesRequested: names.length,
      tldsConsidered: pricing.data.length,
      tldsAfterPriceFilters: sorted.length,
      availabilityChecks: domains.length,
      returned: results.length,
      truncatedBeforeAvailability:
        !input.tlds && sorted.length > maximumTldsToCheck ? sorted.length - maximumTldsToCheck : 0,
    },
    limitations: {
      popularitySorting:
        'Not available because TLD-List does not document a popularity or ranking field in API v1.',
      availability:
        'RDAP 404 results are availability inferences, not purchase guarantees. Confirm with a registrar before purchase.',
    },
  };
}

function passesPriceFilters(
  entry: TldPricing,
  filters: Pick<
    SearchTldVariantsInput,
    'maxRegistrationPrice' | 'maxRenewalPrice' | 'maxTransferPrice'
  >,
): boolean {
  return (
    passesMaximum(entry, 'registration', filters.maxRegistrationPrice) &&
    passesMaximum(entry, 'renewal', filters.maxRenewalPrice) &&
    passesMaximum(entry, 'transfer', filters.maxTransferPrice)
  );
}

function passesMaximum(
  entry: TldPricing,
  type: 'registration' | 'renewal' | 'transfer',
  maximum: number | undefined,
): boolean {
  if (maximum === undefined) return true;
  const cheapest = cheapestForType(entry.registrars, type)[0]?.price.amount;
  return cheapest !== undefined && cheapest <= maximum;
}
