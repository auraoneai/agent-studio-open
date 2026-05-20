#!/usr/bin/env bash
set -euo pipefail

artifact_dir="${1:-dist}"

: "${AURAONE_GPG_KEY_ID:?AURAONE_GPG_KEY_ID secret is required for Linux artifact signing}"

gpg_args=(--batch --yes --local-user "$AURAONE_GPG_KEY_ID")
if [[ -n "${AURAONE_GPG_HOMEDIR:-}" ]]; then
  gpg_args=(--homedir "$AURAONE_GPG_HOMEDIR" "${gpg_args[@]}")
fi

find "$artifact_dir" -type f \( -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" -o -name "*.tar.gz" \) -print0 | while IFS= read -r -d '' artifact; do
  gpg "${gpg_args[@]}" --detach-sign --armor --output "${artifact}.asc" "$artifact"
  shasum -a 256 "$artifact" > "${artifact}.sha256"
done
