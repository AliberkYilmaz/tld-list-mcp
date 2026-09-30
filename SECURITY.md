# Security policy

## Supported versions

Until the first stable release, security fixes are applied to the latest commit on `main`.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue for credential exposure, injection, SSRF, dependency compromise, or another vulnerability that could put users at risk.

Include:

- affected version or commit;
- reproduction steps;
- expected impact;
- any suggested mitigation.

You should receive an acknowledgement within seven days. Please allow time for a fix and coordinated disclosure.

## Credential handling

Never include real TLD-List keys in issues, tests, logs, screenshots, or pull requests. If a key is exposed, revoke or rotate it through TLD-List and remove it from local/client configuration.
