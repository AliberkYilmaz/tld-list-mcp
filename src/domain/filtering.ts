import type { RegistrarPrice, TldPricing } from './types.js';

export interface PriceFilters {
  maxRegistrationPrice?: number;
  maxRenewalPrice?: number;
  maxTransferPrice?: number;
}

export function filterRegistrarPrices(
  registrars: RegistrarPrice[],
  filters: PriceFilters,
): RegistrarPrice[] {
  return registrars.filter(
    (entry) =>
      passesMaximum(entry.registration?.amount, filters.maxRegistrationPrice) &&
      passesMaximum(entry.renewal?.amount, filters.maxRenewalPrice) &&
      passesMaximum(entry.transfer?.amount, filters.maxTransferPrice),
  );
}

export function filterTldPricing(pricing: TldPricing[], filters: PriceFilters): TldPricing[] {
  return pricing
    .map((entry) => ({ ...entry, registrars: filterRegistrarPrices(entry.registrars, filters) }))
    .filter((entry) => entry.registrars.length > 0);
}

function passesMaximum(value: number | undefined, maximum: number | undefined): boolean {
  if (maximum === undefined) return true;
  return value !== undefined && value <= maximum;
}
