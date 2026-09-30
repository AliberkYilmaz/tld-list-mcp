import type { DomainAvailabilityProvider, TldDataProvider } from '../domain/types.js';
import { InputError } from '../errors/errors.js';

export interface ToolDependencies {
  tldProvider: TldDataProvider;
  availabilityProvider: DomainAvailabilityProvider;
}

export const priceTypeValues = ['registration', 'renewal', 'transfer'] as const;

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export async function validateRegistrars(
  provider: TldDataProvider,
  registrars: string[],
): Promise<void> {
  if (registrars.length === 0) return;
  const supported = await provider.listRegistrars();
  const supportedSet = new Set(supported.data);
  const unknown = registrars.filter((registrar) => !supportedSet.has(registrar));
  if (unknown.length > 0) {
    throw new InputError(
      `Unknown TLD-List registrar ID(s): ${unknown.join(', ')}`,
      'UNKNOWN_REGISTRAR',
    );
  }
}

export function assertBatchSize(label: string, size: number, maximum: number): void {
  if (size > maximum) {
    throw new InputError(`${label} exceeds the maximum of ${maximum}; received ${size}.`);
  }
}

export function sourceMetadata(result: { source: string; checkedAt: string; cached: boolean }) {
  return { source: result.source, checkedAt: result.checkedAt, cached: result.cached };
}
