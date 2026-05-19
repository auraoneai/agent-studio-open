#!/usr/bin/env bash
set -euo pipefail

artifact_dir="${1:-dist}"

APPLE_ID="${AURAONE_APPLE_ID:-${APPLE_ID:-}}"
APPLE_TEAM_ID="${AURAONE_APPLE_TEAM_ID:-${APPLE_TEAM_ID:-}}"
APPLE_APP_SPECIFIC_PASSWORD="${AURAONE_APPLE_APP_PASSWORD:-${APPLE_APP_SPECIFIC_PASSWORD:-}}"
NOTARY_KEY_P8="${AURAONE_NOTARY_KEY_P8:-}"
NOTARY_KEY_ID="${AURAONE_NOTARY_KEY_ID:-${APPLE_API_KEY:-}}"
NOTARY_ISSUER_ID="${AURAONE_NOTARY_ISSUER_ID:-${APPLE_API_ISSUER:-}}"

temporary_key_dir=""
cleanup() {
  if [[ -n "$temporary_key_dir" ]]; then
    rm -rf "$temporary_key_dir"
  fi
}
trap cleanup EXIT

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun is required for macOS notarization." >&2
  exit 2
fi

auth_args=()
if [[ -n "$NOTARY_KEY_P8" ]]; then
  : "${NOTARY_KEY_ID:?AURAONE_NOTARY_KEY_ID secret is required when using AURAONE_NOTARY_KEY_P8}"
  : "${NOTARY_ISSUER_ID:?AURAONE_NOTARY_ISSUER_ID secret is required when using AURAONE_NOTARY_KEY_P8}"
  temporary_key_dir="$(mktemp -d)"
  notary_key_path="$temporary_key_dir/AuthKey_${NOTARY_KEY_ID}.p8"
  printf '%s\n' "$NOTARY_KEY_P8" > "$notary_key_path"
  chmod 600 "$notary_key_path"
  auth_args=(--key "$notary_key_path" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER_ID")
else
  : "${APPLE_ID:?AURAONE_APPLE_ID secret is required for notarization}"
  : "${APPLE_TEAM_ID:?AURAONE_APPLE_TEAM_ID secret is required for notarization}"
  : "${APPLE_APP_SPECIFIC_PASSWORD:?AURAONE_APPLE_APP_PASSWORD secret is required for notarization}"
  auth_args=(--apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD")
fi

find "$artifact_dir" -type f \( -name "*.dmg" -o -name "*.zip" \) -print0 | while IFS= read -r -d '' artifact; do
  xcrun notarytool submit "$artifact" "${auth_args[@]}" --wait
done
