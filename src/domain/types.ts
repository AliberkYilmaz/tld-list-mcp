export type PriceType = 'registration' | 'renewal' | 'transfer';
export type ApiPriceType = 'register' | 'renewal' | 'transfer';

export interface Money {
  amount: number;
  currency: string;
}

export interface Promotion {
  code?: string;
  amount?: number;
  type?: string;
  start?: string;
  end?: string;
  priceTypes?: ApiPriceType[];
}

export interface RegistrarPrice {
  registrar: string;
  registrarName: string;
  registration?: Money;
  renewal?: Money;
  transfer?: Money;
  regularRegistration?: Money;
  regularRenewal?: Money;
  regularTransfer?: Money;
  promotions?: Promotion[];
  terms?: Record<string, unknown>;
  notes?: Record<string, unknown>;
  freeFeatures?: Array<{ name: string; count?: number; durationDays?: number }>;
}

export interface TldCategory {
  id?: number;
  idString?: string;
  name?: string;
  description?: string;
}

export interface TldMetadata {
  unicodeName: string;
  asciiName: string;
  type?: string;
  level?: number;
  categories?: TldCategory[];
  dnssecSupported?: boolean;
  whoisPrivacySupported?: boolean;
  hasPremiumDomains?: Partial<Record<ApiPriceType, boolean>>;
  localPresenceRequired?: boolean;
  restrictions?: string;
  intendedUsage?: string;
  targetMarket?: string;
  language?: string;
  translation?: string;
  registryUrl?: string;
  registerMinYears?: number;
  registerMaxYears?: number;
  renewalMinYears?: number;
  pricingUpdated?: string;
  infoUpdated?: string;
}

export interface TldPricing {
  tld: string;
  unicodeTld: string;
  registrars: RegistrarPrice[];
  metadata?: TldMetadata;
}

export interface CheapestRegistrarEntry {
  registrar: string;
  registrarName: string;
  price: Money;
  regularPrice?: Money;
  allPrices: RegistrarPrice;
}

export interface CheapestTldPricing {
  tld: string;
  unicodeTld: string;
  registration: CheapestRegistrarEntry[];
  renewal: CheapestRegistrarEntry[];
  transfer: CheapestRegistrarEntry[];
}

export interface ProviderResult<T> {
  source: 'tld-list';
  checkedAt: string;
  cached: boolean;
  data: T;
}

export interface PricingQuery {
  tlds: string[];
  includeRegistrars?: string[];
  excludeRegistrars?: string[];
}

export interface CheapestPricingQuery extends PricingQuery {
  priceTypes?: ApiPriceType[];
}

export interface ListTldsQuery {
  punycode: boolean;
  omitWithoutRegistrars: boolean;
}

export interface TldDataProvider {
  listTlds(query: ListTldsQuery): Promise<ProviderResult<string[]>>;
  listRegistrars(): Promise<ProviderResult<string[]>>;
  getPricing(query: PricingQuery): Promise<ProviderResult<TldPricing[]>>;
  getCheapestRegistrar(query: CheapestPricingQuery): Promise<ProviderResult<CheapestTldPricing[]>>;
}

export type AvailabilitySource = 'rdap' | 'tld-list' | 'unknown';

export interface DomainAvailability {
  domain: string;
  unicodeDomain: string;
  available: boolean | null;
  availabilitySource: AvailabilitySource;
  inference: 'registered' | 'no_record' | 'unknown';
  authoritative: boolean;
  checkedAt: string;
  cached: boolean;
  message: string;
}

export interface DomainAvailabilityProvider {
  checkDomain(domain: string): Promise<DomainAvailability>;
  checkDomains(domains: string[]): Promise<DomainAvailability[]>;
}
