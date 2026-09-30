import { describe, expect, it } from 'vitest';

import { calculateDomainCost } from '../src/tools/calculate-domain-cost.js';
import { compareTlds } from '../src/tools/compare-tlds.js';
import { listTlds } from '../src/tools/list-tlds.js';
import {
  searchTldVariants,
  searchTldVariantsInputSchema,
} from '../src/tools/search-tld-variants.js';
import type {
  CheapestPricingQuery,
  CheapestTldPricing,
  DomainAvailability,
  DomainAvailabilityProvider,
  ListTldsQuery,
  PricingQuery,
  ProviderResult,
  TldDataProvider,
  TldPricing,
} from '../src/domain/types.js';

const checkedAt = '2026-09-30T00:00:00.000Z';

class FakeTldProvider implements TldDataProvider {
  pricingCalls: PricingQuery[] = [];

  constructor(
    readonly pricing: TldPricing[],
    readonly tlds = pricing.map((entry) => entry.tld),
    readonly registrars = ['porkbun', 'namecheap', 'cloudflare'],
  ) {}

  async listTlds(query: ListTldsQuery): Promise<ProviderResult<string[]>> {
    void query;
    return providerResult(this.tlds);
  }

  async listRegistrars(): Promise<ProviderResult<string[]>> {
    return providerResult(this.registrars);
  }

  async getPricing(query: PricingQuery): Promise<ProviderResult<TldPricing[]>> {
    this.pricingCalls.push(query);
    const included = new Set(query.tlds);
    return providerResult(this.pricing.filter((entry) => included.has(entry.tld)));
  }

  async getCheapestRegistrar(
    query: CheapestPricingQuery,
  ): Promise<ProviderResult<CheapestTldPricing[]>> {
    void query;
    return providerResult([]);
  }
}

class FakeAvailabilityProvider implements DomainAvailabilityProvider {
  batches: string[][] = [];

  async checkDomain(domain: string): Promise<DomainAvailability> {
    return availability(domain);
  }

  async checkDomains(domains: string[]): Promise<DomainAvailability[]> {
    this.batches.push(domains);
    return domains.map(availability);
  }
}

const pricing: TldPricing[] = [
  {
    tld: 'ai',
    unicodeTld: 'ai',
    registrars: [
      {
        registrar: 'porkbun',
        registrarName: 'Porkbun',
        registration: { amount: 65, currency: 'USD' },
        renewal: { amount: 70, currency: 'USD' },
        transfer: { amount: 68, currency: 'USD' },
      },
      {
        registrar: 'namecheap',
        registrarName: 'Namecheap',
        registration: { amount: 60, currency: 'USD' },
        renewal: { amount: 80, currency: 'USD' },
        transfer: { amount: 75, currency: 'USD' },
      },
    ],
  },
  {
    tld: 'com',
    unicodeTld: 'com',
    registrars: [
      {
        registrar: 'porkbun',
        registrarName: 'Porkbun',
        registration: { amount: 10, currency: 'USD' },
        renewal: { amount: 12, currency: 'USD' },
        transfer: { amount: 11, currency: 'USD' },
      },
    ],
  },
];

describe('tool input validation', () => {
  it('requires exactly one of name or names', () => {
    expect(searchTldVariantsInputSchema.safeParse({ name: 'one', names: ['two'] }).success).toBe(
      false,
    );
    expect(searchTldVariantsInputSchema.safeParse({}).success).toBe(false);
  });

  it('does not expose undocumented popularity sorting', () => {
    expect(
      searchTldVariantsInputSchema.safeParse({
        name: 'nexora',
        tlds: ['com'],
        sortBy: 'popularity',
      }).success,
    ).toBe(false);
  });

  it('requires explicit TLDs for bulk names', () => {
    expect(searchTldVariantsInputSchema.safeParse({ names: ['one', 'two'] }).success).toBe(false);
  });
});

describe('tool business logic', () => {
  it('batches TLD pricing and domain availability for search', async () => {
    const tldProvider = new FakeTldProvider(pricing);
    const availabilityProvider = new FakeAvailabilityProvider();
    const input = searchTldVariantsInputSchema.parse({
      name: 'nexora',
      tlds: ['.ai', 'com'],
      sortBy: 'registration_price',
      limit: 10,
    });

    const result = await searchTldVariants(input, { tldProvider, availabilityProvider });

    expect(tldProvider.pricingCalls).toHaveLength(1);
    expect(tldProvider.pricingCalls[0]?.tlds).toEqual(['ai', 'com']);
    expect(availabilityProvider.batches).toEqual([['nexora.com', 'nexora.ai']]);
    expect(result.data.map((entry) => entry.domain)).toEqual(['nexora.com', 'nexora.ai']);
    expect(result.data[1]?.pricing.registration[0]?.registrar).toBe('namecheap');
    expect(result.data[1]?.pricing.renewal[0]?.registrar).toBe('porkbun');
  });

  it('applies independent cheapest-price filters and available-only filtering', async () => {
    const tldProvider = new FakeTldProvider(pricing);
    const availabilityProvider: DomainAvailabilityProvider = {
      checkDomain: async (domain) => availability(domain),
      checkDomains: async (domains) =>
        domains.map((domain) => ({
          ...availability(domain),
          available: domain.endsWith('.com'),
        })),
    };
    const input = searchTldVariantsInputSchema.parse({
      name: 'nexora',
      tlds: ['ai', 'com'],
      maxRegistrationPrice: 70,
      maxRenewalPrice: 75,
      availableOnly: true,
    });

    const result = await searchTldVariants(input, { tldProvider, availabilityProvider });
    expect(result.data.map((entry) => entry.domain)).toEqual(['nexora.com']);
  });

  it('handles a 20-name by 4-TLD bulk search in one pricing batch', async () => {
    const fourTlds = ['com', 'io', 'ai', 'dev'].map((tld, index) => ({
      tld,
      unicodeTld: tld,
      registrars: [
        {
          registrar: 'porkbun',
          registrarName: 'Porkbun',
          registration: { amount: index + 1, currency: 'USD' },
          renewal: { amount: index + 2, currency: 'USD' },
        },
      ],
    }));
    const tldProvider = new FakeTldProvider(fourTlds);
    const availabilityProvider = new FakeAvailabilityProvider();
    const input = searchTldVariantsInputSchema.parse({
      names: Array.from({ length: 20 }, (_, index) => `name${index}`),
      tlds: ['com', 'io', 'ai', 'dev'],
      limit: 100,
    });

    const result = await searchTldVariants(input, { tldProvider, availabilityProvider });
    expect(tldProvider.pricingCalls).toHaveLength(1);
    expect(availabilityProvider.batches[0]).toHaveLength(80);
    expect(result.data).toHaveLength(80);
  });

  it('compares TLDs with same-registrar multi-year costs', async () => {
    const result = await compareTlds(
      { tlds: ['ai', 'com'], years: 5 },
      {
        tldProvider: new FakeTldProvider(pricing),
        availabilityProvider: new FakeAvailabilityProvider(),
      },
    );
    expect(result.data.find((entry) => entry.tld === 'com')?.ownershipCost[0]?.total.amount).toBe(
      58,
    );
  });

  it('calculates a requested registrar cost without cross-registrar arithmetic', async () => {
    const result = await calculateDomainCost(
      { tld: 'ai', years: 3, registrar: 'namecheap' },
      {
        tldProvider: new FakeTldProvider(pricing),
        availabilityProvider: new FakeAvailabilityProvider(),
      },
    );
    expect(result.data.total).toEqual({ amount: 220, currency: 'USD' });
  });

  it('paginates TLD output to avoid context dumps', async () => {
    const tldProvider = new FakeTldProvider([], ['ai', 'app', 'com', 'dev']);
    const result = await listTlds(
      {
        limit: 2,
        offset: 1,
        punycode: true,
        omitWithoutRegistrars: true,
        includeMetadata: false,
      },
      { tldProvider, availabilityProvider: new FakeAvailabilityProvider() },
    );
    expect(result.data).toEqual(['app', 'com']);
    expect(result.pagination).toMatchObject({ total: 4, hasMore: true });
  });
});

function providerResult<T>(data: T): ProviderResult<T> {
  return { source: 'tld-list', checkedAt, cached: false, data };
}

function availability(domain: string): DomainAvailability {
  return {
    domain,
    unicodeDomain: domain,
    available: true,
    availabilitySource: 'rdap',
    inference: 'no_record',
    authoritative: false,
    checkedAt,
    cached: false,
    message: 'Inferred from RDAP 404; not guaranteed.',
  };
}
