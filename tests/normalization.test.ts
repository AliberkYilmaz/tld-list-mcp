import { describe, expect, it } from 'vitest';

import {
  buildDomain,
  normalizeLabel,
  normalizeTld,
  parseDomain,
  unicodeTld,
} from '../src/domain/normalization.js';

describe('TLD and domain normalization', () => {
  it('normalizes .com and com identically', () => {
    expect(normalizeTld('.com')).toBe('com');
    expect(normalizeTld('COM')).toBe('com');
  });

  it('converts Unicode IDNs to punycode and back', () => {
    expect(normalizeTld('.рф')).toBe('xn--p1ai');
    expect(unicodeTld('xn--p1ai')).toBe('рф');
    expect(normalizeLabel('münchen')).toBe('xn--mnchen-3ya');
  });

  it('preserves multi-label extensions', () => {
    expect(normalizeTld('.co.uk')).toBe('co.uk');
    expect(parseDomain('Example.CO.UK')).toEqual({
      ascii: 'example.co.uk',
      unicode: 'example.co.uk',
      name: 'example',
      tld: 'co.uk',
    });
  });

  it('builds an ASCII and Unicode domain from IDN input', () => {
    expect(buildDomain('münchen', 'рф')).toEqual({
      ascii: 'xn--mnchen-3ya.xn--p1ai',
      unicode: 'münchen.рф',
      name: 'xn--mnchen-3ya',
      tld: 'xn--p1ai',
    });
  });

  it.each(['localhost', '-bad.com', 'bad..com', 'bad_.com'])(
    'rejects malformed domain %s',
    (domain) => {
      expect(() => parseDomain(domain)).toThrow(/Malformed/);
    },
  );
});
