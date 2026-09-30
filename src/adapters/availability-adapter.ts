import type { RdapClient } from '../clients/rdap-client.js';
import { parseDomain } from '../domain/normalization.js';
import type { DomainAvailability, DomainAvailabilityProvider } from '../domain/types.js';

export class RdapAvailabilityAdapter implements DomainAvailabilityProvider {
  readonly #client: RdapClient;
  readonly #maxConcurrency: number;
  readonly #now: () => Date;

  constructor(options: { client: RdapClient; maxConcurrency?: number; now?: () => Date }) {
    this.#client = options.client;
    this.#maxConcurrency = options.maxConcurrency ?? 5;
    this.#now = options.now ?? (() => new Date());
  }

  async checkDomain(domain: string): Promise<DomainAvailability> {
    const parsed = parseDomain(domain);
    const { result, cached } = await this.#client.lookupDomain(parsed.ascii);
    const base = {
      domain: parsed.ascii,
      unicodeDomain: parsed.unicode,
      availabilitySource: 'rdap' as const,
      checkedAt: this.#now().toISOString(),
      cached,
    };

    if (result.status === 'registered') {
      return {
        ...base,
        available: false,
        inference: 'registered',
        authoritative: true,
        message: 'An RDAP registration record exists for this domain.',
      };
    }
    if (result.status === 'not_found') {
      return {
        ...base,
        available: true,
        inference: 'no_record',
        authoritative: false,
        message:
          'No RDAP registration record was found. This suggests availability but does not guarantee the domain is purchasable; registry policy, reserved names, premium status, and registrar checks can still prevent registration.',
      };
    }
    return {
      ...base,
      available: null,
      inference: 'unknown',
      authoritative: false,
      message: result.reason,
    };
  }

  async checkDomains(domains: string[]): Promise<DomainAvailability[]> {
    const results = new Array<DomainAvailability>(domains.length);
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < domains.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await this.checkDomain(domains[index] as string);
      }
    };

    const workers = Array.from(
      { length: Math.min(this.#maxConcurrency, domains.length) },
      async () => worker(),
    );
    await Promise.all(workers);
    return results;
  }
}

export class UnknownAvailabilityAdapter implements DomainAvailabilityProvider {
  readonly #now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  async checkDomain(domain: string): Promise<DomainAvailability> {
    const parsed = parseDomain(domain);
    return {
      domain: parsed.ascii,
      unicodeDomain: parsed.unicode,
      available: null,
      availabilitySource: 'unknown',
      inference: 'unknown',
      authoritative: false,
      checkedAt: this.#now().toISOString(),
      cached: false,
      message: 'Domain availability checks are disabled in this server configuration.',
    };
  }

  async checkDomains(domains: string[]): Promise<DomainAvailability[]> {
    return Promise.all(domains.map(async (domain) => this.checkDomain(domain)));
  }
}
