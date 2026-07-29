#!/usr/bin/env bash

set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
template_dir="${script_dir}/../assets/wdio-template"
target_dir="${1:-}"

if [ -z "$target_dir" ]; then
  printf '%s\n' "Usage: $0 /absolute/path/to/new-project" >&2
  exit 2
fi

case "$target_dir" in
  /|"${HOME}")
    printf '%s\n' "Refusing broad target directory: $target_dir" >&2
    exit 2
    ;;
esac

if [ -e "$target_dir" ] && [ -n "$(find "$target_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  printf '%s\n' "Target must be absent or empty: $target_dir" >&2
  exit 1
fi

mkdir -p "$target_dir"
cp -R "${template_dir}/." "$target_dir/"

printf 'Created WebdriverIO/Appium fallback project at %s\n' "$target_dir"
printf '%s\n' "Next: edit config/capabilities.mjs, run npm install, then npm test"
