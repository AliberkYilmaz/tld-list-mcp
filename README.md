# tld-list-mcp

An unofficial, open-source Model Context Protocol server for querying TLD-List pricing and metadata, calculating domain ownership costs, and performing clearly labeled RDAP-assisted domain availability checks.

This project is independently maintained and is not endorsed, sponsored, or maintained by TLD-List.

## Features

- Search one base name or bulk-search up to 20 names across TLD variants.
- Compare registration, renewal, and transfer prices without assuming the same registrar is cheapest for every operation.
- Compare selected registrars or find the cheapest registrar for one price type.
- Calculate 1–10 year ownership cost at one registrar.
- Filter by price, registrar, availability, and TLD substring.
- Sort by registration, renewal, transfer, three-year cost, or alphabetically.
- Return documented TLD metadata such as categories, DNSSEC support, privacy support, restrictions, local-presence requirements, premium-domain flags, and registration term limits when present.
- Normalize `.com` and `com` identically and support Unicode IDNs/punycode.
- Batch TLD-List requests and bound RDAP concurrency for efficient bulk comparisons.
- Cache TLD names, registrar IDs, pricing, IANA RDAP bootstrap data, and short-lived RDAP results in memory.
- Return MCP `structuredContent` plus readable JSON text.

## MCP tools

| Tool                    | Purpose                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `search_tld_variants`   | Search one name or up to 20 names across specified TLDs; when one name is used, the TLD list may be discovered automatically. |
| `check_domain`          | Check one fully qualified domain using the separate RDAP provider.                                                            |
| `compare_registrars`    | Compare selected registrars for one TLD and selected price types.                                                             |
| `cheapest_registrar`    | Find the cheapest registrar(s) for registration, renewal, or transfer.                                                        |
| `compare_tlds`          | Batch-compare up to 100 TLDs, including same-registrar multi-year cost.                                                       |
| `calculate_domain_cost` | Calculate ownership cost for one registrar/TLD pair.                                                                          |
| `list_registrars`       | List active TLD-List registrar IDs with filtering and pagination.                                                             |
| `list_tlds`             | List supported extensions with pagination, IDN options, and optional metadata.                                                |

### Example tool inputs

```json
{
  "name": "nexora",
  "tlds": ["com", "io", "ai", "dev"],
  "availableOnly": true,
  "maxRegistrationPrice": 50,
  "maxRenewalPrice": 100,
  "registrars": ["porkbun", "namecheap"],
  "sortBy": "three_year_cost",
  "limit": 50
}
```

```json
{
  "names": ["nexora", "lumora", "veltrix"],
  "tlds": ["com", "io", "ai", "dev"],
  "limit": 100
}
```

```json
{
  "tld": "ai",
  "years": 5,
  "registrar": "porkbun"
}
```

## Requirements

- Node.js 20 or newer
- A working TLD-List public/private API key pair for pricing and metadata tools
- Outbound HTTPS access to `api.tld-list.com`, and to IANA/RDAP services when RDAP is enabled

## Installation

Run the published package directly:

```bash
npx -y tld-list-mcp
```

Or install it globally:

```bash
npm install --global tld-list-mcp
tld-list-mcp
```

For development from source:

```bash
git clone https://github.com/AliberkYilmaz/tld-list-mcp.git
cd tld-list-mcp
npm install
cp .env.example .env
npm run build
```

Set credentials through the MCP client's environment configuration. The server intentionally does not load `.env` itself, which keeps its dependency footprint small and makes credential injection explicit. For shell-only development, export the variables before running `npm run dev`.

The public package is available at [npmjs.com/package/tld-list-mcp](https://www.npmjs.com/package/tld-list-mcp).

## TLD-List API keys

The [official legacy API documentation](https://tld-list.com/docs-api) says requests require `apiKeyPublic` and `apiKeyPrivate`, and describes creating a pair under the account API tab. TLD-List's current [terms](https://tld-list.com/tos) also state that earlier paid features and account access were discontinued. Confirm current key eligibility and usage rights directly with TLD-List before depending on the API in production.

This server uses only these documented v1 methods:

- `extension/getNames`
- `extension/get`
- `extension/getCheapestRegistrar`
- `registrar/getIds`

It does not scrape the website or use private endpoints.

## Environment variables

| Variable                           | Required | Default                       | Description                                                                                                      |
| ---------------------------------- | -------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `TLD_LIST_PUBLIC_KEY`              | Yes      | —                             | TLD-List public API key.                                                                                         |
| `TLD_LIST_PRIVATE_KEY`             | Yes      | —                             | TLD-List private API key.                                                                                        |
| `TLD_LIST_API_BASE_URL`            | No       | `https://api.tld-list.com/v1` | API base URL; primarily useful for controlled tests.                                                             |
| `TLD_LIST_REQUEST_TIMEOUT_MS`      | No       | `15000`                       | Per-request timeout.                                                                                             |
| `TLD_LIST_MAX_RETRIES`             | No       | `2`                           | Bounded retries for transient timeouts/network/5xx errors. Authentication and rate-limit errors are not retried. |
| `TLD_LIST_CACHE_ENABLED`           | No       | `true`                        | Enable the in-memory cache.                                                                                      |
| `TLD_LIST_TLDS_CACHE_TTL_MS`       | No       | `86400000`                    | TLD-name cache TTL.                                                                                              |
| `TLD_LIST_REGISTRARS_CACHE_TTL_MS` | No       | `86400000`                    | Registrar-ID cache TTL.                                                                                          |
| `TLD_LIST_PRICING_CACHE_TTL_MS`    | No       | `900000`                      | Pricing/metadata cache TTL.                                                                                      |
| `RDAP_ENABLED`                     | No       | `true`                        | Enable RDAP availability inference.                                                                              |
| `RDAP_REQUEST_TIMEOUT_MS`          | No       | `10000`                       | RDAP request timeout.                                                                                            |
| `RDAP_MAX_CONCURRENCY`             | No       | `5`                           | Maximum concurrent checks in a bulk request.                                                                     |
| `RDAP_BOOTSTRAP_CACHE_TTL_MS`      | No       | `86400000`                    | IANA RDAP bootstrap cache TTL.                                                                                   |
| `TLD_LIST_MCP_DEBUG`               | No       | `false`                       | Write sanitized diagnostics to stderr.                                                                           |

## MCP client configuration

Replace `/absolute/path/to/tld-list-mcp` and the key placeholders. MCP stdio reserves stdout for protocol messages; this server writes diagnostics only to stderr.

### Codex CLI and IDE extension

Codex shares MCP configuration between the CLI and IDE extension. Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.tld-list]
command = "node"
args = ["/absolute/path/to/tld-list-mcp/dist/index.js"]
env = { TLD_LIST_PUBLIC_KEY = "your-public-key", TLD_LIST_PRIVATE_KEY = "your-private-key" }
```

Verify with `codex mcp list`. Configuration shape and location are based on the current [official OpenAI Codex MCP documentation](https://developers.openai.com/codex/extend/mcp).

### Claude Code

```bash
claude mcp add-json tld-list '{"type":"stdio","command":"node","args":["/absolute/path/to/tld-list-mcp/dist/index.js"],"env":{"TLD_LIST_PUBLIC_KEY":"your-public-key","TLD_LIST_PRIVATE_KEY":"your-private-key"}}'
claude mcp get tld-list
```

Use `--scope user` with `claude mcp add-json` to make it available across projects. This syntax follows Anthropic's current [Claude Code MCP documentation](https://docs.anthropic.com/en/docs/claude-code/mcp).

### Cursor

Create `.cursor/mcp.json` in a project or `~/.cursor/mcp.json` globally:

```json
{
  "mcpServers": {
    "tld-list": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/tld-list-mcp/dist/index.js"],
      "env": {
        "TLD_LIST_PUBLIC_KEY": "your-public-key",
        "TLD_LIST_PRIVATE_KEY": "your-private-key"
      }
    }
  }
}
```

See the current [Cursor MCP documentation](https://cursor.com/docs/mcp).

### VS Code with GitHub Copilot

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "tld-list": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/tld-list-mcp/dist/index.js"],
      "env": {
        "TLD_LIST_PUBLIC_KEY": "your-public-key",
        "TLD_LIST_PRIVATE_KEY": "your-private-key"
      }
    }
  }
}
```

VS Code also supports input variables for secrets; avoid committing literal keys. See the current [VS Code MCP server documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers).

### Development configuration

Any compatible stdio client can run the TypeScript entrypoint during development:

```json
{
  "mcpServers": {
    "tld-list-dev": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/tld-list-mcp/src/index.ts"],
      "env": {
        "TLD_LIST_PUBLIC_KEY": "your-public-key",
        "TLD_LIST_PRIVATE_KEY": "your-private-key"
      }
    }
  }
}
```

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run format
npm run audit
```

Tests mock HTTP and do not require credentials. Optional real-API integration tests are skipped unless both key variables are set:

```bash
TLD_LIST_PUBLIC_KEY=... TLD_LIST_PRIVATE_KEY=... npm run test:integration
```

## Architecture

```text
MCP stdio layer (server.ts, tools/*)
               │
               ▼
Business rules (domain/*)
        │               │
        ▼               ▼
TldDataProvider   DomainAvailabilityProvider
        │               │
        ▼               ▼
TLD-List v1 adapter   RDAP adapter
        │               │
        ▼               ▼
typed v1 client       IANA bootstrap + RDAP client
```

The MCP tools depend on `TldDataProvider`, not the v1 HTTP client. A future `TldListV2Provider` can replace the adapter without changing tool schemas. Availability is independently replaceable through `DomainAvailabilityProvider`. Transport setup is isolated in `src/index.ts`, so Streamable HTTP can be added without moving pricing or tool logic.

## Data sources and calculations

### Obtained from TLD-List

- Supported extension names
- Active registrar IDs
- Registrar registration, renewal, and transfer prices
- Promotions, terms, fee/tax notes, and free-feature data when returned
- Documented TLD metadata returned by `extension/get`

Every TLD-List result includes `source`, `checkedAt`, and `cached`. A cache hit retains the original upstream check time and reports `cached: true`.

### Calculated by this server

- Cheapest price per operation
- Sorting and filtering
- Multi-year ownership cost: `year 1 registration + (years - 1) × current renewal`

Calculations use one registrar at a time, never treat missing prices as zero, and never combine currencies. They do not forecast price changes and may exclude taxes, optional services, future promotions, or premium-name surcharges not already included in TLD-List's final price.

### Obtained from RDAP

Domain-level availability does not come from TLD-List v1. The separate RDAP adapter discovers registry endpoints through the [IANA RDAP DNS bootstrap registry](https://data.iana.org/rdap/dns.json):

- An RDAP domain record is returned as `available: false`.
- RDAP HTTP 404 is returned as `available: true`, `inference: "no_record"`, and `authoritative: false`.
- Missing bootstrap support, timeouts, and ambiguous responses return `available: null`.

A missing RDAP record is not a guarantee that a domain can be registered. Reserved names, registry restrictions, premium status, launch phases, and registrar-specific rules still apply.

## Limitations

- TLD-List labels this API as legacy v1 and says a replacement is in development.
- API v1 does not document domain-level availability.
- API v1 does not document popularity or ranking data. An example response contains an unexplained `clicks` field, but this project deliberately does not interpret it or offer popularity sorting.
- Prices are TLD-level listings, not guaranteed quotes for a particular domain. Premium domains can cost more.
- RDAP coverage and behavior vary by registry.
- In-memory cache contents disappear when the process exits and are not shared across processes.
- The documented API limit is currently 100 requests per 15 minutes and can change without notice.
- Real-API compatibility cannot be asserted by CI because CI intentionally has no credentials; use the opt-in integration test with a valid account.

## Rate limits and reliability

TLD lists and registrar IDs default to 24-hour caching; pricing defaults to 15 minutes. Requests for multiple TLDs are sent as one documented batch wherever possible. Authentication errors and rate-limit responses are never retried. Network errors, timeouts, and eligible 5xx/system failures use bounded exponential backoff with a maximum of four configurable retries.

Bulk limits are intentionally conservative: 20 names, 100 explicitly selected TLDs, 500 domain checks, and 100 returned search results per call. When automatic TLD discovery is used, at most 200 candidates are sent to RDAP and truncation is reported.

## Security

- Credentials are read only from environment variables, excluded from cache keys, redacted from diagnostics, and never returned in tool output.
- `.env` files are ignored; `.env.example` contains placeholders only.
- Inputs are validated with Zod v4 and bounded before network work.
- TLD-List endpoints are a closed internal union; MCP input cannot select a URL.
- RDAP endpoints come only from the HTTPS IANA bootstrap registry.
- No shell execution, dynamic code execution, filesystem tools, or arbitrary URL-fetching tool is exposed.
- Run `npm run audit` and review lockfile changes before release.
- TLD-List's terms prohibit scraping and impose restrictions on commercial reuse/data redistribution. This project uses the documented API only. The MIT license covers this project's code, not TLD-List data or trademarks; users remain responsible for complying with TLD-List's terms.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), add mocked tests for behavior changes, and keep TLD-List-specific fields inside the v1 client/adapter boundary.

## License

MIT. See [LICENSE](LICENSE).
