# CHF workbench backup

Source snapshot: 958b9a9fb8330e3e33d1688b65671a91c2a048ad.

Run `sh restore-source.sh` to verify checksums and restore the complete project into `chf-collar-workbench/`. The script refuses to overwrite an existing directory. Read that project's AGENTS.md and README.md before editing. Node 22.13+ and pnpm 11.25.0 are required. Run pnpm test, pnpm typecheck, pnpm build. Publish this existing private Site with the Sites skill and preserve its project ID. The website archive is a build artifact; edit source, not the archive. Never commit secrets or user browser scenarios.
