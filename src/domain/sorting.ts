import { cheapestForType, cheapestOwnershipCost } from './pricing.js';
import type { TldPricing } from './types.js';

export type TldSort =
  'registration_price' | 'renewal_price' | 'transfer_price' | 'three_year_cost' | 'alphabetical';

export function sortTldPricing(pricing: TldPricing[], sortBy: TldSort): TldPricing[] {
  return [...pricing].sort((left, right) => {
    if (sortBy === 'alphabetical') return left.tld.localeCompare(right.tld);

    const leftValue = sortValue(left, sortBy);
    const rightValue = sortValue(right, sortBy);
    if (leftValue === undefined && rightValue === undefined)
      return left.tld.localeCompare(right.tld);
    if (leftValue === undefined) return 1;
    if (rightValue === undefined) return -1;
    return leftValue - rightValue || left.tld.localeCompare(right.tld);
  });
}

function sortValue(
  entry: TldPricing,
  sortBy: Exclude<TldSort, 'alphabetical'>,
): number | undefined {
  if (sortBy === 'three_year_cost') {
    return cheapestOwnershipCost(entry.registrars, 3)[0]?.total.amount;
  }

  const type =
    sortBy === 'registration_price'
      ? 'registration'
      : sortBy === 'renewal_price'
        ? 'renewal'
        : 'transfer';
  return cheapestForType(entry.registrars, type)[0]?.price.amount;
}
