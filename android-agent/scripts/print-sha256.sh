#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEYSTORE="$ROOT/keystore/debug.keystore"

if [[ ! -f "$KEYSTORE" ]]; then
  echo "Missing $KEYSTORE" >&2
  exit 1
fi

openssl pkcs12 -in "$KEYSTORE" -nokeys -passin pass:android 2>/dev/null \
  | openssl x509 -noout -fingerprint -sha256 \
  | sed 's/^sha256 Fingerprint=//'
