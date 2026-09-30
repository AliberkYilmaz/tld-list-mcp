import { describe, expect, it, vi } from 'vitest';

import {
  RdapAvailabilityAdapter,
  UnknownAvailabilityAdapter,
} from '../src/adapters/availability-adapter.js';
import { MemoryTtlCache } from '../src/cache/cache.js';
import { RdapClient } from '../src/clients/rdap-client.js';

const bootstrap = {
  version: '1.0',
  services: [[['com'], ['https://rdap.example.test/']]],
};

describe('RDAP availability adapter', () => {
  it('marks an existing RDAP record as registered', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse({ objectClassName: 'domain', ldhName: 'nexora.com' }));
    const adapter = createAdapter(fetchMock);

    await expect(adapter.checkDomain('nexora.com')).resolves.toMatchObject({
      domain: 'nexora.com',
      available: false,
      inference: 'registered',
      authoritative: true,
      availabilitySource: 'rdap',
    });
  });

  it('labels a 404 as inferred rather than authoritative availability', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse({ errorCode: 404 }, 404));
    const adapter = createAdapter(fetchMock);

    const result = await adapter.checkDomain('nexora.com');
    expect(result).toMatchObject({
      available: true,
      inference: 'no_record',
      authoritative: false,
    });
    expect(result.message).toMatch(/does not guarantee/i);
  });

  it('returns unknown when no RDAP service exists for the TLD', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(bootstrap));
    const adapter = createAdapter(fetchMock);

    await expect(adapter.checkDomain('nexora.invalid')).resolves.toMatchObject({
      available: null,
      inference: 'unknown',
      authoritative: false,
    });
  });

  it('batches checks with one cached bootstrap request', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(bootstrap))
      .mockResolvedValueOnce(jsonResponse({ errorCode: 404 }, 404))
      .mockResolvedValueOnce(jsonResponse({ objectClassName: 'domain' }));
    const adapter = createAdapter(fetchMock);

    const results = await adapter.checkDomains(['one.com', 'two.com']);
    expect(results).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('supports an explicit unknown state when RDAP is disabled', async () => {
    const result = await new UnknownAvailabilityAdapter(() => new Date('2026-09-30')).checkDomain(
      'nexora.ai',
    );
    expect(result).toMatchObject({
      available: null,
      availabilitySource: 'unknown',
      inference: 'unknown',
    });
  });
});

function createAdapter(fetchMock: typeof fetch): RdapAvailabilityAdapter {
  const client = new RdapClient({
    cache: new MemoryTtlCache(),
    fetch: fetchMock,
    maxRetries: 0,
  });
  return new RdapAvailabilityAdapter({
    client,
    maxConcurrency: 2,
    now: () => new Date('2026-09-30T00:00:00.000Z'),
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
