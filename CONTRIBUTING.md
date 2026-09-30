# Contributing

Thanks for contributing to `tld-list-mcp`.

## Development workflow

1. Use Node.js 20 or newer.
2. Run `npm install`.
3. Create a focused branch.
4. Add or update mocked tests; normal tests must never require live credentials.
5. Run:

   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   npm run format:check
   ```

6. Explain behavior changes and API/documentation evidence in the pull request.

## Architecture rules

- MCP tools depend on `TldDataProvider` and `DomainAvailabilityProvider`, never directly on an HTTP client.
- Keep all legacy v1 request/response details inside `src/clients/tld-list-client.ts` and `src/adapters/tld-list-adapter.ts`.
- Do not add undocumented TLD-List endpoints or interpret undocumented fields without official documentation.
- Do not add website scraping as a fallback.
- Preserve source, timestamp, and cache metadata in public results.
- Missing prices remain missing; they are never zero.
- Never combine currencies in a calculated or ranked value.
- Keep stdout reserved for MCP stdio protocol messages.

## Tests

Use mocked `fetch` responses for unit tests. The opt-in integration suite under `tests/integration` may use real credentials supplied through environment variables and must skip cleanly when they are absent.

## Reporting bugs

Open a GitHub issue for ordinary bugs. Report security issues privately as described in [SECURITY.md](SECURITY.md).
