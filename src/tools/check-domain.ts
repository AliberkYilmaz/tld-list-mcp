import * as z from 'zod/v4';

import type { ToolDependencies } from './common.js';

export const checkDomainInputSchema = z.object({
  domain: z.string().trim().min(3).max(253).describe('A fully qualified domain such as nexora.ai.'),
});

export type CheckDomainInput = z.infer<typeof checkDomainInputSchema>;

export async function checkDomain(input: CheckDomainInput, dependencies: ToolDependencies) {
  return dependencies.availabilityProvider.checkDomain(input.domain);
}
