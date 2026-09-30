export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  delete(key: string): void;
  clear(): void;
}

export class MemoryTtlCache implements Cache {
  readonly #entries = new Map<string, CacheEntry<unknown>>();
  readonly #now: () => number;
  readonly #enabled: boolean;

  constructor(options?: { enabled?: boolean; now?: () => number }) {
    this.#enabled = options?.enabled ?? true;
    this.#now = options?.now ?? Date.now;
  }

  get<T>(key: string): T | undefined {
    if (!this.#enabled) return undefined;

    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (!this.#enabled || ttlMs <= 0) return;
    this.#entries.set(key, { value, expiresAt: this.#now() + ttlMs });
  }

  delete(key: string): void {
    this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
  }
}

export function stableCacheKey(namespace: string, input: object): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return Array.from(value as unknown[])
        .map(normalize)
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return value;
  };

  return `${namespace}:${JSON.stringify(normalize(input))}`;
}
