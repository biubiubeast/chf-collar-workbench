#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ -e chf-collar-workbench ]; then
  echo "chf-collar-workbench already exists; refusing to overwrite." >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c SHA256SUMS
else
  shasum -a 256 -c SHA256SUMS
fi
unzip -q chf-collar-workbench-source.zip
echo "Source restored to chf-collar-workbench/. Read AGENTS.md before development."
