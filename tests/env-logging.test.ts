import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/env.js';
import { sanitizeForLog } from '../src/config/logger.js';

describe('configuration and logging', () => {
  it('requires both API keys and applies safe defaults', () => {
    const config = loadConfig({
      TLD_LIST_PUBLIC_KEY: 'public',
      TLD_LIST_PRIVATE_KEY: 'private',
    });
    expect(config.tldList.baseUrl).toBe('https://api.tld-list.com/v1');
    expect(config.cache.enabled).toBe(true);
    expect(config.rdap.enabled).toBe(true);
  });

  it('rejects missing credentials without echoing environment values', () => {
    expect(() => loadConfig({ TLD_LIST_PUBLIC_KEY: 'secret-public' })).toThrow(
      /Invalid or missing environment configuration/,
    );
    try {
      loadConfig({ TLD_LIST_PUBLIC_KEY: 'secret-public' });
    } catch (error) {
      expect(String(error)).not.toContain('secret-public');
    }
  });

  it('redacts nested credential-like log fields', () => {
    expect(
      sanitizeForLog({
        endpoint: 'extension/get',
        apiKeyPrivate: 'secret',
        nested: { authorization: 'Bearer secret', safe: 'value' },
      }),
    ).toEqual({
      endpoint: 'extension/get',
      apiKeyPrivate: '[REDACTED]',
      nested: { authorization: '[REDACTED]', safe: 'value' },
    });
  });
});
