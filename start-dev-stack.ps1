# Warehouse OS — بالا آوردن سرور توسعه (API) + پنل ادمین (Web)
# همان استکی که اپ اندرویدِ در حال توسعه به آن وصل می‌شود.

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Get-LanIPv4 {
    $addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.InterfaceAlias -notmatch 'happ|tun|vpn|vEthernet|WSL|Loopback'
        } |
        Sort-Object -Property PrefixLength
    if ($addrs) { return $addrs[0].IPAddress }
    return '127.0.0.1'
}

function Test-PortOpen([int]$Port) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $iar = $c.BeginConnect('127.0.0.1', $Port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(400)
        if (-not $ok) { $c.Close(); return $false }
        $c.EndConnect($iar)
        $c.Close()
        return $true
    } catch {
        return $false
    }
}

$lan = Get-LanIPv4
$host.UI.RawUI.WindowTitle = 'Warehouse OS — Dev Stack'

Write-Host ''
Write-Host '  Warehouse OS — استک توسعه' -ForegroundColor Cyan
Write-Host '  --------------------------------' -ForegroundColor DarkGray
Write-Host ("  API  (گوشی):  http://{0}:3000" -f $lan) -ForegroundColor Green
Write-Host '  API  (روی PC): http://localhost:3000' -ForegroundColor Gray
Write-Host '  پنل ادمین:      http://localhost:3001' -ForegroundColor Green
Write-Host ''

$pg = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' }
if (-not $pg) {
    Write-Host '  هشدار: سرویس PostgreSQL در حال اجرا نیست.' -ForegroundColor Yellow
    Write-Host '  از Services.msc سرویس postgres را Start کنید.' -ForegroundColor Yellow
    Write-Host ''
}

$apiAlready = Test-PortOpen 3000
$webAlready = Test-PortOpen 3001

if ($apiAlready) {
    Write-Host '  API از قبل روی پورت 3000 بالا است — پنجره جدید باز نشد.' -ForegroundColor Yellow
} else {
    $api = Start-Process powershell.exe -PassThru -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command',
        "Set-Location '$Root'; `$Host.UI.RawUI.WindowTitle='Warehouse OS — API :3000'; npm.cmd run dev:api"
    )
    Write-Host ("  API شروع شد (PID {0})" -f $api.Id) -ForegroundColor Green
}

if ($webAlready) {
    Write-Host '  Web از قبل روی پورت 3001 بالا است — پنجره جدید باز نشد.' -ForegroundColor Yellow
} else {
    $web = Start-Process powershell.exe -PassThru -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command',
        "Set-Location '$Root'; `$Host.UI.RawUI.WindowTitle='Warehouse OS — Web :3001'; npm.cmd run dev:web"
    )
    Write-Host ("  Web شروع شد (PID {0})" -f $web.Id) -ForegroundColor Green
}

Write-Host ''
Write-Host '  منتظر آماده‌شدن سرویس‌ها…' -ForegroundColor Gray

$deadline = (Get-Date).AddMinutes(3)
$apiUp = $apiAlready
$webUp = $webAlready
while ((Get-Date) -lt $deadline -and (-not $apiUp -or -not $webUp)) {
    if (-not $apiUp) { $apiUp = Test-PortOpen 3000 }
    if (-not $webUp) { $webUp = Test-PortOpen 3001 }
    if ($apiUp -and $webUp) { break }
    Start-Sleep -Seconds 2
}

if ($apiUp) {
    Write-Host '  OK — API آماده است' -ForegroundColor Green
} else {
    Write-Host '  FAIL — API هنوز آماده نشد؛ پنجره API را چک کنید' -ForegroundColor Red
}
if ($webUp) {
    Write-Host '  OK — پنل ادمین آماده است' -ForegroundColor Green
    Start-Process 'http://localhost:3001'
} else {
    Write-Host '  FAIL — Web هنوز آماده نشد؛ پنجره Web را چک کنید' -ForegroundColor Red
}

Write-Host ''
Write-Host '  آدرس گوشی برای اپ در حال توسعه (همان وای‌فای):' -ForegroundColor Cyan
Write-Host ("    http://{0}:3000" -f $lan) -ForegroundColor White
Write-Host ''
Write-Host '  بستن این پنجره API و Web را متوقف نمی‌کند.' -ForegroundColor DarkGray
Write-Host '  Enter بزنید تا این پنجره بسته شود.'
[void][System.Console]::ReadLine()