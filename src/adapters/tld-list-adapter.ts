import type { Cache } from '../cache/cache.js';
import { stableCacheKey } from '../cache/cache.js';
import type {
  RawCheapestExtension,
  RawExtension,
  RawRegistrarPricing,
  TldListClient,
} from '../clients/tld-list-client.js';
import { normalizeRegistrar, normalizeTld } from '../domain/normalization.js';
import type {
  ApiPriceType,
  CheapestRegistrarEntry,
  CheapestTldPricing,
  ListTldsQuery,
  PricingQuery,
  CheapestPricingQuery,
  Promotion,
  ProviderResult,
  RegistrarPrice,
  TldDataProvider,
  TldMetadata,
  TldPricing,
} from '../domain/types.js';

export interface TldListAdapterOptions {
  client: TldListClient;
  cache: Cache;
  tldsTtlMs: number;
  registrarsTtlMs: number;
  pricingTtlMs: number;
  now?: () => Date;
}

export class TldListAdapter implements TldDataProvider {
  readonly #client: TldListClient;
  readonly #cache: Cache;
  readonly #tldsTtlMs: number;
  readonly #registrarsTtlMs: number;
  readonly #pricingTtlMs: number;
  readonly #now: () => Date;

  constructor(options: TldListAdapterOptions) {
    this.#client = options.client;
    this.#cache = options.cache;
    this.#tldsTtlMs = options.tldsTtlMs;
    this.#registrarsTtlMs = options.registrarsTtlMs;
    this.#pricingTtlMs = options.pricingTtlMs;
    this.#now = options.now ?? (() => new Date());
  }

  async listTlds(query: ListTldsQuery): Promise<ProviderResult<string[]>> {
    const key = stableCacheKey('tld-list:names', query);
    return this.#cached(key, this.#tldsTtlMs, async () => {
      const names = await this.#client.getExtensionNames({
        wantPunycode: query.punycode,
        omitExtensionsWithoutRegistrars: query.omitWithoutRegistrars,
      });
      return names.map((name) => (query.punycode ? normalizeTld(name) : name.toLowerCase()));
    });
  }

  async listRegistrars(): Promise<ProviderResult<string[]>> {
    return this.#cached('tld-list:registrars', this.#registrarsTtlMs, async () => {
      const registrars = await this.#client.getRegistrarIds();
      return registrars.map(normalizeRegistrar).sort();
    });
  }

  async getPricing(query: PricingQuery): Promise<ProviderResult<TldPricing[]>> {
    const normalized = normalizePricingQuery(query);
    const key = stableCacheKey('tld-list:pricing', normalized);
    return this.#cached(key, this.#pricingTtlMs, async () => {
      const raw = await this.#client.getExtensions({
        extensions: normalized.tlds,
        includeFields: [
          'name',
          'punycode',
          'registrars',
          'category',
          'dnssecSupported',
          'whoisPrivacySupported',
          'hasPremiumDomains',
          'localPresenceRequired',
          'restrictions',
          'intendedUsage',
          'targetMarket',
          'language',
          'translation',
          'registryUrl',
          'type',
          'level',
          'registerMinYears',
          'registerMaxYears',
          'renewalMinYears',
          'pricingUpdated',
          'infoUpdated',
        ],
        ...(normalized.includeRegistrars
          ? { includeRegistrars: normalized.includeRegistrars }
          : {}),
        ...(normalized.excludeRegistrars
          ? { excludeRegistrars: normalized.excludeRegistrars }
          : {}),
      });
      return raw.map(normalizeExtension);
    });
  }

  async getCheapestRegistrar(
    query: CheapestPricingQuery,
  ): Promise<ProviderResult<CheapestTldPricing[]>> {
    const normalized = {
      ...normalizePricingQuery(query),
      ...(query.priceTypes ? { priceTypes: [...query.priceTypes].sort() } : {}),
    };
    const key = stableCacheKey('tld-list:cheapest', normalized);
    return this.#cached(key, this.#pricingTtlMs, async () => {
      const raw = await this.#client.getCheapestRegistrars({
        extensions: normalized.tlds,
        ...(normalized.includeRegistrars
          ? { includeRegistrars: normalized.includeRegistrars }
          : {}),
        ...(normalized.excludeRegistrars
          ? { excludeRegistrars: normalized.excludeRegistrars }
          : {}),
        ...(normalized.priceTypes ? { pricetypes: normalized.priceTypes } : {}),
      });
      return raw.map(normalizeCheapestExtension);
    });
  }

  async #cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<ProviderResult<T>> {
    const cached = this.#cache.get<ProviderResult<T>>(key);
    if (cached) return { ...cached, cached: true };

    const result: ProviderResult<T> = {
      source: 'tld-list',
      checkedAt: this.#now().toISOString(),
      cached: false,
      data: await load(),
    };
    this.#cache.set(key, result, ttlMs);
    return result;
  }
}

function normalizePricingQuery<T extends PricingQuery>(query: T): PricingQuery {
  return {
    tlds: [...new Set(query.tlds.map(normalizeTld))].sort(),
    ...(query.includeRegistrars
      ? { includeRegistrars: [...new Set(query.includeRegistrars.map(normalizeRegistrar))].sort() }
      : {}),
    ...(query.excludeRegistrars
      ? { excludeRegistrars: [...new Set(query.excludeRegistrars.map(normalizeRegistrar))].sort() }
      : {}),
  };
}

function normalizeExtension(raw: RawExtension): TldPricing {
  const tld = normalizeTld(raw.punycode ?? raw.name);
  return {
    tld,
    unicodeTld: raw.name,
    registrars: (raw.registrars ?? []).map((entry) => normalizeRegistrarPrice(entry)),
    metadata: normalizeMetadata(raw, tld),
  };
}

function normalizeMetadata(raw: RawExtension, tld: string): TldMetadata {
  const categories = Array.isArray(raw.category)
    ? raw.category.map((category) => ({
        ...(category.id === undefined ? {} : { id: category.id }),
        ...(category.idstr === undefined ? {} : { idString: category.idstr }),
        ...(category.name === undefined ? {} : { name: category.name }),
        ...(category.desc === undefined ? {} : { description: category.desc }),
      }))
    : undefined;

  return {
    unicodeName: raw.name,
    asciiName: tld,
    ...(raw.type === undefined ? {} : { type: raw.type }),
    ...(raw.level === undefined ? {} : { level: raw.level }),
    ...(categories === undefined ? {} : { categories }),
    ...(raw.dnssecSupported === undefined ? {} : { dnssecSupported: raw.dnssecSupported }),
    ...(raw.whoisPrivacySupported === undefined
      ? {}
      : { whoisPrivacySupported: raw.whoisPrivacySupported }),
    ...(raw.hasPremiumDomains === undefined ? {} : { hasPremiumDomains: raw.hasPremiumDomains }),
    ...(raw.localPresenceRequired === undefined
      ? {}
      : { localPresenceRequired: raw.localPresenceRequired }),
    ...(raw.restrictions === undefined ? {} : { restrictions: raw.restrictions }),
    ...(raw.intendedUsage === undefined ? {} : { intendedUsage: raw.intendedUsage }),
    ...(raw.targetMarket === undefined ? {} : { targetMarket: raw.targetMarket }),
    ...(raw.language === undefined ? {} : { language: raw.language }),
    ...(raw.translation === undefined ? {} : { translation: raw.translation }),
    ...(raw.registryUrl === undefined ? {} : { registryUrl: raw.registryUrl }),
    ...(raw.registerMinYears === undefined ? {} : { registerMinYears: raw.registerMinYears }),
    ...(raw.registerMaxYears === undefined ? {} : { registerMaxYears: raw.registerMaxYears }),
    ...(raw.renewalMinYears === undefined ? {} : { renewalMinYears: raw.renewalMinYears }),
    ...(raw.pricingUpdated === undefined ? {} : { pricingUpdated: raw.pricingUpdated }),
    ...(raw.infoUpdated === undefined ? {} : { infoUpdated: raw.infoUpdated }),
  };
}

function normalizeCheapestExtension(raw: RawCheapestExtension): CheapestTldPricing {
  const tld = normalizeTld(raw.punycode ?? raw.name);
  const currency = raw.currency ?? 'USD';
  return {
    tld,
    unicodeTld: raw.name,
    registration: normalizeCheapestEntries(raw.cheapest?.register ?? [], 'register', currency),
    renewal: normalizeCheapestEntries(raw.cheapest?.renewal ?? [], 'renewal', currency),
    transfer: normalizeCheapestEntries(raw.cheapest?.transfer ?? [], 'transfer', currency),
  };
}

function normalizeCheapestEntries(
  entries: RawRegistrarPricing[],
  type: ApiPriceType,
  fallbackCurrency: string,
): CheapestRegistrarEntry[] {
  return entries.flatMap((raw) => {
    const allPrices = normalizeRegistrarPrice(raw, fallbackCurrency);
    const amount = numeric(raw.price) ?? numeric(raw.prices?.[type]);
    if (amount === undefined) return [];
    const currency = normalizeCurrency(raw.currency ?? fallbackCurrency);
    const regular = numeric(raw.priceOriginal);
    return [
      {
        registrar: allPrices.registrar,
        registrarName: allPrices.registrarName,
        price: { amount, currency },
        ...(regular === undefined ? {} : { regularPrice: { amount: regular, currency } }),
        allPrices,
      },
    ];
  });
}

export function normalizeRegistrarPrice(
  raw: RawRegistrarPricing,
  fallbackCurrency = 'USD',
): RegistrarPrice {
  const currency = normalizeCurrency(raw.currency ?? fallbackCurrency);
  const prices = raw.prices ?? {};
  const originals = raw.pricesOriginal ?? {};

  return {
    registrar: normalizeRegistrar(raw.id),
    registrarName: raw.name ?? raw.id,
    ...moneyField('registration', prices.register, currency),
    ...moneyField('renewal', prices.renewal, currency),
    ...moneyField('transfer', prices.transfer, currency),
    ...moneyField('regularRegistration', originals.register, currency),
    ...moneyField('regularRenewal', originals.renewal, currency),
    ...moneyField('regularTransfer', originals.transfer, currency),
    ...normalizePromotions(raw),
    ...(raw.terms === undefined ? {} : { terms: raw.terms }),
    ...(raw.notes === undefined ? {} : { notes: raw.notes }),
    ...(raw.freeFeatures === undefined
      ? {}
      : {
          freeFeatures: raw.freeFeatures.map((feature) => ({
            name: feature.name,
            ...(feature.count === undefined ? {} : { count: feature.count }),
            ...(feature.duration === undefined ? {} : { durationDays: feature.duration }),
          })),
        }),
  };
}

function normalizePromotions(raw: RawRegistrarPricing): { promotions?: Promotion[] } {
  const source = raw.promos ?? (raw.promo ? [raw.promo] : []);
  if (source.length === 0) return {};

  return {
    promotions: source.map((promotion) => {
      const record = promotion as Record<string, unknown>;
      return {
        ...stringField('code', record.code),
        ...numberField('amount', record.amount),
        ...stringField('type', record.type),
        ...stringField('start', record.start),
        ...stringField('end', record.end),
        ...(Array.isArray(record.pricetype)
          ? {
              priceTypes: record.pricetype.filter(isApiPriceType),
            }
          : {}),
      };
    }),
  };
}

function moneyField<K extends keyof RegistrarPrice>(
  key: K,
  value: unknown,
  currency: string,
): Partial<Pick<RegistrarPrice, K>> {
  const amount = numeric(value);
  return amount === undefined ? {} : ({ [key]: { amount, currency } } as Pick<RegistrarPrice, K>);
}

function numeric(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function normalizeCurrency(value: string): string {
  return /^[A-Za-z]{3}$/u.test(value) ? value.toUpperCase() : 'USD';
}

function stringField<K extends keyof Promotion>(
  key: K,
  value: unknown,
): Partial<Pick<Promotion, K>> {
  return typeof value === 'string' ? ({ [key]: value } as Pick<Promotion, K>) : {};
}

function numberField<K extends keyof Promotion>(
  key: K,
  value: unknown,
): Partial<Pick<Promotion, K>> {
  const parsed = numeric(value);
  return parsed === undefined ? {} : ({ [key]: parsed } as Pick<Promotion, K>);
}

function isApiPriceType(value: unknown): value is ApiPriceType {
  return value === 'register' || value === 'renewal' || value === 'transfer';
}
