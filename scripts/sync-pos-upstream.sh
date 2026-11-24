#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
git remote get-url pos-upstream >/dev/null 2>&1 || \
  git remote add pos-upstream https://github.com/mateopiza/ai-point-of-sale.git
git fetch pos-upstream main
git subtree pull --prefix=apps/pos pos-upstream main --squash
