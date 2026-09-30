import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isMainModule(
  moduleUrl: string,
  entryPoint: string | undefined = process.argv[1],
): boolean {
  if (!entryPoint) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(entryPoint);
  } catch {
    return false;
  }
}
