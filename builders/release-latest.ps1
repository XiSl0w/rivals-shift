[CmdletBinding()]
param(
  [string]$NotesFile,
  [string]$Target = 'main',
  [switch]$AllowDirty,
  [switch]$RequireClean,
  [switch]$Draft,
  [switch]$Prerelease,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Checked {
  param([Parameter(Mandatory)][string]$Command, [Parameter()][string[]]$Arguments = @())
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE." }
}

function Get-Sha256Hex {
  param([Parameter(Mandatory)][string]$Path)
  $stream = [IO.File]::OpenRead($Path)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

Push-Location $projectRoot
try {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is required.' }
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI is required. Install it from https://cli.github.com/.' }

  $packagePath = Join-Path $projectRoot 'package.json'
  $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
  $version = [string]$package.version
  if ($version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') { throw "package.json contains an invalid version: $version" }
  $tag = "v$version"

  $githubPublish = @($package.build.publish | Where-Object { $_.provider -eq 'github' }) | Select-Object -First 1
  if (-not $githubPublish -or -not $githubPublish.owner -or -not $githubPublish.repo) { throw 'package.json must contain a GitHub publish owner and repository.' }
  $repository = "$($githubPublish.owner)/$($githubPublish.repo)"

  $dirty = @(git status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the Git worktree.' }
  if ($dirty.Count) {
    if ($RequireClean -and -not $AllowDirty) { throw 'The worktree is dirty and -RequireClean was requested.' }
    Write-Warning "The local worktree has $($dirty.Count) changed path(s). Only compiled release artifacts will be uploaded; local source is not pushed."
  }

  $releaseDir = Join-Path $projectRoot 'release'
  $assetPaths = @(
    (Join-Path $releaseDir "Rival Shift Setup $version.exe"),
    (Join-Path $releaseDir "Rival-Shift-Payload-$version.exe"),
    (Join-Path $releaseDir "Rival-Shift-Payload-$version.exe.blockmap"),
    (Join-Path $releaseDir 'latest.yml')
  )
  foreach ($asset in $assetPaths) {
    if (-not (Test-Path -LiteralPath $asset -PathType Leaf)) { throw "Missing release artifact: $asset. Run build-installer first." }
  }

  $latestYaml = Get-Content -LiteralPath (Join-Path $releaseDir 'latest.yml') -Raw
  $latestVersion = [regex]::Match($latestYaml, '(?m)^version:\s*([^\s]+)').Groups[1].Value.Trim("'`"")
  if ($latestVersion -ne $version) { throw "latest.yml is for version '$latestVersion', but package.json is $version. Rebuild before releasing." }

  if ($NotesFile) {
    $resolvedNotes = (Resolve-Path -LiteralPath $NotesFile -ErrorAction Stop).Path
  }

  $checksumPath = Join-Path $releaseDir "Rival-Shift-$version-SHA256SUMS.txt"
  $checksumLines = $assetPaths | ForEach-Object {
    "$(Get-Sha256Hex -Path $_)  $([IO.Path]::GetFileName($_))"
  }
  Set-Content -LiteralPath $checksumPath -Value $checksumLines -Encoding ascii
  $assetPaths += $checksumPath

  Write-Host "Release: $repository $tag" -ForegroundColor Cyan
  $assetPaths | ForEach-Object { Write-Host "  $([IO.Path]::GetFileName($_))" }
  if ($DryRun) {
    Write-Host 'Dry run complete. Nothing was uploaded.' -ForegroundColor Yellow
    return
  }

  Invoke-Checked gh @('auth', 'status')
  $existingRelease = $false
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & gh release view $tag --repo $repository --json tagName 2>$null | Out-Null
  $releaseLookupExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorPreference
  if ($releaseLookupExitCode -eq 0) { $existingRelease = $true }

  if ($existingRelease) {
    Write-Host "Updating existing release $tag..." -ForegroundColor Cyan
    Invoke-Checked gh (@('release', 'upload', $tag) + $assetPaths + @('--repo', $repository, '--clobber'))
    Invoke-Checked gh @('release', 'edit', $tag, '--repo', $repository, '--latest')
  } else {
    $arguments = @('release', 'create', $tag) + $assetPaths + @('--repo', $repository, '--target', $Target, '--title', "Rival Shift $version", '--latest')
    if ($NotesFile) { $arguments += @('--notes-file', $resolvedNotes) } else { $arguments += '--generate-notes' }
    if ($Draft) { $arguments += '--draft' }
    if ($Prerelease) { $arguments += '--prerelease' }
    Write-Host "Creating release $tag..." -ForegroundColor Cyan
    Invoke-Checked gh $arguments
  }

  $releaseUrl = (& gh release view $tag --repo $repository --json url --jq .url).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'The release was uploaded, but its final URL could not be verified.' }
  Write-Host "Published $tag to ${repository}: $releaseUrl" -ForegroundColor Green
} finally {
  Pop-Location
}
