import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isMainModule } from '../src/entrypoint.js';

describe('CLI entrypoint detection', () => {
  it('recognizes an npm-style symlink to the executable module', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tld-list-mcp-entrypoint-'));
    const symlink = join(directory, 'tld-list-mcp');
    symlinkSync(fileURLToPath(import.meta.url), symlink);

    expect(isMainModule(import.meta.url, symlink)).toBe(true);
  });

  it('rejects a different entrypoint', () => {
    expect(
      isMainModule(import.meta.url, fileURLToPath(new URL('../src/index.ts', import.meta.url))),
    ).toBe(false);
  });
});
