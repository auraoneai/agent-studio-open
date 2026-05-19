param(
  [string]$ArtifactDirectory = "dist"
)

$ErrorActionPreference = "Stop"

if (-not $env:AURAONE_WINDOWS_CERT_THUMBPRINT -and -not $env:AURAONE_WINDOWS_PFX_PATH) {
  throw "AURAONE_WINDOWS_CERT_THUMBPRINT or AURAONE_WINDOWS_PFX_PATH secret is required for Windows signing"
}

if ($env:AURAONE_WINDOWS_PFX_PATH -and -not $env:AURAONE_WINDOWS_PFX_PASSWORD) {
  throw "AURAONE_WINDOWS_PFX_PASSWORD secret is required when signing from PFX"
}

Get-ChildItem -Path $ArtifactDirectory -Filter *.msi -Recurse | ForEach-Object {
  if ($env:AURAONE_WINDOWS_CERT_THUMBPRINT) {
    signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /sha1 $env:AURAONE_WINDOWS_CERT_THUMBPRINT $_.FullName
  } else {
    signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /f $env:AURAONE_WINDOWS_PFX_PATH /p $env:AURAONE_WINDOWS_PFX_PASSWORD $_.FullName
  }
  signtool verify /pa /all $_.FullName
}
