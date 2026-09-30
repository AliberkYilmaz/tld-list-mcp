import { describe, expect, it, vi } from 'vitest';

import { TldListAdapter } from '../src/adapters/tld-list-adapter.js';
import { MemoryTtlCache } from '../src/cache/cache.js';
import { TldListClient } from '../src/clients/tld-list-client.js';

function response(data: unknown): Response {
  return new Response(JSON.stringify({ status: 'SUCCESS', errors: [], data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('TldListAdapter', () => {
  it('normalizes prices, promotions, missing values, and IDNs', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response([
        {
          name: 'рф',
          punycode: 'xn--p1ai',
          dnssecSupported: true,
          registrars: [
            {
              id: 'porkbun',
              name: 'Porkbun',
              currency: 'USD',
              prices: { register: '10.25', renewal: null },
              pricesOriginal: { register: '12.00' },
              promos: [{ code: 'SAVE', amount: '1.75', type: 'discount' }],
            },
          ],
        },
      ]),
    );
    const adapter = createAdapter(fetchMock);

    const result = await adapter.getPricing({ tlds: ['.рф'] });

    expect(result.data[0]).toMatchObject({
      tld: 'xn--p1ai',
      unicodeTld: 'рф',
      metadata: { dnssecSupported: true },
      registrars: [
        {
          registrar: 'porkbun',
          registration: { amount: 10.25, currency: 'USD' },
          regularRegistration: { amount: 12, currency: 'USD' },
          promotions: [{ code: 'SAVE', amount: 1.75, type: 'discount' }],
        },
      ],
    });
    expect(result.data[0]?.registrars[0]?.renewal).toBeUndefined();
  });

  it('serves cached values with the original checkedAt and cached=true', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(['porkbun', 'namecheap']));
    const adapter = createAdapter(fetchMock);

    const first = await adapter.listRegistrars();
    const second = await adapter.listRegistrars();

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.checkedAt).toBe(first.checkedAt);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes independent cheapest price types without assuming one registrar', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response([
        {
          name: 'ai',
          currency: 'USD',
          cheapest: {
            register: [{ id: 'first', name: 'First', price: '50', prices: { register: '50' } }],
            renewal: [{ id: 'second', name: 'Second', price: '60', prices: { renewal: '60' } }],
          },
        },
      ]),
    );
    const adapter = createAdapter(fetchMock);

    const result = await adapter.getCheapestRegistrar({ tlds: ['ai'] });
    expect(result.data[0]?.registration[0]?.registrar).toBe('first');
    expect(result.data[0]?.renewal[0]?.registrar).toBe('second');
  });
});

function createAdapter(fetchMock: typeof fetch): TldListAdapter {
  const client = new TldListClient({
    publicKey: 'public',
    privateKey: 'private',
    fetch: fetchMock,
    maxRetries: 0,
  });
  return new TldListAdapter({
    client,
    cache: new MemoryTtlCache(),
    tldsTtlMs: 1_000,
    registrarsTtlMs: 1_000,
    pricingTtlMs: 1_000,
    now: () => new Date('2026-09-30T00:00:00.000Z'),
  });
}
