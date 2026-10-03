# رفع مشکل چاپ در اپ فروشنده — جایگزینی خودکار فایل برنامه
# این اسکریپت را از همین پوشه (کنار warehouse-seller.exe جدید) اجرا کنید.

$ErrorActionPreference = 'Stop'

$here       = Split-Path -Parent $MyInvocation.MyCommand.Path
$newExe     = Join-Path $here 'warehouse-seller.exe'
$installDir = 'C:\WarehouseOS\app\desktop'
$targetExe  = Join-Path $installDir 'warehouse-seller.exe'

if (-not (Test-Path $newExe)) {
    Write-Host 'ERROR: warehouse-seller.exe جدید در این پوشه پیدا نشد.' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $targetExe)) {
    Write-Host "ERROR: پوشه نصب پیدا نشد: $installDir" -ForegroundColor Red
    Write-Host 'اگر برنامه در مسیر دیگری نصب شده، مسیر زیر را در این اسکریپت اصلاح کنید:'
    Write-Host '  $installDir = ''<مسیر نصب>\app\desktop'''
    exit 1
}

# ۱) بستن اپ فروشنده اگر باز است
$proc = Get-Process -Name 'warehouse-seller' -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host 'در حال بستن اپ فروشنده...' -ForegroundColor Yellow
    $proc | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# ۲) پشتیبان‌گیری از فایل قدیمی (فقط برای احتیاط)
$backup = "$targetExe.bak"
Copy-Item -LiteralPath $targetExe -Destination $backup -Force
Write-Host "پشتیبان فایل قبلی: $backup" -ForegroundColor Cyan

# ۳) جایگزینی فایل
Copy-Item -LiteralPath $newExe -Destination $targetExe -Force
Write-Host 'فایل جدید جایگزین شد.' -ForegroundColor Green

# ۴) اجرای دوباره اپ فروشنده
Start-Process -FilePath $targetExe
Write-Host 'اپ فروشنده دوباره باز شد. حالا چاپ را تست کنید.' -ForegroundColor Green