#!/usr/bin/env bash
# Legacy POSIX entrypoint. The implementation is shared with Windows/local CI.
set -euo pipefail
node scripts/check-placeholders.mjs "$@"
