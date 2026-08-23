# =====================================================================
#  Warehouse OS - one-shot package builder for Windows 10
#
#  ASCII ONLY (PowerShell 5.1 reads .ps1 with the system codepage).
#
#  Puts everything together up to (and including) the Inno Setup compile.
#  Fixes the slow-extraction hang: node.exe is pulled with .NET and the
#  big archives with tar.exe instead of Expand-Archive.
#
#  HOW TO RUN (PowerShell, Run as administrator):
#     powershell -ExecutionPolicy Bypass -File "$HOME\Desktop\BUILD-ALL.ps1"
#
#  Before running, put these files in a folder named
#  "warehouse-os-install" ON THE DESKTOP:
#     node.zip  pg.zip  nssm.zip  vc_redist.x64.exe
#     warehouse-os-source.tar.gz
# =====================================================================

$ErrorActionPreference = 'Stop'
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force | Out-Null

function Step($m) { Write-Host "`n==== $m ====" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  OK  $m"        -ForegroundColor Green }
function Bad($m)  { Write-Host "  !!  $m"        -ForegroundColor Yellow }

$script:fail = $false

# ------------------------------------------------------------ config
$Desktop = [Environment]::GetFolderPath('Desktop')
$Src     = Join-Path $Desktop 'warehouse-os-install'
$Repo    = 'C:\warehouse-os'

Step "Source folder: $Src"
if (-not (Test-Path $Src)) {
    throw "Folder not found. Create it and put the install files there: $Src"
}

$need = @('node.zip','pg.zip','nssm.zip','vc_redist.x64.exe','warehouse-os-source.tar.gz')
foreach ($f in $need) {
    if (-not (Test-Path (Join-Path $Src $f))) {
        throw "Missing file '$f' in $Src"
    }
    Ok $f
}

# ------------------------------------------------------------ tooling
if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
    throw 'tar.exe not found. Windows 10 build 17063 or newer is required.'
}

Step 'Checking Node on PATH'
$nv = (& node -v)
if ($nv -notmatch '^v24\.') { throw "Node 24 must be on PATH. Found: $nv" }
Ok "node $nv"

# ------------------------------------------------------------ source
Step "Extracting the source to $Repo"
if (Test-Path $Repo) {
    Write-Host '  (removing the previous copy first)'
    Remove-Item $Repo -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $Repo | Out-Null
& tar.exe -xzf (Join-Path $Src 'warehouse-os-source.tar.gz') -C $Repo
if ($LASTEXITCODE -ne 0) { throw 'extracting the source archive failed' }

$deploy = Join-Path $Repo 'deploy\windows'
$bp     = Join-Path $deploy 'build.ps1'
if (-not (Test-Path $bp)) { throw "build.ps1 not found after extract: $bp" }
Ok 'source extracted'

Get-ChildItem $deploy -Filter *.ps1 | Unblock-File

# ------------------------------------------------ patch build.ps1 (fast)
Step 'Generating a fast build script (tar + .NET instead of Expand-Archive)'
$raw = (Get-Content -LiteralPath $bp -Raw) -replace "`r`n", "`n"

function Patch([string]$text, [string]$find, [string]$repl, [bool]$required = $true) {
    $find = $find -replace "`r`n", "`n"
    $repl = $repl -replace "`r`n", "`n"
    if (-not $text.Contains($find)) {
        if ($required) { throw "Patch target not found in build.ps1:`n$find" }
        Bad 'optional patch target not found - leaving the original in place'
        return $text
    }
    return $text.Replace($find, $repl)
}

$nodeFind = 'Expand-Archive -Path $NodeZip -DestinationPath $tmp -Force'
$nodeRepl = @'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$znode = [System.IO.Compression.ZipFile]::OpenRead($NodeZip)
$enode = $znode.Entries | Where-Object { $_.Name -eq 'node.exe' } | Select-Object -First 1
if (-not $enode) { $znode.Dispose(); throw 'node.exe not found in the archive' }
[System.IO.Compression.ZipFileExtensions]::ExtractToFile($enode, (Join-Path $tmp 'node.exe'), $true)
$znode.Dispose()
'@

$pgFind = 'Expand-Archive -Path $PgZip -DestinationPath $tmpPg -Force'
$pgRepl = @'
New-Item -ItemType Directory -Force -Path $tmpPg | Out-Null
& tar.exe -xf $PgZip -C $tmpPg
if ($LASTEXITCODE -ne 0) { throw 'tar failed to extract PostgreSQL' }
'@

$nssmFind = 'Expand-Archive -Path $NssmZip -DestinationPath $tmpN -Force'
$nssmRepl = @'
New-Item -ItemType Directory -Force -Path $tmpN | Out-Null
& tar.exe -xf $NssmZip -C $tmpN
if ($LASTEXITCODE -ne 0) { throw 'tar failed to extract NSSM' }
'@

# Optional: use the local vc_redist instead of downloading it (works offline).
$vcFind = @'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' `
        -OutFile $vc -UseBasicParsing
'@
$vcRepl = @'
    Copy-Item $env:WOS_VCREDIST $vc -Force
'@

$raw = Patch $raw $nodeFind $nodeRepl $true
$raw = Patch $raw $pgFind   $pgRepl   $true
$raw = Patch $raw $nssmFind $nssmRepl $true
$raw = Patch $raw $vcFind   $vcRepl   $false

$gen = Join-Path $deploy 'build.gen.ps1'
[System.IO.File]::WriteAllText($gen, $raw, [System.Text.Encoding]::ASCII)
Ok 'build.gen.ps1 written'

# ------------------------------------------------------------ build
Step 'Building the package (npm ci + API + web + runtimes). 15-25 minutes.'
Write-Host '  Do not press keys in this window while it runs.' -ForegroundColor DarkGray
$env:WOS_VCREDIST = Join-Path $Src 'vc_redist.x64.exe'
& $gen -NodeZip (Join-Path $Src 'node.zip') `
       -PgZip   (Join-Path $Src 'pg.zip') `
       -NssmZip (Join-Path $Src 'nssm.zip')

# ------------------------------------------------------------ verify
Step 'Verifying the package is complete'
$payload = Join-Path $deploy 'payload'
$api     = Join-Path $payload 'app\api\node_modules'

function Must($path, $label) {
    if (Test-Path $path) { Ok $label }
    else { Bad "MISSING: $label"; $script:fail = $true }
}

Must (Join-Path $payload 'app\node\node.exe')                          'node.exe'
Must (Join-Path $payload 'pgsql\bin\initdb.exe')                       'pgsql\bin\initdb.exe'
Must (Join-Path $payload 'pgsql\bin\pg_dump.exe')                      'pgsql\bin\pg_dump.exe'
Must (Join-Path $payload 'pgsql\bin\pg_restore.exe')                   'pgsql\bin\pg_restore.exe'
Must (Join-Path $payload 'nssm.exe')                                   'nssm.exe'
Must (Join-Path $payload 'vc_redist.x64.exe')                          'vc_redist.x64.exe'
Must (Join-Path $payload 'scripts\first-run.ps1')                      'scripts\first-run.ps1'
Must (Join-Path $payload 'scripts\services.ps1')                       'scripts\services.ps1'
Must (Join-Path $payload 'app\api\dist\main.js')                       'app\api\dist\main.js'
Must (Join-Path $payload 'app\api\node_modules\prisma\build\index.js') 'prisma CLI'
Must (Join-Path $payload 'app\web\server.js')                          'app\web\server.js'

# Native binaries - the whole reason this must build on Windows.
Step 'Verifying native Windows binaries'
$sharpImg = Get-ChildItem (Join-Path $api '@img') -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match 'sharp-win32' }
if ($sharpImg) { Ok "sharp binary package: $($sharpImg.Name)" }
else { Bad 'sharp win32 binary package missing'; $script:fail = $true }

function Native($mod) {
    $dir = Join-Path $api $mod
    if (-not (Test-Path $dir)) { Bad "module dir missing: $mod"; $script:fail = $true; return }
    $n = Get-ChildItem $dir -Recurse -Filter *.node -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($n) { Ok "$mod native binary: $($n.Name)" }
    else { Bad "no .node binary under $mod"; $script:fail = $true }
}
Native 'argon2'
Native 'bcrypt'

$pe = Get-ChildItem $api -Recurse -Filter 'query_engine-windows*.node' -ErrorAction SilentlyContinue |
      Select-Object -First 1
if (-not $pe) {
    $pe = Get-ChildItem $api -Recurse -Filter 'query_engine-windows*.dll.node' -ErrorAction SilentlyContinue |
          Select-Object -First 1
}
if ($pe) { Ok "prisma query engine: $($pe.Name)" }
else { Bad 'prisma windows query engine missing'; $script:fail = $true }

if ($script:fail) {
    throw 'Verification FAILED. Fix the items marked !! above before building the installer.'
}
Ok 'Package is complete.'

# ------------------------------------------------------------ Inno Setup
Step 'Compiling the installer with Inno Setup'
$iss = Join-Path $deploy 'installer.iss'
$iscc = @(
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe',
    'C:\Program Files (x86)\Inno Setup 5\ISCC.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
    $c = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($c) { $iscc = $c.Source }
}

if ($iscc) {
    & $iscc $iss
    if ($LASTEXITCODE -ne 0) { throw 'ISCC (Inno Setup compiler) failed' }
    # Version is read from installer.iss rather than hardcoded here: the two
    # drifted apart once already (script still said 0.2.0 after the installer
    # moved to 0.3.0), and the only symptom was a successful compile reported
    # as a failure at the very last step.
    $verLine = Select-String -Path $iss -Pattern '#define\s+AppVersion\s+"([^"]+)"' |
        Select-Object -First 1
    if (-not $verLine) { throw "could not read AppVersion from $iss" }
    $appVersion = $verLine.Matches[0].Groups[1].Value
    $setup = Join-Path $deploy "Output\WarehouseOS-Setup-$appVersion.exe"
    if (Test-Path $setup) {
        Step 'DONE'
        Ok "Installer ready: $setup"
        Write-Host ''
        Write-Host 'Next: right-click that Setup.exe -> Run as administrator.' -ForegroundColor White
    } else {
        Bad 'ISCC ran but the Setup.exe is not where expected.'
        Write-Host "Look under: $deploy\Output" -ForegroundColor White
    }
} else {
    Step 'DONE (package built; installer not compiled)'
    Bad 'Inno Setup (ISCC.exe) was not found on this machine.'
    Write-Host 'Install Inno Setup, then open this file and press F9:' -ForegroundColor White
    Write-Host "  $iss" -ForegroundColor White
}
