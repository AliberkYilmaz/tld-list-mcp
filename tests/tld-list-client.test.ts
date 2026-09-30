import { describe, expect, it, vi } from 'vitest';

import { TldListClient } from '../src/clients/tld-list-client.js';
import { AuthenticationError, RateLimitError, UpstreamTimeoutError } from '../src/errors/errors.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function success(data: unknown): unknown {
  return { status: 'SUCCESS', errors: [], seconds: 0.1, data };
}

describe('TldListClient', () => {
  it('batches multiple extensions in one documented request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        success([
          { name: 'com', registrars: [] },
          { name: 'io', registrars: [] },
        ]),
      ),
    );
    const client = createClient(fetchMock);

    await client.getExtensions({ extensions: ['com', 'io'] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.tld-list.com/v1/extension/get');
    expect(JSON.parse(init.body as string)).toEqual({
      extensions: ['com', 'io'],
      apiKeyPublic: 'public',
      apiKeyPrivate: 'private',
    });
  });

  it('maps documented authentication errors and never retries them', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: 'FAIL',
        errors: [{ code: 'AUTH_INVALID', message: 'raw upstream auth detail' }],
      }),
    );
    const client = createClient(fetchMock, 3);

    await expect(client.getRegistrarIds()).rejects.toBeInstanceOf(AuthenticationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps rate limiting and does not create a retry storm', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ status: 'FAIL', errors: [{ code: 'RATE_LIMITED' }] }));
    const client = createClient(fetchMock, 3);

    await expect(client.getRegistrarIds()).rejects.toBeInstanceOf(RateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries transient 5xx responses with bounded backoff', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ message: 'unavailable' }, 502))
      .mockResolvedValueOnce(jsonResponse(success(['porkbun'])));
    const sleep = vi.fn(async () => undefined);
    const client = new TldListClient({
      publicKey: 'public',
      privateKey: 'private',
      maxRetries: 1,
      fetch: fetchMock,
      sleep,
    });

    await expect(client.getRegistrarIds()).resolves.toEqual(['porkbun']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('returns a timeout error for an aborted upstream request', async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
    });
    const client = new TldListClient({
      publicKey: 'public',
      privateKey: 'private',
      timeoutMs: 5,
      maxRetries: 0,
      fetch: fetchMock,
    });

    await expect(client.getRegistrarIds()).rejects.toBeInstanceOf(UpstreamTimeoutError);
  });

  it('rejects undocumented response shapes', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(success({ ids: [] })));
    const client = createClient(fetchMock);
    await expect(client.getRegistrarIds()).rejects.toThrow(/documented schema|unexpected/i);
  });
});

function createClient(fetchMock: typeof fetch, maxRetries = 0): TldListClient {
  return new TldListClient({
    publicKey: 'public',
    privateKey: 'private',
    fetch: fetchMock,
    maxRetries,
  });
}
