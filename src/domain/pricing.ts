import type {
  ApiPriceType,
  CheapestRegistrarEntry,
  Money,
  PriceType,
  RegistrarPrice,
} from './types.js';

export function apiPriceType(type: PriceType): ApiPriceType {
  return type === 'registration' ? 'register' : type;
}

export function priceFor(registrar: RegistrarPrice, type: PriceType): Money | undefined {
  return registrar[type];
}

export function cheapestForType(
  registrars: RegistrarPrice[],
  type: PriceType,
): CheapestRegistrarEntry[] {
  const priced = registrars
    .map((registrar) => ({ registrar, price: priceFor(registrar, type) }))
    .filter(
      (entry): entry is { registrar: RegistrarPrice; price: Money } => entry.price !== undefined,
    );

  if (priced.length === 0) return [];

  const currencies = new Set(priced.map(({ price }) => price.currency));
  if (currencies.size > 1) return [];

  const minimum = Math.min(...priced.map(({ price }) => price.amount));
  return priced
    .filter(({ price }) => price.amount === minimum)
    .map(({ registrar, price }) => ({
      registrar: registrar.registrar,
      registrarName: registrar.registrarName,
      price,
      ...regularPriceField(registrar, type),
      allPrices: registrar,
    }));
}

function regularPriceField(registrar: RegistrarPrice, type: PriceType): { regularPrice?: Money } {
  const key =
    type === 'registration'
      ? 'regularRegistration'
      : type === 'renewal'
        ? 'regularRenewal'
        : 'regularTransfer';
  const value = registrar[key];
  return value ? { regularPrice: value } : {};
}

export interface OwnershipCost {
  registrar: string;
  registrarName: string;
  registration: Money;
  renewal: Money;
  years: number;
  total: Money;
  assumptions: string[];
}

export function calculateOwnershipCost(
  registrar: RegistrarPrice,
  years: number,
): OwnershipCost | undefined {
  if (!registrar.registration) return undefined;
  if (years > 1 && !registrar.renewal) return undefined;

  const renewal = registrar.renewal ?? registrar.registration;
  if (registrar.registration.currency !== renewal.currency) return undefined;

  return {
    registrar: registrar.registrar,
    registrarName: registrar.registrarName,
    registration: registrar.registration,
    renewal,
    years,
    total: {
      amount: roundMoney(registrar.registration.amount + (years - 1) * renewal.amount),
      currency: registrar.registration.currency,
    },
    assumptions: [
      'Year 1 uses the current registration price.',
      `Years 2-${years} use the current renewal price without predicting future price changes.`,
      'Taxes, optional add-ons, premium-domain surcharges, and future promotions are excluded unless already included by TLD-List in the quoted price.',
    ],
  };
}

export function cheapestOwnershipCost(
  registrars: RegistrarPrice[],
  years: number,
): OwnershipCost[] {
  const costs = registrars
    .map((registrar) => calculateOwnershipCost(registrar, years))
    .filter((cost): cost is OwnershipCost => cost !== undefined);
  if (costs.length === 0) return [];

  const currencies = new Set(costs.map((cost) => cost.total.currency));
  if (currencies.size !== 1) return [];
  const minimum = Math.min(...costs.map((cost) => cost.total.amount));
  return costs.filter((cost) => cost.total.amount === minimum);
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
