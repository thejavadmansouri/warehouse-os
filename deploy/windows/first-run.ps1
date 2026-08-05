<#
    اولین اجرا روی سرور مشتری. نصب‌کننده این را بعد از کپی فایل‌ها صدا می‌زند.

    فقط یک بار معنا دارد: اگر `config\.env` از قبل باشد، رد می‌شود و چیزی را
    بازنویسی نمی‌کند — همان چیزی که آپدیت را بی‌خطر می‌کند.

    چیدمان عمدی است: هرچه مالِ مشتری است (data، config، backups) بیرون از
    پوشه‌ی `app` می‌ماند، چون آپدیت فقط `app` را عوض می‌کند.
#>
param(
    [string]$Root = 'C:\WarehouseOS',
    [int]$ApiPort = 3000,
    [int]$WebPort = 3001
)

$ErrorActionPreference = 'Stop'
function Say($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "!!! $m" -ForegroundColor Yellow }

$pgBin   = Join-Path $Root 'pgsql\bin'
$dataDir = Join-Path $Root 'data\pg'
$config  = Join-Path $Root 'config'
$envFile = Join-Path $config '.env'

New-Item -ItemType Directory -Force -Path `
    (Join-Path $Root 'data'), $config, (Join-Path $Root 'backups'),
    (Join-Path $Root 'versions') | Out-Null

if (Test-Path $envFile) {
    Warn 'config\.env از قبل وجود دارد — این نصب قبلاً راه‌اندازی شده. رد می‌شوم.'
    exit 0
}

# ---------------------------------------------------------------- رمزها
Say 'ساخت رمزهای این نصب'
# هر نصب رمز و کلید مخصوص خودش را می‌گیرد. کلید مشترک یعنی هرکس آن را بداند
# می‌تواند برای هر سیستمی توکن مدیر جعل کند.
function New-Secret([int]$bytes) {
    $b = New-Object byte[] $bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    [Convert]::ToBase64String($b).TrimEnd('=').Replace('+','x').Replace('/','y')
}
$dbPassword = New-Secret 24
$jwtSecret  = New-Secret 48

# ---------------------------------------------------------------- دیتابیس
Say 'ساخت دیتابیس'
$pwFile = Join-Path $env:TEMP 'wos-pg-pw.txt'
Set-Content -Path $pwFile -Value $dbPassword -NoNewline -Encoding ascii
try {
    & (Join-Path $pgBin 'initdb.exe') `
        -D $dataDir -U postgres --pwfile=$pwFile `
        --encoding=UTF8 --locale=C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'initdb شکست خورد' }
} finally {
    Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
}

# فقط روی لوکال گوش بده. دیتابیس هیچ‌وقت نباید از شبکه در دسترس باشد —
# گوشی‌ها و سیستم فروشنده با API حرف می‌زنند، نه مستقیم با Postgres.
Add-Content (Join-Path $dataDir 'postgresql.conf') "`nlisten_addresses = 'localhost'"

Say 'راه‌اندازی موقت دیتابیس برای ساخت اسکیما'
& (Join-Path $pgBin 'pg_ctl.exe') -D $dataDir -l (Join-Path $Root 'data\pg-init.log') start
Start-Sleep -Seconds 5

$env:PGPASSWORD = $dbPassword
& (Join-Path $pgBin 'createdb.exe') -h localhost -U postgres warehouse_os
if ($LASTEXITCODE -ne 0) { throw 'createdb شکست خورد' }

# ---------------------------------------------------------------- تنظیمات
Say 'نوشتن config\.env'
$dbUrl = "postgresql://postgres:$dbPassword@localhost:5432/warehouse_os?schema=public"
@"
# تنظیمات این نصب. آپدیت این فایل را دست نمی‌زند.
# ⚠️ رمزها فقط اینجا هستند. اگر این فایل گم شود، دیتابیس باز نمی‌شود.

DATABASE_URL="$dbUrl"
JWT_SECRET="$jwtSecret"

# تأیید خودکار ورودی صوتی — خاموش، چون دقت مچر ۷۱٪ بود.
AUTO_CONFIRM_ENABLED=false
"@ | Set-Content -Path $envFile -Encoding utf8

# ---------------------------------------------------------------- اسکیما
Say 'اجرای مهاجرت‌ها'
$node = Join-Path $Root 'app\node\node.exe'
$api  = Join-Path $Root 'app\api'
$env:DATABASE_URL = $dbUrl
Push-Location $api
& $node (Join-Path $api 'node_modules\prisma\build\index.js') migrate deploy
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'prisma migrate deploy شکست خورد' }
Pop-Location

Say 'خاموش‌کردن دیتابیس موقت'
& (Join-Path $pgBin 'pg_ctl.exe') -D $dataDir stop | Out-Null

# ---------------------------------------------------------------- سرویس‌ها
& (Join-Path $Root 'scripts\services.ps1') -Root $Root -ApiPort $ApiPort -WebPort $WebPort

# ---------------------------------------------------------------- فایروال
Say 'باز کردن پورت‌ها روی شبکه‌ی محلی'
foreach ($p in @($ApiPort, $WebPort)) {
    netsh advfirewall firewall delete rule name="WarehouseOS $p" | Out-Null
    netsh advfirewall firewall add rule name="WarehouseOS $p" `
        dir=in action=allow protocol=TCP localport=$p profile=private,domain | Out-Null
}
# پورت دیتابیس عمداً باز نمی‌شود.

# ---------------------------------------------------------------- آدرس
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
       Sort-Object -Property InterfaceMetric |
       Select-Object -First 1).IPAddress

Write-Host ''
Write-Host '=======================================================' -ForegroundColor Green
Write-Host '  نصب کامل شد' -ForegroundColor Green
Write-Host '=======================================================' -ForegroundColor Green
Write-Host ''
Write-Host "  پنل فروش:   http://${ip}:$WebPort" -ForegroundColor White
Write-Host "  آدرس API:   http://${ip}:$ApiPort   (برای گوشی کارگرها)" -ForegroundColor White
Write-Host ''
Warn 'این آی‌پی را روی روتر رزرو کن، وگرنه فردا عوض می‌شود و همه قطع می‌شوند.'
Warn "رمزها در $envFile است. اگر گم شود، دیتابیس باز نمی‌شود."
Write-Host ''
Write-Host '  رمز ورود اولیه‌ی مدیر در لاگ سرویس API نوشته شده و فقط یک بار' -ForegroundColor White
Write-Host "  نمایش داده می‌شود:  $Root\data\api.log" -ForegroundColor White
Write-Host ''
