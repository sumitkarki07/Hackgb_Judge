#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
npm run check
node scripts/configure.mjs
printf '%s\n' 'Ready. Read docs/SETUP.md for Google authorization and deployment.'
