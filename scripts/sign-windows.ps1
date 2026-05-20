param(
  [string]$ArtifactDirectory = "dist",
  [string]$TimestampUrl = ""
)

$ErrorActionPreference = "Stop"

$thumbprint = $env:AURAONE_WINDOWS_CERT_THUMBPRINT
$pfxPath = $env:AURAONE_WINDOWS_PFX_PATH
$pfxPassword = $env:AURAONE_WINDOWS_PFX_PASSWORD
$provider = $env:AURAONE_WINDOWS_SIGNING_PROVIDER
if (-not $provider) {
  $provider = $env:WINDOWS_SIGNING_PROVIDER
}
$provider = "$provider".Trim().ToLowerInvariant()
$artifactSigningProvider = $provider -in @(
  "azure-artifact-signing",
  "artifact-signing",
  "azure-trusted-signing",
  "trusted-signing"
)
$dryRun = $env:AURAONE_DRY_RUN -eq "1"

if (-not $TimestampUrl) {
  if ($artifactSigningProvider) {
    $TimestampUrl = "http://timestamp.acs.microsoft.com"
  } else {
    $TimestampUrl = "http://timestamp.digicert.com"
  }
}

$artifactSigningDlibPath = $env:AURAONE_ARTIFACT_SIGNING_DLIB_PATH
if (-not $artifactSigningDlibPath) {
  $artifactSigningDlibPath = $env:AURAONE_TRUSTED_SIGNING_DLIB_PATH
}
$artifactSigningMetadataPath = $env:AURAONE_ARTIFACT_SIGNING_METADATA_PATH
if (-not $artifactSigningMetadataPath) {
  $artifactSigningMetadataPath = $env:AURAONE_TRUSTED_SIGNING_METADATA_PATH
}
$artifactSigningEndpoint = $env:AURAONE_ARTIFACT_SIGNING_ENDPOINT
if (-not $artifactSigningEndpoint) {
  $artifactSigningEndpoint = $env:AURAONE_TRUSTED_SIGNING_ENDPOINT
}
$artifactSigningAccountName = $env:AURAONE_ARTIFACT_SIGNING_ACCOUNT_NAME
if (-not $artifactSigningAccountName) {
  $artifactSigningAccountName = $env:AURAONE_TRUSTED_SIGNING_ACCOUNT_NAME
}
$artifactSigningCertificateProfile = $env:AURAONE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME
if (-not $artifactSigningCertificateProfile) {
  $artifactSigningCertificateProfile = $env:AURAONE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME
}
$artifactSigningCorrelationId = $env:AURAONE_ARTIFACT_SIGNING_CORRELATION_ID

if (-not $thumbprint -and -not $pfxPath -and -not $artifactSigningProvider) {
  throw "AURAONE_WINDOWS_CERT_THUMBPRINT, AURAONE_WINDOWS_PFX_PATH, or AURAONE_WINDOWS_SIGNING_PROVIDER=azure-artifact-signing is required for Windows signing"
}
if ($pfxPath -and -not $pfxPassword) {
  throw "AURAONE_WINDOWS_PFX_PASSWORD secret is required when signing from PFX"
}
if ($artifactSigningProvider) {
  if (-not $artifactSigningDlibPath) {
    throw "AURAONE_ARTIFACT_SIGNING_DLIB_PATH is required for Azure Artifact Signing"
  }
  if (-not $dryRun -and -not (Test-Path $artifactSigningDlibPath)) {
    throw "AURAONE_ARTIFACT_SIGNING_DLIB_PATH does not exist"
  }
  if ($artifactSigningMetadataPath) {
    if (-not $dryRun -and -not (Test-Path $artifactSigningMetadataPath)) {
      throw "AURAONE_ARTIFACT_SIGNING_METADATA_PATH does not exist"
    }
  } elseif (-not $artifactSigningEndpoint -or -not $artifactSigningAccountName -or -not $artifactSigningCertificateProfile) {
    throw "set AURAONE_ARTIFACT_SIGNING_METADATA_PATH or AURAONE_ARTIFACT_SIGNING_ENDPOINT, AURAONE_ARTIFACT_SIGNING_ACCOUNT_NAME, and AURAONE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME"
  }
}

$temporaryMetadataPath = $null

try {
  if ($artifactSigningProvider -and -not $artifactSigningMetadataPath) {
    $metadata = [ordered]@{
      Endpoint = $artifactSigningEndpoint
      CodeSigningAccountName = $artifactSigningAccountName
      CertificateProfileName = $artifactSigningCertificateProfile
    }
    if ($artifactSigningCorrelationId) {
      $metadata.CorrelationId = $artifactSigningCorrelationId
    }
    $temporaryMetadataPath = [System.IO.Path]::GetTempFileName()
    $metadata | ConvertTo-Json -Depth 4 | Set-Content -Path $temporaryMetadataPath -NoNewline -Encoding utf8
    $artifactSigningMetadataPath = $temporaryMetadataPath
  }

  Get-ChildItem -Path $ArtifactDirectory -Recurse -Include *.msi,*.exe,*.msix | ForEach-Object {
    if ($artifactSigningProvider) {
      $args = @("sign", "/v", "/debug", "/fd", "SHA256", "/tr", $TimestampUrl, "/td", "SHA256", "/dlib", $artifactSigningDlibPath, "/dmdf", $artifactSigningMetadataPath, $_.FullName)
    } elseif ($thumbprint) {
      $args = @("sign", "/fd", "SHA256", "/tr", $TimestampUrl, "/td", "SHA256", "/sha1", $thumbprint, $_.FullName)
    } else {
      $args = @("sign", "/fd", "SHA256", "/tr", $TimestampUrl, "/td", "SHA256", "/f", $pfxPath, "/p", $pfxPassword, $_.FullName)
    }

    if ($dryRun) {
      Write-Host "DRY RUN: signtool $($args -join ' ')"
      return
    }

    signtool @args
    signtool verify /pa /all $_.FullName
  }
} finally {
  if ($temporaryMetadataPath -and (Test-Path $temporaryMetadataPath)) {
    Remove-Item -Force $temporaryMetadataPath
  }
}
