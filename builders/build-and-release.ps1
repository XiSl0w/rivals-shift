[CmdletBinding()]
param(
  [string]$NotesFile,
  [string]$Target = 'main',
  [switch]$AllowDirty,
  [switch]$RequireClean,
  [switch]$SkipTests,
  [switch]$Draft,
  [switch]$Prerelease,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$buildArguments = @{}
if ($SkipTests) { $buildArguments.SkipTests = $true }
& (Join-Path $PSScriptRoot 'build-installer.ps1') @buildArguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$releaseArguments = @{}
if ($NotesFile) { $releaseArguments.NotesFile = $NotesFile }
$releaseArguments.Target = $Target
if ($AllowDirty) { $releaseArguments.AllowDirty = $true }
if ($RequireClean) { $releaseArguments.RequireClean = $true }
if ($Draft) { $releaseArguments.Draft = $true }
if ($Prerelease) { $releaseArguments.Prerelease = $true }
if ($DryRun) { $releaseArguments.DryRun = $true }
& (Join-Path $PSScriptRoot 'release-latest.ps1') @releaseArguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
