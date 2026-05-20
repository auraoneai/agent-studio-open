#!/usr/bin/env bash
set -euo pipefail

version="${1:?version required}"
channel="${2:?channel required}"
artifact_dir="${3:?artifact dir required}"
bucket="${CLOUDFLARE_R2_BUCKET:-${AURAONE_R2_BUCKET:-auraone-open-updates}}"

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN secret is required for update manifest publishing}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID secret is required for update manifest publishing}"

test -d "$artifact_dir"
checksum_file="$(find "$artifact_dir" -name SHA256SUMS | head -n 1)"
checksum_signature="$(find "$artifact_dir" -name SHA256SUMS.asc | head -n 1)"

test -n "$checksum_file"
test -n "$checksum_signature"

wrangler=(wrangler)
if ! command -v wrangler >/dev/null 2>&1; then
  wrangler=(npx --yes wrangler@latest)
fi

"${wrangler[@]}" r2 object put "${bucket}/agent-studio-open/${channel}/${version}/SHA256SUMS" \
  --file "$checksum_file"
"${wrangler[@]}" r2 object put "${bucket}/agent-studio-open/${channel}/${version}/SHA256SUMS.asc" \
  --file "$checksum_signature"
