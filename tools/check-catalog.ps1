$ErrorActionPreference = 'Stop'
$db = Join-Path $env:TEMP 'operator-catalog.db'
$sqlPath = Join-Path $env:TEMP 'catalog-q.sql'
@"
SELECT COUNT(*) FROM catalog_product WHERE deleted=0;
SELECT name, sku, replace(searchTokens, char(1), ' | ') FROM catalog_product WHERE deleted=0 AND (name LIKE '%آرم%' OR name LIKE '%ارم%' OR name LIKE '%آراد%' OR name LIKE '%اراد%' OR searchTokens LIKE '%آرم%' OR searchTokens LIKE '%ارم%') LIMIT 20;
"@ | Set-Content -Path $sqlPath -Encoding UTF8

$dir = Join-Path $env:LOCALAPPDATA 'AndroidBuild\sqlite'
$sqlite = Join-Path $dir 'sqlite3.exe'
if (-not (Test-Path $sqlite)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $zip = Join-Path $dir 'sqlite.zip'
  Invoke-WebRequest -Uri 'https://www.sqlite.org/2024/sqlite-tools-win-x64-3460100.zip' -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $dir -Force
  $found = Get-ChildItem $dir -Recurse -Filter sqlite3.exe | Select-Object -First 1
  if (-not $found) { throw 'sqlite3.exe not found after download' }
  Copy-Item $found.FullName $sqlite -Force
}

Write-Host "Using $sqlite"
Write-Host "DB $db size=$((Get-Item $db).Length)"
& $sqlite $db ".read $sqlPath"
