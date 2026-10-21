#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 -c SHA256SUMS
else
  sha256sum -c SHA256SUMS
fi
if [ -e chf-collar-workbench ]; then
  echo 'chf-collar-workbench already exists; refusing to overwrite.' >&2
  exit 1
fi
unzip -q chf-collar-workbench-source.zip
echo 'Restored chf-collar-workbench/. Read AGENTS.md and README.md before continuing.'
