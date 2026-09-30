import { createRequire } from 'node:module';

type PackageMetadata = {
  name?: unknown;
  version?: unknown;
};

const require = createRequire(import.meta.url);
const metadata = require('../package.json') as PackageMetadata;

if (typeof metadata.name !== 'string' || typeof metadata.version !== 'string') {
  throw new Error('Invalid package metadata: expected string name and version');
}

export const packageName = metadata.name;
export const packageVersion = metadata.version;
