[CmdletBinding()]
param(
  [switch]$SkipTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$originalPath = $env:PATH
$pnpmShimDir = $null

function Invoke-Checked {
  param([Parameter(Mandatory)][string]$Command, [Parameter()][string[]]$Arguments = @())
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE." }
}

function Resolve-Executable {
  param([Parameter(Mandatory)][string]$Name, [Parameter()][string[]]$Candidates = @())
  $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command) { return $command.Source }
  foreach ($candidate in $Candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return $candidate }
  }
  return $null
}

function Invoke-Pnpm {
  param([Parameter()][string[]]$Arguments = @())
  if ($script:pnpmPath) { & $script:pnpmPath @Arguments }
  else { & $script:corepackPath pnpm @Arguments }
  if ($LASTEXITCODE -ne 0) { throw "pnpm failed with exit code $LASTEXITCODE." }
}

Push-Location $projectRoot
try {
  $script:nodePath = Resolve-Executable 'node' @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe' })
  )
  if (-not $script:nodePath) { throw 'Node.js is required. Install Node.js 22 or newer from https://nodejs.org/.' }

  $script:pnpmPath = Resolve-Executable 'pnpm' @(
    $(if ($env:APPDATA) { Join-Path $env:APPDATA 'npm\pnpm.cmd' }),
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'pnpm\pnpm.cmd' }),
    (Join-Path $env:ProgramFiles 'nodejs\pnpm.cmd')
  )
  $script:corepackPath = Resolve-Executable 'corepack' @(
    (Join-Path $env:ProgramFiles 'nodejs\corepack.cmd'),
    $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} 'nodejs\corepack.cmd' })
  )
  if (-not $script:pnpmPath -and -not $script:corepackPath) {
    throw 'pnpm was not found and Corepack is unavailable. Repair Node.js or run: corepack enable'
  }
  if (-not $script:pnpmPath) {
    Write-Host "Using Corepack with the pnpm version pinned in package.json." -ForegroundColor DarkGray
    $pnpmShimDir = Join-Path ([IO.Path]::GetTempPath()) "rival-shift-pnpm-shim-$PID"
    New-Item -ItemType Directory -Path $pnpmShimDir -Force | Out-Null
    $shimPath = Join-Path $pnpmShimDir 'pnpm.cmd'
    Set-Content -LiteralPath $shimPath -Encoding ascii -Value @(
      '@echo off',
      "`"$script:corepackPath`" pnpm %*"
    )
    $env:PATH = "$pnpmShimDir;$env:PATH"
    $script:pnpmPath = $shimPath
  }

  Write-Host 'Building Rival Shift...' -ForegroundColor Cyan
  Invoke-Pnpm @('typecheck')
  Invoke-Pnpm @('build')
  if (-not $SkipTests) {
    Write-Host 'Running the full test suite...' -ForegroundColor Cyan
    Invoke-Pnpm @('test')
  }

  Write-Host 'Compiling the Windows installer...' -ForegroundColor Cyan
  Invoke-Checked $script:nodePath @('builders/build-installer.mjs')

  $package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
  $installer = Join-Path $projectRoot "release/Rival Shift Setup $($package.version).exe"
  if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "Installer was not produced: $installer" }
  $item = Get-Item -LiteralPath $installer
  Write-Host "Installer ready: $($item.FullName) ($([math]::Round($item.Length / 1MB, 2)) MB)" -ForegroundColor Green
} finally {
  $env:PATH = $originalPath
  if ($pnpmShimDir -and (Test-Path -LiteralPath $pnpmShimDir)) {
    Remove-Item -LiteralPath $pnpmShimDir -Recurse -Force
  }
  Pop-Location
}
