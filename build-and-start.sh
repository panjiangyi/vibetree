#!/usr/bin/env bash
set -euo pipefail

pnpm build
pnpm --filter @vibetree/server start
