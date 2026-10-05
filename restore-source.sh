#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ -e chf-collar-workbench ]; then
  printf '%s\n' 'chf-collar-workbench already exists; stopped to preserve your files.' >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c SHA256SUMS
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 -c SHA256SUMS
else
  printf '%s\n' 'A SHA-256 utility is required (sha256sum or shasum).' >&2
  exit 1
fi
unzip -q chf-collar-workbench-source.zip
printf '%s\n' 'Source restored. Next: cd chf-collar-workbench && pnpm install --frozen-lockfile && pnpm dev'
