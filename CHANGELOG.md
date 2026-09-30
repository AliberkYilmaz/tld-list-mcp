# Changelog

All notable changes to this project will be documented here. This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.2] - 2026-10-01

### Fixed

- Derive MCP initialization metadata from `package.json` so the reported server version matches the installed package.
- Clarify shell-only `.env` usage without adding an environment-file dependency.

### Changed

- Require Node.js 22 or newer and test supported Node 22 and 24 releases in CI.
- Use the published npm executable in ready-to-copy MCP client configurations.
- Document npm Trusted Publishing and provenance.

## [0.1.1] - 2026-09-30

### Fixed

- Preserve the npm CLI executable entry during package normalization.
- Document the live npm installation commands and canonical GitHub URLs.

### Added

- Token-free npm Trusted Publishing through GitHub Actions.

## [0.1.0] - 2026-09-30

### Added

- Initial stdio MCP server with eight goal-oriented tools.
- Legacy TLD-List v1 typed client and replaceable `TldDataProvider` adapter.
- Separate IANA-bootstrap/RDAP availability adapter.
- In-memory TTL caching, bounded retries, timeouts, safe errors, and credential-redacted diagnostics.
- IDN/punycode normalization and same-currency ownership-cost calculations.
- Mocked unit tests, optional real-API integration tests, and Node 20/22/24 CI.
- npm publishing metadata and verified client configuration examples.

[Unreleased]: https://github.com/AliberkYilmaz/tld-list-mcp/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/AliberkYilmaz/tld-list-mcp/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/AliberkYilmaz/tld-list-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/AliberkYilmaz/tld-list-mcp/releases/tag/v0.1.0
