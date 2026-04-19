#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$PWD}"

has_path() {
  [ -e "$ROOT/$1" ]
}

if ! has_path README.md; then
  echo "CHECKOUT_INCOMPLETE missing=README.md root=$ROOT"
  exit 0
fi

if has_path server && has_path client; then
  missing=()
  has_path server/start.sh || missing+=("server/start.sh")
  has_path client/gradlew || missing+=("client/gradlew")

  if [ ${#missing[@]} -eq 0 ]; then
    echo "CHECKOUT_OK root=$ROOT"
  else
    echo "CHECKOUT_INCOMPLETE root=$ROOT missing=${missing[*]}"
  fi
  exit 0
fi

if ! has_path server && ! has_path client; then
  echo "CHECKOUT_DOCS_ONLY root=$ROOT"
  exit 0
fi

missing=()
has_path server || missing+=("server")
has_path client || missing+=("client")
echo "CHECKOUT_INCOMPLETE root=$ROOT missing=${missing[*]}"
