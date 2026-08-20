<#
    Build the Windows install package.

    ASCII ONLY. Windows PowerShell 5.1 reads .ps1 files using the system ANSI
    codepage, not UTF-8. A single non-ASCII byte in this file is mangled on the
    way in and breaks the parser, so every comment and message here is English.
    Persian belongs in README.md, which nothing has to parse.

    Runs on the Windows laptop, not on the Mac. `sharp`, `argon2` and the Prisma
    query engine are per-platform binaries; `npm install` on macOS produces macOS
    binaries that will not load on the Windows server.

    Output: a `payload\` folder for Inno Setup to package.

    Prerequisites (download these yourself):
      -NodeZip   node-v24.x-win-x64.zip
      -PgZip     postgresql-18.x-windows-x64-binaries.zip
      -NssmZip   nssm-2.24.zip

    Example:
      .\build.ps1 -NodeZip C:\dl\node.zip -PgZip C:\dl\pg.zip -NssmZip C:\dl\nssm.zip
#>
param(
    [Parameter(Mandatory = $true)][string]$NodeZip,
    [Parameter(Mandatory = $true)][string]$PgZip,
    [Parameter(Mandatory = $true)][string]$NssmZip
)

$ErrorActionPreference = 'Stop'

<#
    The Node version that gets packaged must match the one that runs
    `npm install`.

    Native binaries (sharp, argon2, the Prisma engine) are built against a
    specific ABI. Install under Node 24 (ABI 137) and ship a Node 22 (ABI 127)
    executable and the app dies on the customer's server with "compiled against
    a different version" -- an error nobody sees at build time, only on site.

    So fail loudly here rather than silently there.
#>
$REQUIRED_NODE_MAJOR = 24

<#
    Same reasoning for PostgreSQL, with a worse failure mode: a `pg_dump -Fc`
    taken on 18 cannot be restored into 16. Ship the wrong major and the
    customer's backups become unrestorable on the development machine, which is
    only discovered when a restore is actually needed.
#>
$REQUIRED_PG_MAJOR = 18

$buildNodeMajor = [int](node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if ($buildNodeMajor -ne $REQUIRED_NODE_MAJOR) {
    throw "This project builds with Node $REQUIRED_NODE_MAJOR but Node $buildNodeMajor is on PATH. Install the correct version."
}

$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo    = (Resolve-Path (Join-Path $here '..\..')).Path
$payload = Join-Path $here 'payload'
$staging = Join-Path $here '_stage'

function Say($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }

# ------------------------------------------------------------------- clean
Say 'Cleaning previous output'
Remove-Item -Recurse -Force $payload, $staging -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $payload, $staging | Out-Null

# ------------------------------------------------------------ dependencies
Say 'Installing dependencies (Windows binaries)'
Push-Location $repo
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }

Say 'Generating the Prisma client'
Push-Location (Join-Path $repo 'apps\api')
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw 'prisma generate failed' }
Pop-Location

Say 'Building the API'
npm --workspace @warehouse-os/api run build
if ($LASTEXITCODE -ne 0) { throw 'API build failed' }

Say 'Building the web panel'
# The API host is deliberately not set here: the browser derives it at runtime
# from the page's own origin, so one build serves the server, the seller PC and
# the phones without configuration.
npm --workspace @warehouse-os/web run build
if ($LASTEXITCODE -ne 0) { throw 'web build failed' }
Pop-Location

# ---------------------------------------------------------------- app\api
Say 'Collecting the API'
$apiOut = Join-Path $payload 'app\api'
New-Item -ItemType Directory -Force -Path $apiOut | Out-Null
Copy-Item (Join-Path $repo 'apps\api\dist')          $apiOut -Recurse
Copy-Item (Join-Path $repo 'apps\api\prisma')        $apiOut -Recurse
Copy-Item (Join-Path $repo 'apps\api\package.json')  $apiOut

# The Prisma CLI version is read from what the repo actually installed rather
# than from a range in package.json, so the packaged CLI is the one this schema
# and these migrations were tested against.
$prismaPkg = Join-Path $repo 'node_modules\prisma\package.json'
if (-not (Test-Path $prismaPkg)) { throw 'prisma CLI not found in the repo node_modules; did npm ci run?' }
$prismaVersion = (Get-Content $prismaPkg -Raw | ConvertFrom-Json).version
Say "Prisma CLI version: $prismaVersion"

# Runtime dependencies only. Installed inside the folder itself so paths stay
# simple on the server.
Push-Location $apiOut
npm install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'installing API runtime dependencies failed' }

<#
    The Prisma CLI is a devDependency at the repo root and is not listed in
    apps\api\package.json at all, so the install above never brings it. Without
    it `first-run.ps1` cannot run `migrate deploy` and the installer dies on the
    customer's server with a missing file -- install it explicitly.
#>
# --omit=dev is repeated here on purpose: `npm install <pkg>` without it would
# also pull in every devDependency still listed in the copied package.json.
Say 'Installing the Prisma CLI into the payload (needed for migrate deploy)'
npm install --omit=dev --no-audit --no-fund --save-exact "prisma@$prismaVersion"
if ($LASTEXITCODE -ne 0) { throw 'installing the Prisma CLI failed' }

npx prisma generate
if ($LASTEXITCODE -ne 0) { throw 'prisma generate failed in the payload' }
Pop-Location

# Prove the file first-run.ps1 will execute is actually there, now, rather than
# discovering it is missing halfway through a customer install.
$prismaEntry = Join-Path $apiOut 'node_modules\prisma\build\index.js'
if (-not (Test-Path $prismaEntry)) { throw "Prisma CLI entry point missing: $prismaEntry" }

# ---------------------------------------------------------------- app\web
Say 'Collecting the web panel'
$webOut = Join-Path $payload 'app\web'
New-Item -ItemType Directory -Force -Path $webOut | Out-Null

$standalone = Join-Path $repo 'apps\web\.next\standalone'
if (-not (Test-Path $standalone)) { throw 'standalone output not found; is output:"standalone" still set in next.config.ts?' }
$standalone = (Resolve-Path $standalone).Path

<#
    Copy the standalone tree whole.

    Next mirrors the build machine's source path inside the output and hoists
    node_modules to more than one level of that mirror -- `next` itself sits in
    the inner one. Copying just the folder holding server.js ships a panel that
    cannot start, and the missing module only shows up on the server.
#>
Copy-Item (Join-Path $standalone '*') $webOut -Recurse -Force

# Find the real entry point. node_modules is excluded because packages ship
# their own server.js files and any of them could match first.
$serverJs = Get-ChildItem -Path $standalone -Filter server.js -Recurse -File |
            Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
            Select-Object -First 1
if (-not $serverJs) { throw 'server.js not found in the standalone output' }

$relative = $serverJs.FullName.Substring($standalone.Length).TrimStart('\')

<#
    Where that entry point lands depends on the build machine's directory
    layout, which the service scripts cannot know. Write a launcher at a fixed
    path so `services.ps1` always has one stable thing to point at.

    The real server.js calls process.chdir(__dirname) itself, so requiring it
    from here leaves its own paths correct.
#>
if ($relative -ne 'server.js') {
    $target = './' + $relative.Replace('\', '/')
    Say "Web entry point: $relative"
    $launcher = @"
// Generated by build.ps1 -- do not edit.
// Next's standalone output nests the real server under a mirror of the build
// machine's source path, which is not known until build time. This launcher
// gives the Windows service one stable path to start.
require('$target');
"@
    Set-Content -Path (Join-Path $webOut 'server.js') -Value $launcher -Encoding ascii
} else {
    Say 'Web entry point: server.js (already at the root)'
}

# --------------------------------------------------------------- runtimes
Say 'Extracting Node'
$tmp = Join-Path $staging 'node'
Expand-Archive -Path $NodeZip -DestinationPath $tmp -Force
$nodeExe = Get-ChildItem $tmp -Filter node.exe -Recurse | Select-Object -First 1
if (-not $nodeExe) { throw 'node.exe not found in the archive' }

# The same check again, this time against the executable that actually ships.
$zipNodeMajor = [int](& $nodeExe.FullName -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if ($zipNodeMajor -ne $REQUIRED_NODE_MAJOR) {
    throw "The Node archive is version $zipNodeMajor but dependencies were installed with Node $REQUIRED_NODE_MAJOR. Native binaries will not load on the server."
}
New-Item -ItemType Directory -Force -Path (Join-Path $payload 'app\node') | Out-Null
Copy-Item $nodeExe.FullName (Join-Path $payload 'app\node\node.exe')

Say 'Extracting PostgreSQL'
$tmpPg = Join-Path $staging 'pg'
Expand-Archive -Path $PgZip -DestinationPath $tmpPg -Force
$pgRoot = Get-ChildItem $tmpPg -Directory |
          Where-Object { Test-Path (Join-Path $_.FullName 'bin\initdb.exe') } |
          Select-Object -First 1
if (-not $pgRoot) { throw 'no pgsql folder with bin\initdb.exe found' }

$initdb = Join-Path $pgRoot.FullName 'bin\initdb.exe'
# Output looks like: initdb (PostgreSQL) 18.4
$pgVersionText = (& $initdb --version) -join ' '
# [regex]::Match rather than -notmatch: whether -notmatch populates $Matches is
# version-dependent, and reading the major version wrong is the whole point of
# this check.
$pgMatch = [regex]::Match($pgVersionText, 'PostgreSQL\)\s+(\d+)')
if (-not $pgMatch.Success) { throw "could not read the PostgreSQL version from: $pgVersionText" }
$pgMajor = [int]$pgMatch.Groups[1].Value
if ($pgMajor -ne $REQUIRED_PG_MAJOR) {
    throw "The PostgreSQL archive is major version $pgMajor but this project uses $REQUIRED_PG_MAJOR. A pg_dump taken on $REQUIRED_PG_MAJOR cannot be restored into $pgMajor."
}
Say "PostgreSQL version: $pgVersionText"
Copy-Item $pgRoot.FullName (Join-Path $payload 'pgsql') -Recurse

Say 'Extracting NSSM'
$tmpN = Join-Path $staging 'nssm'
Expand-Archive -Path $NssmZip -DestinationPath $tmpN -Force
$nssm = Get-ChildItem $tmpN -Filter nssm.exe -Recurse |
        Where-Object { $_.FullName -match 'win64' } | Select-Object -First 1
if (-not $nssm) { throw 'nssm.exe (win64) not found' }
Copy-Item $nssm.FullName (Join-Path $payload 'nssm.exe')

# ------------------------------------------------------------ VC++ runtime
<#
    PostgreSQL 18's binaries are built with a recent MSVC toolchain. On a machine
    whose Visual C++ runtime is older than theirs, initdb crashes during its
    post-bootstrap step with access violation 0xC0000005 -- the binary loads but
    a specific code path faults. Bundling the current redistributable and running
    it first (see installer.iss) means the customer's server needs nothing
    preinstalled.
#>
Say 'Downloading the Visual C++ redistributable'
$vc = Join-Path $payload 'vc_redist.x64.exe'
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' `
        -OutFile $vc -UseBasicParsing
} catch {
    throw "Could not download vc_redist.x64.exe: $($_.Exception.Message). Download it by hand to $vc and rerun."
}
if (-not (Test-Path $vc)) { throw 'vc_redist.x64.exe was not downloaded' }

# ---------------------------------------------------------------- scripts
Say 'Copying the install scripts'
$scriptsOut = Join-Path $payload 'scripts'
New-Item -ItemType Directory -Force -Path $scriptsOut | Out-Null
Copy-Item (Join-Path $here 'first-run.ps1')  $scriptsOut
Copy-Item (Join-Path $here 'services.ps1')   $scriptsOut
Copy-Item (Join-Path $here 'update.ps1')     $scriptsOut

Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue

$size = '{0:N0} MB' -f ((Get-ChildItem $payload -Recurse |
         Measure-Object Length -Sum).Sum / 1MB)
Say "Ready: $payload  ($size)"
Write-Host 'Now open installer.iss in Inno Setup and hit Compile.' -ForegroundColor Green
