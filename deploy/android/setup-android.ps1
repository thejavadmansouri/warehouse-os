<#
  Android build toolchain for this repo - user scope only.

  No Android Studio, no emulator, no administrator rights. Everything lands in
  %LOCALAPPDATA%\AndroidBuild and stays there:

      jdk-17\           Temurin 17 JDK (AGP 8.6 builds with Java 17)
      android-sdk\      cmdline-tools + platform-tools + platform 35 + build-tools 35
      downloads\        the two archives (safe to delete afterwards)

  Then it writes apps\android\local.properties so Gradle finds the SDK. That file
  is already gitignored (/local.properties), so the machine-specific path never
  enters the repository.

  Idempotent: run it twice and the second run only reports what is already there.

  NOTE: this file is deliberately ASCII-only. Windows PowerShell 5.1 reads .ps1
  files as ANSI unless they carry a UTF-8 BOM, so a non-ASCII character (an em
  dash in a comment is enough) breaks the parser.

  Usage:
      powershell -NoProfile -ExecutionPolicy Bypass -File deploy\android\setup-android.ps1
      powershell ... -Root D:\android-build      # put the ~2 GB somewhere else
#>
[CmdletBinding()]
param(
  [string]$Root = "$env:LOCALAPPDATA\AndroidBuild",
  # Re-download / re-extract even when the pieces are already in place.
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
# Invoke-WebRequest is an order of magnitude faster without the progress bar,
# and TLS 1.2 must be asked for explicitly on older Windows PowerShell builds.
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$JdkDir     = Join-Path $Root 'jdk-17'
$SdkDir     = Join-Path $Root 'android-sdk'
$DlDir      = Join-Path $Root 'downloads'
$RepoRoot   = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LocalProps = Join-Path $RepoRoot 'apps\android\local.properties'
$SdkManager = Join-Path $SdkDir 'cmdline-tools\latest\bin\sdkmanager.bat'

# Pinned so two laptops get the same toolchain. The JDK URL is the Adoptium
# "latest 17 GA" redirect - a moving patch level, which is what we want
# (security fixes) without pinning a build we cannot verify.
$JdkUrl      = 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse'
$CmdToolsUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
$SdkPackages = @('platform-tools', 'platforms;android-35', 'build-tools;35.0.0')

New-Item -ItemType Directory -Force -Path $Root, $DlDir | Out-Null

function Get-Archive([string]$Url, [string]$Dest) {
  if ((Test-Path $Dest) -and -not $Force) {
    Write-Host ("  cached: {0}" -f (Split-Path $Dest -Leaf))
    return
  }
  Write-Host ("  downloading {0} ..." -f (Split-Path $Dest -Leaf))
  Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
}

function Expand-ArchiveTo([string]$Zip, [string]$Dest) {
  if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($Zip, $Dest)
}

# ---------------------------------------------------------------- 1. JDK ------
# A zip, not the MSI: an MSI would want elevation, a zip needs none.
if ((Test-Path (Join-Path $JdkDir 'bin\java.exe')) -and -not $Force) {
  Write-Host ("JDK 17: already installed at {0}" -f $JdkDir)
} else {
  Write-Host '== JDK 17 (Temurin) =='
  $jdkZip = Join-Path $DlDir 'temurin17-jdk.zip'
  Get-Archive $JdkUrl $jdkZip
  Expand-ArchiveTo $jdkZip $JdkDir
  # The archive holds a single top-level folder (jdk-17.0.x+y) - flatten it so
  # the path stays jdk-17\bin\java.exe whatever the patch level is.
  if (-not (Test-Path (Join-Path $JdkDir 'bin\java.exe'))) {
    $inner = Get-ChildItem $JdkDir -Directory | Select-Object -First 1
    if (-not $inner) { throw "unexpected JDK archive layout under $JdkDir" }
    Get-ChildItem $inner.FullName | Move-Item -Destination $JdkDir
    Remove-Item -Recurse -Force $inner.FullName
  }
  if (-not (Test-Path (Join-Path $JdkDir 'bin\java.exe'))) {
    throw "JDK extraction failed - no java.exe under $JdkDir"
  }
}

$env:JAVA_HOME = $JdkDir
Write-Host ("JAVA_HOME = {0}" -f $JdkDir)

# ------------------------------------------------------- 2. cmdline-tools -----
if ((Test-Path $SdkManager) -and -not $Force) {
  Write-Host ("cmdline-tools: already installed at {0}" -f (Split-Path $SdkManager -Parent))
} else {
  Write-Host '== Android command-line tools =='
  $cmdZip = Join-Path $DlDir 'commandlinetools-win.zip'
  Get-Archive $CmdToolsUrl $cmdZip

  $tmp = Join-Path $DlDir 'cmdline-tools-extract'
  Expand-ArchiveTo $cmdZip $tmp

  $latest = Join-Path $SdkDir 'cmdline-tools\latest'
  if (Test-Path $latest) { Remove-Item -Recurse -Force $latest }
  New-Item -ItemType Directory -Force -Path (Join-Path $SdkDir 'cmdline-tools') | Out-Null
  # The zip unpacks to cmdline-tools\bin\... - sdkmanager insists the folder be
  # named "latest" (or carry a source.properties with a known version).
  Move-Item (Join-Path $tmp 'cmdline-tools') $latest
  Remove-Item -Recurse -Force $tmp

  if (-not (Test-Path $SdkManager)) { throw "sdkmanager.bat missing under $latest\bin" }
}

# -------------------------------------------------------- 3. SDK packages -----
$env:ANDROID_HOME = $SdkDir
$env:ANDROID_SDK_ROOT = $SdkDir
Write-Host ("== SDK packages: {0} ==" -f ($SdkPackages -join ', '))

# Licences first, non-interactively. One "y" line per prompt; a few extra lines
# cost nothing and the prompts grow whenever Google adds a licence.
$yes = ("y`n" * 40)
$yes | & $SdkManager --sdk_root=$SdkDir --licenses | Out-Null
$yes | & $SdkManager --sdk_root=$SdkDir @SdkPackages

if (-not (Test-Path (Join-Path $SdkDir 'platforms\android-35\android.jar'))) {
  throw "platform 35 did not install - check the sdkmanager output above"
}

# ----------------------------------------------------- 4. local.properties -----
# Forward slashes on purpose: in a .properties file a backslash is an escape
# character, so "C:\Users\..." would need doubling while "C:/Users/..." is exact.
$sdkForProps = $SdkDir -replace '\\', '/'
$line = "sdk.dir=$sdkForProps"

$existing = if (Test-Path $LocalProps) { Get-Content $LocalProps -Raw } else { '' }
if ($existing -match '(?m)^\s*sdk\.dir=') {
  $updated = $existing -replace '(?m)^\s*sdk\.dir=.*$', $line
} elseif ($existing.Trim()) {
  $updated = $existing.TrimEnd() + "`r`n" + $line + "`r`n"
} else {
  $updated = $line + "`r`n"
}
Set-Content -Path $LocalProps -Value $updated -Encoding ASCII
Write-Host ("wrote {0}" -f $LocalProps)

# -------------------------------------------------------------- summary ------
$size = '{0:N1} GB' -f ((Get-ChildItem $Root -Recurse -File |
  Measure-Object -Property Length -Sum).Sum / 1GB)

Write-Host ''
Write-Host 'Toolchain ready.'
Write-Host ("  JDK  : {0}" -f $JdkDir)
Write-Host ("  SDK  : {0}" -f $SdkDir)
Write-Host ("  disk : {0} under {1}" -f $size, $Root)
Write-Host ''
Write-Host 'Build the app with:'
Write-Host '  powershell -NoProfile -ExecutionPolicy Bypass -File deploy\android\build-android.ps1'
Write-Host ''
Write-Host 'Nothing was added to PATH. If you want adb/java always available:'
Write-Host ("  setx JAVA_HOME `"{0}`"" -f $JdkDir)
Write-Host ("  setx ANDROID_HOME `"{0}`"" -f $SdkDir)
