import { describe, expect, it } from 'vitest';

import { TldListClient } from '../../src/clients/tld-list-client.js';

const publicKey = process.env.TLD_LIST_PUBLIC_KEY;
const privateKey = process.env.TLD_LIST_PRIVATE_KEY;

describe.skipIf(!publicKey || !privateKey)('TLD-List real API integration', () => {
  it('lists at least one extension and registrar', async () => {
    const client = new TldListClient({
      publicKey: publicKey as string,
      privateKey: privateKey as string,
    });
    const [tlds, registrars] = await Promise.all([
      client.getExtensionNames({ wantPunycode: true, omitExtensionsWithoutRegistrars: true }),
      client.getRegistrarIds(),
    ]);
    expect(tlds.length).toBeGreaterThan(0);
    expect(registrars.length).toBeGreaterThan(0);
  });
});
