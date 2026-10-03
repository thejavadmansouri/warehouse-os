<#
    Build the standalone Prisma CLI closure into tools\prisma-cli-kit\.

    WHY THIS EXISTS
      apply-update.ps1 runs `prisma generate` and `prisma migrate deploy` on the
      shop with the install's own node and a CLI it looks for under
      app\api\node_modules. No Setup payload and no previous kit carried that
      CLI, so on the shop both steps could not run and the pre-update CHECK
      reported "Prisma CLI (for migrations) not found". build-update-kit.ps1
      copies this folder into the kit as api\node_modules.

    WHAT IT DOES
      npm-installs the pinned prisma + @prisma/client versions into a fresh
      prefix, prunes what a shop never needs (download caches, sourcemaps),
      then proves the result standalone: --version must answer and
      `migrate status` against the local database must exit 0 before the
      closure is accepted.

    USAGE
      powershell -ExecutionPolicy Bypass -File tools\build-prisma-cli-kit.ps1
          -> tools\prisma-cli-kit\node_modules  (refuses to overwrite without -Force)

    ASCII ONLY, PowerShell 5.1 syntax only (same rule as build-update-kit.ps1).
#>
[CmdletBinding()]
param(
    [string]$Version = '6.19.3',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$kitDir = Join-Path $here 'prisma-cli-kit'
$mods = Join-Path $kitDir 'node_modules'

function Say([string]$m) { Write-Host $m }

if (Test-Path (Join-Path $mods 'prisma\build\index.js')) {
    if (-not $Force) {
        Say "prisma-cli-kit already exists at $kitDir"
        Say 'Delete it first or pass -Force to rebuild.'
        exit 1
    }
    Say "Removing the existing closure at $kitDir"
    Remove-Item -Recurse -Force $kitDir
}

New-Item -ItemType Directory -Force -Path $kitDir | Out-Null
Push-Location $kitDir
try {
    Set-Content -Path (Join-Path $kitDir 'package.json') -Value (@{
        name    = 'prisma-cli-kit'
        version = '1.0.0'
        private = $true
    } | ConvertTo-Json) -Encoding ascii

    Say "Installing prisma@$Version + @prisma/client@$Version ..."
    & npm install --no-audit --no-fund --omit=dev "prisma@$Version" "@prisma/client@$Version"
    if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }

    # A shop never needs the engine download cache (the install's own
    # @prisma/engines carries the binaries) nor sourcemaps.
    $cache = Join-Path $mods '@prisma\engines\node_modules\.cache'
    if (Test-Path $cache) { Remove-Item -Recurse -Force $cache }
    Get-ChildItem $mods -Recurse -Filter '*.map' -File | Remove-Item -Force
} finally {
    Pop-Location
}

Say ''
Say 'Proving the closure standalone:'
& node (Join-Path $mods 'prisma\build\index.js') --version
if ($LASTEXITCODE -ne 0) { throw 'the closure cannot run --version' }

$dbUrl = $env:DATABASE_URL
if (-not $dbUrl) {
    $envFile = Join-Path (Split-Path -Parent $here) 'apps\api\.env'
    if (Test-Path $envFile) {
        foreach ($l in Get-Content $envFile) {
            if ($l -match '^\s*DATABASE_URL\s*=\s*(.+)$') { $dbUrl = $Matches[1].Trim('"', "'") }
        }
    }
}
if ($dbUrl) {
    $env:DATABASE_URL = $dbUrl
    $schema = Join-Path (Split-Path -Parent $here) 'apps\api\prisma\schema.prisma'
    & node (Join-Path $mods 'prisma\build\index.js') migrate status --schema $schema
    if ($LASTEXITCODE -ne 0) { throw 'the closure cannot run migrate status against the local database' }
} else {
    Say '  (no DATABASE_URL found - skipped the migrate status proof; --version passed)'
}

$size = (Get-ChildItem $mods -Recurse -File | Measure-Object Length -Sum).Sum
Say ''
Say ('CLOSURE READY: {0}  ({1:N1} MB)' -f $mods, ($size / 1MB))
Say 'build-update-kit.ps1 will copy this into the kit as api\node_modules.'
