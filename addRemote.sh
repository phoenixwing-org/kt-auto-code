#!/usr/bin/env sh

set -eu

GITEE_URL="https://gitee.com/phoenixwing/kt-auto-code.git"
GITHUB_URL="https://github.com/phoenixwing-org/kt-auto-code.git"
REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

usage() {
  printf 'Usage: %s [--remove-origin]\n' "$(basename -- "$0")"
}

if [ "$#" -gt 1 ]; then
  usage >&2
  exit 2
fi

case "${1:-}" in
  "") ;;
  --remove-origin) ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if ! git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '[remote] Not a Git repository: %s\n' "$REPO_ROOT" >&2
  exit 1
fi

ensure_remote() {
  name=$1
  url=$2

  if git -C "$REPO_ROOT" remote get-url "$name" >/dev/null 2>&1; then
    current_url=$(git -C "$REPO_ROOT" remote get-url "$name")
    if [ "$current_url" = "$url" ]; then
      printf '[remote] %s unchanged: %s\n' "$name" "$url"
    else
      git -C "$REPO_ROOT" remote set-url "$name" "$url"
      printf '[remote] %s updated: %s\n' "$name" "$url"
    fi
  else
    git -C "$REPO_ROOT" remote add "$name" "$url"
    printf '[remote] %s added: %s\n' "$name" "$url"
  fi
}

ensure_remote gitee "$GITEE_URL"
ensure_remote github "$GITHUB_URL"

if [ "${1:-}" = "--remove-origin" ] && git -C "$REPO_ROOT" remote get-url origin >/dev/null 2>&1; then
  git -C "$REPO_ROOT" remote remove origin
  printf '[remote] origin removed\n'
fi

printf '\n[remote] Current remotes:\n'
git -C "$REPO_ROOT" remote -v
