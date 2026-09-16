# Warehouse OS - check that the files on this flash are not corrupted.
# ASCII ONLY. Launcher: RUN-VERIFY-FILES.bat
#
# Reads MANIFEST.txt (lines of "<sha256>  <relative path>") and hashes every
# file. USB sticks corrupt large files more often than anyone expects; a Setup
# that fails to launch mid-install wastes a whole day.

$ErrorActionPreference = 'Continue'
$manifest = Join-Path $PSScriptRoot '..\MANIFEST.txt'
if (-not (Test-Path $manifest)) {
    Write-Host "MANIFEST.txt not found at $manifest" -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '=== Verifying flash files (SHA256) ===' -ForegroundColor Cyan
$fail = 0
foreach ($line in (Get-Content $manifest)) {
    if (-not $line.Trim() -or $line -match '^#') { continue }
    $hash, $rel = $line.Trim() -split '\s+', 2
    $path = Join-Path (Split-Path -Parent $PSScriptRoot) $rel
    if (-not (Test-Path $path)) {
        Write-Host ("  [!!]  MISSING   {0}" -f $rel) -ForegroundColor Red
        $fail++
        continue
    }
    $actual = (Get-FileHash -Path $path -Algorithm SHA256).Hash.ToLower()
    if ($actual -eq $hash.ToLower()) {
        Write-Host ("  [OK]  {0}" -f $rel) -ForegroundColor Green
    } else {
        Write-Host ("  [!!]  CORRUPT   {0} -- copy this file from the laptop again" -f $rel) -ForegroundColor Red
        $fail++
    }
}
Write-Host ''
if ($fail -eq 0) {
    Write-Host 'All files verified OK.' -ForegroundColor Green
} else {
    Write-Host ("{0} file(s) failed -- re-copy them from the laptop, then run this check again." -f $fail) -ForegroundColor Red
}
