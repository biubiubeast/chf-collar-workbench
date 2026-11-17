# Ubuntu deployment branch

The active application is `chf-collar-workbench-b/` on `deploy/ubuntu-fxcollar`.
Read its AGENTS.md and Ubuntu deployment instructions before editing. This branch
uses Next.js and SQLite. Deploy to the configured Ubuntu host, not to Sites.

Merge product updates from `main` while preserving the existing URL prefix,
authentication, persistent database adapter and Ubuntu build scripts. Run the
regression suite, type check, Ubuntu production build and integration suite.

`oldversion-chf-collar-workbench/` is the original A source, renamed from
`chf-collar-workbench/`. Preserve its contents and the existing A/B hosting
identities. Root archives and restore-source.sh are historical delivery packages.

Keep credentials, host-specific configuration, databases, customer exports and
browser cookies outside Git. Normal updates reuse existing runtime configuration
and business data; initial setup and migration imports are not update steps.
