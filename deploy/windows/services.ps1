<#
    ثبت سه سرویس ویندوز.

    جدا از first-run نگه داشته شده تا آپدیت هم بتواند صدایش بزند: بعد از
    جایگزینی پوشه‌ی `app`، سرویس‌ها باید دوباره تعریف شوند بدون اینکه دیتابیس
    یا تنظیمات دست بخورد.

    ترتیب وابستگی مهم است — API قبل از بالا آمدن دیتابیس شروع نشود، وگرنه
    هنگام روشن شدن ویندوز با خطای اتصال می‌میرد.
#>
param(
    [string]$Root = 'C:\WarehouseOS',
    [int]$ApiPort = 3000,
    [int]$WebPort = 3001
)

$ErrorActionPreference = 'Stop'
function Say($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }

$nssm    = Join-Path $Root 'nssm.exe'
$node    = Join-Path $Root 'app\node\node.exe'
$envFile = Join-Path $Root 'config\.env'
$logDir  = Join-Path $Root 'data'

$DB  = 'WarehouseOS-DB'
$API = 'WarehouseOS-API'
$WEB = 'WarehouseOS-Web'

function Remove-Svc($name) {
    & $nssm stop $name  2>$null | Out-Null
    & $nssm remove $name confirm 2>$null | Out-Null
}

Say 'حذف سرویس‌های قبلی (اگر بود)'
Remove-Svc $WEB; Remove-Svc $API; Remove-Svc $DB

Say 'ثبت سرویس دیتابیس'
& $nssm install $DB (Join-Path $Root 'pgsql\bin\postgres.exe') `
    "-D" (Join-Path $Root 'data\pg') | Out-Null
& $nssm set $DB DisplayName 'Warehouse OS - Database' | Out-Null
& $nssm set $DB Start SERVICE_AUTO_START | Out-Null
& $nssm set $DB AppStdout (Join-Path $logDir 'db.log') | Out-Null
& $nssm set $DB AppStderr (Join-Path $logDir 'db.log') | Out-Null
# چرخش لاگ، وگرنه بعد از چند ماه دیسک پر می‌شود.
& $nssm set $DB AppRotateFiles 1 | Out-Null
& $nssm set $DB AppRotateBytes 10485760 | Out-Null

Say 'ثبت سرویس API'
& $nssm install $API $node (Join-Path $Root 'app\api\dist\src\main.js') | Out-Null
& $nssm set $API DisplayName 'Warehouse OS - API' | Out-Null
& $nssm set $API AppDirectory (Join-Path $Root 'app\api') | Out-Null
# تنظیمات از پوشه‌ی config خوانده می‌شود، نه از کنار کد — تا آپدیت پاکش نکند.
& $nssm set $API AppEnvironmentExtra "WOS_ENV_FILE=$envFile" "PORT=$ApiPort" | Out-Null
& $nssm set $API Start SERVICE_AUTO_START | Out-Null
& $nssm set $API DependOnService $DB | Out-Null
& $nssm set $API AppStdout (Join-Path $logDir 'api.log') | Out-Null
& $nssm set $API AppStderr (Join-Path $logDir 'api.log') | Out-Null
& $nssm set $API AppRotateFiles 1 | Out-Null
& $nssm set $API AppRotateBytes 10485760 | Out-Null
# دیتابیس چند ثانیه بعد از سرویس آماده می‌شود؛ به API فرصت تلاش دوباره بده.
& $nssm set $API AppThrottle 5000 | Out-Null
& $nssm set $API AppRestartDelay 5000 | Out-Null

Say 'ثبت سرویس پنل وب'
& $nssm install $WEB $node (Join-Path $Root 'app\web\server.js') | Out-Null
& $nssm set $WEB DisplayName 'Warehouse OS - Panel' | Out-Null
& $nssm set $WEB AppDirectory (Join-Path $Root 'app\web') | Out-Null
# HOSTNAME=0.0.0.0 لازم است وگرنه Next فقط روی لوکال گوش می‌دهد و سیستم
# فروشنده و گوشی‌ها نمی‌توانند وصل شوند.
& $nssm set $WEB AppEnvironmentExtra "PORT=$WebPort" "HOSTNAME=0.0.0.0" | Out-Null
& $nssm set $WEB Start SERVICE_AUTO_START | Out-Null
& $nssm set $WEB DependOnService $API | Out-Null
& $nssm set $WEB AppStdout (Join-Path $logDir 'web.log') | Out-Null
& $nssm set $WEB AppStderr (Join-Path $logDir 'web.log') | Out-Null
& $nssm set $WEB AppRotateFiles 1 | Out-Null
& $nssm set $WEB AppRotateBytes 10485760 | Out-Null

Say 'روشن‌کردن سرویس‌ها'
& $nssm start $DB  | Out-Null
Start-Sleep -Seconds 5
& $nssm start $API | Out-Null
Start-Sleep -Seconds 5
& $nssm start $WEB | Out-Null
Start-Sleep -Seconds 3

foreach ($s in @($DB, $API, $WEB)) {
    $state = (Get-Service $s -ErrorAction SilentlyContinue).Status
    $ok = if ($state -eq 'Running') { 'OK' } else { 'خطا' }
    Write-Host ("  {0,-20} {1,-10} {2}" -f $s, $state, $ok)
}
