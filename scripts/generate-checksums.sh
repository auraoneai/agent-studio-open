#!/usr/bin/env bash
set -euo pipefail

artifact_dir="${1:-dist}"

test -d "$artifact_dir"

(
  cd "$artifact_dir"
  find . -type f \
    ! -name "SHA256SUMS" \
    ! -name "SHA256SUMS.asc" \
    ! -name "*.asc" \
    ! -name "*.sha256" \
    -print0 |
    sort -z |
    xargs -0 shasum -a 256 |
    sed "s#  ./#  #"
) > "$artifact_dir/SHA256SUMS"

if [[ -n "${AURAONE_GPG_KEY_ID:-}" ]]; then
  gpg_args=(--batch --yes --local-user "$AURAONE_GPG_KEY_ID")
  if [[ -n "${AURAONE_GPG_HOMEDIR:-}" ]]; then
    gpg_args=(--homedir "$AURAONE_GPG_HOMEDIR" "${gpg_args[@]}")
  fi
  gpg "${gpg_args[@]}" --armor --detach-sign --output "$artifact_dir/SHA256SUMS.asc" "$artifact_dir/SHA256SUMS"
fi
