import { domainToASCII, domainToUnicode } from 'node:url';

import { InputError } from '../errors/errors.js';

const ASCII_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/u;

export function normalizeTld(input: string): string {
  const stripped = input.trim().replace(/^\.+/u, '').replace(/\.$/u, '').toLowerCase();
  if (!stripped) throw new InputError('TLD must not be empty.');

  const ascii = domainToASCII(stripped).toLowerCase();
  if (!ascii || ascii.length > 253 || !ascii.split('.').every((label) => ASCII_LABEL.test(label))) {
    throw new InputError(`Invalid TLD: ${input}`);
  }
  return ascii;
}

export function unicodeTld(input: string): string {
  return domainToUnicode(normalizeTld(input));
}

export function normalizeLabel(input: string): string {
  const value = input.trim().toLowerCase();
  if (!value || value.includes('.')) {
    throw new InputError('Domain name must be a single label without a TLD.');
  }

  const ascii = domainToASCII(value).toLowerCase();
  if (!ascii || !ASCII_LABEL.test(ascii)) {
    throw new InputError(`Invalid domain label: ${input}`);
  }
  return ascii;
}

export interface ParsedDomain {
  ascii: string;
  unicode: string;
  name: string;
  tld: string;
}

export function parseDomain(input: string): ParsedDomain {
  const stripped = input.trim().replace(/\.$/u, '').toLowerCase();
  const ascii = domainToASCII(stripped).toLowerCase();
  const labels = ascii.split('.');

  if (
    !ascii ||
    ascii.length > 253 ||
    labels.length < 2 ||
    !labels.every((label) => ASCII_LABEL.test(label))
  ) {
    throw new InputError(`Malformed fully qualified domain name: ${input}`, 'MALFORMED_DOMAIN');
  }

  return {
    ascii,
    unicode: domainToUnicode(ascii),
    name: labels[0] as string,
    tld: labels.slice(1).join('.'),
  };
}

export function buildDomain(name: string, tld: string): ParsedDomain {
  return parseDomain(`${normalizeLabel(name)}.${normalizeTld(tld)}`);
}

export function normalizeRegistrar(input: string): string {
  const value = input.trim().toLowerCase();
  if (!value || value.length > 100 || !/^[a-z0-9.-]+$/u.test(value)) {
    throw new InputError(`Invalid registrar ID: ${input}`);
  }
  return value;
}
