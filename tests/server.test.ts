import { InMemoryTransport, type JSONRPCMessage } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';

import type { DomainAvailabilityProvider, TldDataProvider } from '../src/domain/types.js';
import { packageName, packageVersion } from '../src/package-metadata.js';
import { createServer } from '../src/server.js';

describe('MCP server metadata', () => {
  it('reports the package name and version during initialization', async () => {
    const dependencies = {
      tldProvider: {} as TldDataProvider,
      availabilityProvider: {} as DomainAvailabilityProvider,
    };
    const server = createServer(dependencies);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const response = new Promise<JSONRPCMessage>((resolve) => {
      clientTransport.onmessage = resolve;
    });

    await clientTransport.start();
    await server.connect(serverTransport);
    await clientTransport.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'metadata-test', version: '1.0.0' },
      },
    });

    await expect(response).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        serverInfo: {
          name: packageName,
          version: packageVersion,
        },
      },
    });

    await server.close();
  });
});
