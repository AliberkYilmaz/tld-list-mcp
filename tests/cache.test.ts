import { describe, expect, it } from 'vitest';

import { MemoryTtlCache, stableCacheKey } from '../src/cache/cache.js';

describe('MemoryTtlCache', () => {
  it('returns values until their TTL expires', () => {
    let now = 1_000;
    const cache = new MemoryTtlCache({ now: () => now });
    cache.set('key', { value: 1 }, 100);
    expect(cache.get('key')).toEqual({ value: 1 });
    now = 1_100;
    expect(cache.get('key')).toBeUndefined();
  });

  it('does not store values when disabled', () => {
    const cache = new MemoryTtlCache({ enabled: false });
    cache.set('key', 'value', 1_000);
    expect(cache.get('key')).toBeUndefined();
  });

  it('produces stable keys for reordered objects and arrays', () => {
    expect(stableCacheKey('test', { b: ['z', 'a'], a: 1 })).toBe(
      stableCacheKey('test', { a: 1, b: ['a', 'z'] }),
    );
  });
});
