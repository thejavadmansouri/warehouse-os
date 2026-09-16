<#
  Build the Android operator app with the toolchain from setup-android.ps1.

  No Android Studio, no emulator: the APK is built here and installed on a real
  phone over USB (or wireless debugging) with adb.

  ASCII-only on purpose: Windows PowerShell 5.1 reads .ps1 files as ANSI unless
  they carry a UTF-8 BOM, so a stray non-ASCII character breaks the parser.

  Usage:
      powershell -NoProfile -ExecutionPolicy Bypass -File deploy\android\build-android.ps1
      powershell ... -SkipTests                        # APK only, no unit tests
      powershell ... -Install                          # build then adb install -r
      powershell ... -Task :app:testDevDebugUnitTest  # run one Gradle task

  Defaults: unit tests on the devDebug variant, then the devBench APK. "bench" is
  release-shaped (R8, resource shrinking, not debuggable) because a debug build
  cannot tell you how the app really feels on a warehouse phone.
#>
[CmdletBinding()]
param(
  [string]$Root = "$env:LOCALAPPDATA\AndroidBuild",
  [switch]$SkipTests,
  [switch]$Install,
  # Escape hatch: run exactly this Gradle task instead of the default pair.
  [string]$Task
)

$ErrorActionPreference = 'Stop'

$JdkDir = Join-Path $Root 'jdk-17'
$SdkDir = Join-Path $Root 'android-sdk'
$AppDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..\apps\android')).Path
$Adb    = Join-Path $SdkDir 'platform-tools\adb.exe'

if (-not (Test-Path (Join-Path $JdkDir 'bin\java.exe'))) {
  throw "JDK not found at $JdkDir - run deploy\android\setup-android.ps1 first"
}
if (-not (Test-Path (Join-Path $SdkDir 'platforms\android-35\android.jar'))) {
  throw "Android SDK not found at $SdkDir - run deploy\android\setup-android.ps1 first"
}

# Gradle needs both; nothing is set permanently, so a run never depends on how
# this machine's user environment happens to be configured.
$env:JAVA_HOME = $JdkDir
$env:ANDROID_HOME = $SdkDir
$env:ANDROID_SDK_ROOT = $SdkDir
$env:Path = (Join-Path $JdkDir 'bin') + ';' + (Join-Path $SdkDir 'platform-tools') + ';' + $env:Path

# Gradle's own console output is UTF-8; forcing the same on the JVM keeps Persian
# app strings and file names readable in build errors on a Windows console.
$env:GRADLE_OPTS = '-Dfile.encoding=UTF-8'
$env:JAVA_TOOL_OPTIONS = '-Dfile.encoding=UTF-8'

function Invoke-Gradle([string]$Arguments) {
  Write-Host ''
  Write-Host ("> gradlew.bat {0}" -f $Arguments)
  & (Join-Path $AppDir 'gradlew.bat') $Arguments
  if ($LASTEXITCODE -ne 0) { throw ("gradle failed ({0}): {1}" -f $LASTEXITCODE, $Arguments) }
}

Push-Location $AppDir
try {
  if ($Task) {
    Invoke-Gradle $Task
  } else {
    if (-not $SkipTests) {
      # JVM unit tests (no device needed). devDebug keeps them free of R8 so a
      # failure points at the code, not at shrinking.
      Invoke-Gradle ':app:testDevDebugUnitTest'
    }
    Invoke-Gradle ':app:assembleDevBench'
  }
} finally {
  Pop-Location
}

$apkDir = Join-Path $AppDir 'app\build\outputs\apk\dev\bench'
$apk = if (Test-Path $apkDir) {
  Get-ChildItem $apkDir -Filter '*.apk' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
} else { $null }

if ($apk) {
  $mb = '{0:N1} MB' -f ($apk.Length / 1MB)
  Write-Host ''
  Write-Host ("APK: {0} ({1})" -f $apk.FullName, $mb)
} elseif (-not $Task) {
  Write-Host 'Warning: no APK found under app\build\outputs\apk\dev\bench'
}

if ($Install) {
  if (-not $apk) { throw 'nothing to install - the APK was not produced' }
  Write-Host ''
  Write-Host 'Connected devices:'
  & $Adb devices
  Write-Host ''
  Write-Host ('> adb install -r "{0}"' -f $apk.FullName)
  & $Adb install -r $apk.FullName
  if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'adb install failed. Usual causes on a fresh phone:'
    Write-Host '  - USB debugging is off (Settings > Developer options)'
    Write-Host '  - the phone never accepted this computer RSA prompt (unlock it and retry)'
    Write-Host '  - adb devices shows "unauthorized" or an empty list'
    Write-Host 'Wireless debugging: adb pair <ip:port>, then adb connect <ip:port>'
    throw 'adb install failed'
  }
  Write-Host 'Installed.'
}

Write-Host ''
Write-Host 'The phone reaches the backend over the shop LAN. The API already binds'
Write-Host '0.0.0.0:3000; the app dev base URL is a BuildConfig default and stays'
Write-Host 'editable at runtime on the Settings screen.'
