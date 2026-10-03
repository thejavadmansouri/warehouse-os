$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host 'Starting Warehouse OS development environment...' -ForegroundColor Cyan
Write-Host 'API: http://localhost:3000' -ForegroundColor Gray
Write-Host 'Web: http://localhost:3001' -ForegroundColor Gray

$api = Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-Command',"Set-Location '$Root'; npm.cmd run dev:api" -PassThru
$web = Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-Command',"Set-Location '$Root'; npm.cmd run dev:web" -PassThru

Start-Sleep -Seconds 2
$desktop = Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-Command',"Set-Location '$Root'; npm.cmd exec --workspace=@warehouse-os/desktop -- tauri dev" -PassThru

Write-Host ''
Write-Host 'Development processes started.' -ForegroundColor Green
Write-Host ('API PID: {0}' -f $api.Id)
Write-Host ('Web PID: {0}' -f $web.Id)
Write-Host ('Desktop PID: {0}' -f $desktop.Id)
Write-Host 'Save a source file to see frontend changes immediately.' -ForegroundColor Yellow
