# FXCollar on bill@jpnode4

This deployment branch uses the current B application's financial engine with a
Next.js production server and persistent local SQLite storage. Original A and B
Sites project IDs and live deployments remain separate and unchanged.

## Initial setup

Use Node >=22.13, Corepack, pnpm 11.25.0, Git, PM2 and Ubuntu's flock. The project
pins pnpm, so do not change the gold application's global package configuration.

```sh
cd /home/bill/projects
git clone --branch deploy/ubuntu-fxcollar https://github.com/biubiubeast/chf-collar-workbench.git
cd chf-collar-workbench/chf-collar-workbench-b
node ubuntu/configure.mjs
```

Enter the administrator and client passwords yourself at the hidden prompts.
Configuration is written once to `~/.config/fxcollar/runtime.json` with mode 600;
the database is `~/.local/share/fxcollar/app.sqlite`. The public origin is
`https://bill.spailab.com`, the build prefix is `/FXCollar`, and the service listens
only on loopback port 3103. Confirm ports 3103 and 3104 are unused first.

Transfer the private migration export over an authenticated connection into
`/home/bill/.local/share/fxcollar/original-profiles.json`, mode 600. It contains
`schema: "chf-display-export-v1"` and separate `profiles.client` / `profiles.admin`.
Never put the export, database, passwords, cookies or runtime configuration in Git.

```sh
FXCOLLAR_IMPORT=/home/bill/.local/share/fxcollar/original-profiles.json bash ubuntu/deploy.sh
```

The importer reuses the product validator, keeps both audiences and timestamps,
checks the imported records, and refuses to replace existing profiles. Initial
publication requires both real original profiles, rather than empty defaults.
Do not migrate old login sessions or login-attempt counters. Users log in again.
Browser-local unpublished drafts are separate from these two published profiles.

After the internal health checks pass, back up bill's existing Caddyfile at
`~/.config/caddy/Caddyfile` and insert `ubuntu/Caddyfile.snippet` inside its :3101
block. Validate the complete configuration with bill's Caddy binary before using
the company-provided `sudo caddy-reload`. Preserve every existing route.
This app requires `handle`, which keeps the prefix; the gold app keeps its own
existing `handle_path` rule.

## Updates

```sh
cd /home/bill/projects/chf-collar-workbench/chf-collar-workbench-b
bash ubuntu/deploy.sh
```

Each update pulls only this deployment branch, builds an isolated release, runs
the regression/type/build checks, backs up SQLite, checks a candidate process,
switches the current symlink and restarts only `fxcollar`. Failed final checks
switch back to the previous application release. Database backups are retained
separately and are not silently restored over newer business data.

PM2 service: `fxcollar`. Releases: `/home/bill/apps/fxcollar/releases`. Database
backups: `/home/bill/apps/fxcollar/backups`. The original gold service remains
`optionhedger`. Use `pm2 logs fxcollar --lines 60` for diagnostics.

## Validation

```sh
pnpm test
pnpm typecheck --incremental false
NEXT_PUBLIC_BASE_PATH=/FXCollar pnpm build:ubuntu
pnpm test:ubuntu
```

The integration suite uses random test-only credentials and a temporary database,
and exercises the built standalone artifact, both roles, profile publication,
restart persistence, logout, private downloads and cross-origin write rejection.
The original Cloudflare Worker build commands are historical on this branch;
use `build:ubuntu` and the server launcher for Ubuntu.
