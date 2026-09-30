import { describe, expect, it } from 'vitest';

import {
  calculateOwnershipCost,
  cheapestForType,
  cheapestOwnershipCost,
} from '../src/domain/pricing.js';
import type { RegistrarPrice } from '../src/domain/types.js';

const porkbun: RegistrarPrice = {
  registrar: 'porkbun',
  registrarName: 'Porkbun',
  registration: { amount: 10, currency: 'USD' },
  renewal: { amount: 12, currency: 'USD' },
  transfer: { amount: 11, currency: 'USD' },
};

describe('pricing calculations', () => {
  it('calculates 3-year and 5-year costs at one registrar', () => {
    expect(calculateOwnershipCost(porkbun, 3)?.total).toEqual({ amount: 34, currency: 'USD' });
    expect(calculateOwnershipCost(porkbun, 5)?.total).toEqual({ amount: 58, currency: 'USD' });
  });

  it('does not treat missing renewal pricing as zero', () => {
    const missingRenewal = { ...porkbun, renewal: undefined } as unknown as RegistrarPrice;
    expect(calculateOwnershipCost(missingRenewal, 3)).toBeUndefined();
  });

  it('does not combine currencies', () => {
    const mixed = {
      ...porkbun,
      renewal: { amount: 12, currency: 'EUR' },
    };
    expect(calculateOwnershipCost(mixed, 3)).toBeUndefined();

    const euro = {
      ...porkbun,
      registrar: 'euro-reg',
      registration: { amount: 1, currency: 'EUR' },
      renewal: { amount: 2, currency: 'EUR' },
    };
    expect(cheapestForType([porkbun, euro], 'registration')).toEqual([]);
    expect(cheapestOwnershipCost([porkbun, euro], 3)).toEqual([]);
  });

  it('returns ties for cheapest prices', () => {
    const tied = { ...porkbun, registrar: 'tied', registrarName: 'Tied' };
    expect(
      cheapestForType([porkbun, tied], 'registration').map((entry) => entry.registrar),
    ).toEqual(['porkbun', 'tied']);
  });
});
