import { describe, expect, it } from 'vitest';

import { filterRegistrarPrices } from '../src/domain/filtering.js';
import { sortTldPricing } from '../src/domain/sorting.js';
import type { RegistrarPrice, TldPricing } from '../src/domain/types.js';

const registrar = (id: string, registration?: number, renewal?: number): RegistrarPrice => ({
  registrar: id,
  registrarName: id,
  ...(registration === undefined
    ? {}
    : { registration: { amount: registration, currency: 'USD' } }),
  ...(renewal === undefined ? {} : { renewal: { amount: renewal, currency: 'USD' } }),
});

describe('filtering and sorting', () => {
  it('requires a present price when a maximum is requested', () => {
    expect(
      filterRegistrarPrices([registrar('missing'), registrar('priced', 20)], {
        maxRegistrationPrice: 30,
      }).map((entry) => entry.registrar),
    ).toEqual(['priced']);
  });

  it('sorts missing prices after priced TLDs', () => {
    const entries: TldPricing[] = [
      { tld: 'missing', unicodeTld: 'missing', registrars: [registrar('a')] },
      { tld: 'cheap', unicodeTld: 'cheap', registrars: [registrar('a', 5)] },
      { tld: 'expensive', unicodeTld: 'expensive', registrars: [registrar('a', 50)] },
    ];
    expect(sortTldPricing(entries, 'registration_price').map((entry) => entry.tld)).toEqual([
      'cheap',
      'expensive',
      'missing',
    ]);
  });

  it('sorts by same-registrar three-year cost', () => {
    const entries: TldPricing[] = [
      { tld: 'one', unicodeTld: 'one', registrars: [registrar('a', 1, 20)] },
      { tld: 'two', unicodeTld: 'two', registrars: [registrar('a', 10, 10)] },
    ];
    expect(sortTldPricing(entries, 'three_year_cost').map((entry) => entry.tld)).toEqual([
      'two',
      'one',
    ]);
  });
});
