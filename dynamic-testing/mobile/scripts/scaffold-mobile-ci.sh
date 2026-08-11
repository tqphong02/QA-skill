#!/usr/bin/env bash

set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
skill_dir="$(dirname "$script_dir")"
workflow_source="${skill_dir}/assets/ci/github/pr-android-smoke.yml"
gate_source="${script_dir}/check-device-target.sh"
target_repo="${1:-}"

if [ -z "$target_repo" ]; then
  printf '%s\n' "Usage: $0 /absolute/path/to/target-repository" >&2
  exit 2
fi

case "$target_repo" in
  /*) ;;
  *)
    printf '%s\n' "Target repository path must be absolute: $target_repo" >&2
    exit 2
    ;;
esac

case "$target_repo" in
  /|"${HOME}")
    printf '%s\n' "Refusing broad target directory: $target_repo" >&2
    exit 2
    ;;
esac

if [ ! -d "$target_repo/.git" ]; then
  printf '%s\n' "Target is not a Git repository: $target_repo" >&2
  exit 1
fi

workflow_target="${target_repo}/.github/workflows/pr-android-smoke.yml"
gate_target="${target_repo}/scripts/check-device-target.sh"

for target in "$workflow_target" "$gate_target"; do
  if [ -e "$target" ]; then
    printf '%s\n' "Refusing to overwrite existing file: $target" >&2
    exit 1
  fi
done

mkdir -p "$(dirname "$workflow_target")" "$(dirname "$gate_target")"
cp "$workflow_source" "$workflow_target"
cp "$gate_source" "$gate_target"
chmod +x "$gate_target"

printf 'Created %s\n' "$workflow_target"
printf 'Created %s\n' "$gate_target"
printf '%s\n' "Next: implement scripts/build-android-test-app.sh and npm run test:mobile:smoke"
