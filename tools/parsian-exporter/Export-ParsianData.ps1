<#
.SYNOPSIS
    اسکریپت جامع استخراج اطلاعات از پایگاه داده پارسیان (Parsian SQL Server Exporter)
    طراحی شده برای سیستم کاردو (Warehouse OS)
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { $Host.UI.RawUI.WindowTitle = "استخراج داده‌های نرم‌افزار پارسیان - Kardo Exporter" } catch {}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   📦 استخراج‌کننده جامع داده‌های حسابداری پارسیان (Kardo Exporter)  " -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

# تنظیمات اتصال
$ServerInstances = @("localhost", "127.0.0.1", ".", "(local)", ".\SQLEXPRESS")
$ConnectedConn = $null
$ServerUsed = ""

Write-Host "🔍 در حال جستجوی سرویس SQL Server پارسیان..." -ForegroundColor Gray

foreach ($srv in $ServerInstances) {
    try {
        $testConnStr = "Server=${srv};Database=master;Integrated Security=True;Connect Timeout=3;"
        $conn = New-Object System.Data.SqlClient.SqlConnection($testConnStr)
        $conn.Open()
        $ConnectedConn = $conn
        $ServerUsed = $srv
        break
    } catch {
        # تلاش با نمونه بعدی
    }
}

if (-not $ConnectedConn) {
    Write-Host "⚠️ اتصال با Windows Authentication به صورت خودکار برقرار نشد." -ForegroundColor Yellow
    $ServerUsed = Read-Host "لطفاً نام سرور SQL Server را وارد کنید (پیش‌فرض: localhost)"
    if ([string]::IsNullOrWhiteSpace($ServerUsed)) { $ServerUsed = "localhost" }
    
    $useSa = Read-Host "آیا می‌خواهید با نام کاربری sa وارد شوید؟ (y/n)"
    if ($useSa -eq 'y' -or $useSa -eq 'Y') {
        $saPass = Read-Host "رمز عبور sa را وارد کنید"
        $connStr = "Server=${ServerUsed};Database=master;User Id=sa;Password=${saPass};Connect Timeout=5;"
    } else {
        $connStr = "Server=${ServerUsed};Database=master;Integrated Security=True;Connect Timeout=5;"
    }
    
    try {
        $ConnectedConn = New-Object System.Data.SqlClient.SqlConnection($connStr)
        $ConnectedConn.Open()
    } catch {
        Write-Host "❌ خطا در اتصال به SQL Server: $_" -ForegroundColor Red
        if ([Environment]::UserInteractive) { pause }
        exit 1
    }
}

Write-Host "✅ اتصال موفق به SQL Server برقرار شد: [$ServerUsed]" -ForegroundColor Green

# جستجوی دیتابیس‌های پارسیان
$cmd = $ConnectedConn.CreateCommand()
$cmd.CommandText = "SELECT name FROM sysdatabases WHERE name LIKE 'db_%' OR name LIKE '%parsian%';"
$reader = $cmd.ExecuteReader()
$parsianDbs = @()
while ($reader.Read()) {
    $parsianDbs += $reader["name"].ToString()
}
$reader.Close()

if ($parsianDbs.Count -eq 0) {
    Write-Host "⚠️ هیچ دیتابیسی با پیشوند db_ یا نام parsian پیدا نشد." -ForegroundColor Yellow
    $dbName = Read-Host "لطفاً نام دیتابیس پارسیان را دستی وارد کنید (مثلاً db_1404)"
    if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "db_1404" }
} elseif ($parsianDbs.Count -eq 1) {
    $dbName = $parsianDbs[0]
    Write-Host "🎯 دیتابیس پارسیان شناسایی شد: [$dbName]" -ForegroundColor Cyan
} else {
    Write-Host "دیتابیس‌های پارسیان پیدا شده:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $parsianDbs.Count; $i++) {
        Write-Host " [$i] $($parsianDbs[$i])" -ForegroundColor White
    }
    # انتخاب خودکار آخرین سال مالی (مثلاً db_1404)
    $dbName = $parsianDbs[0]
    foreach ($d in $parsianDbs) {
        if ($d -like "db_*") { $dbName = $d }
    }
    Write-Host "انتخاب خودکار دیتابیس سال مالی جاری: [$dbName]" -ForegroundColor Yellow
}

$ConnectedConn.ChangeDatabase($dbName)
Write-Host "📂 متصل به دیتابیس: $dbName" -ForegroundColor Green
Write-Host ""

# پوشه خروجی
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($scriptDir)) { $scriptDir = (Get-Location).Path }
$outputDir = Join-Path $scriptDir "Export_Parsian_${dbName}_${timestamp}"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Write-Host "📁 مسیر ذخیره فایل‌های خروجی: $outputDir" -ForegroundColor Magenta
Write-Host ""

function Export-QueryToFiles {
    param (
        [string]$Query,
        [string]$FileNamePrefix,
        [string]$Title
    )
    
    Write-Host "⏳ در حال استخراج $Title..." -NoNewline -ForegroundColor Gray
    
    $localCmd = $ConnectedConn.CreateCommand()
    $localCmd.CommandText = $Query
    $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($localCmd)
    $dataTable = New-Object System.Data.DataTable
    $null = $adapter.Fill($dataTable)
    
    $rowCount = $dataTable.Rows.Count
    
    $colNames = @($dataTable.Columns | ForEach-Object { $_.ColumnName })
    $rows = [System.Collections.Generic.List[PSObject]]::new()
    foreach ($dr in $dataTable.Rows) {
        $dict = [ordered]@{}
        foreach ($c in $colNames) {
            $v = $dr[$c]
            if ($v -is [System.DBNull]) {
                $dict[$c] = $null
            } else {
                $dict[$c] = $v
            }
        }
        $rows.Add([PSCustomObject]$dict)
    }
    
    # خروجی JSON
    $jsonPath = Join-Path $outputDir "$FileNamePrefix.json"
    $jsonContent = if ($rows.Count -gt 0) { $rows | ConvertTo-Json -Depth 3 } else { "[]" }
    [System.IO.File]::WriteAllText($jsonPath, $jsonContent, [System.Text.Encoding]::UTF8)
    
    # خروجی CSV با UTF-8 BOM جهت باز شدن تمیز در اکسل بدون به هم ریختگی فونت فارسی
    $csvPath = Join-Path $outputDir "$FileNamePrefix.csv"
    if ($rows.Count -gt 0) {
        $rows | Export-Csv -Path $csvPath -NoTypeInformation -Encoding utf8
    } else {
        "" | Out-File -FilePath $csvPath -Encoding utf8
    }
    
    Write-Host " ✅ انجام شد ($rowCount ردیف)" -ForegroundColor Green
    return $rowCount
}

$summary = [ordered]@{}

# ۱. کالاها به همراه آخرین قیمت خرید و فروش و موجودی
$goodsQuery = @"
SELECT 
    g.Code as ProductCode,
    LTRIM(RTRIM(g.CName)) as ProductName,
    LTRIM(RTRIM(COALESCE(g.FaniNum, ''))) as PartNumber,
    LTRIM(RTRIM(COALESCE(g.Barcode, ''))) as Barcode,
    LTRIM(RTRIM(COALESCE(g.PhysicalAddress, ''))) as ShelfLocation,
    COALESCE(g.UnitName_1, N'عدد') as Unit,
    COALESCE(g.Price_1, 0) as RegisteredSalePrice1,
    COALESCE(g.Price_2, 0) as RegisteredSalePrice2,
    -- آخرین قیمت خرید واقعی از روی فاکتورهای خرید (FactorKind = 2)
    (SELECT TOP 1 Price FROM tbl_Factor 
     WHERE GoodsCode = g.Code AND FactorKind = 2 AND Price > 0 
     ORDER BY Factor_Date DESC, ID DESC) as LastRealPurchasePrice,
    -- آخرین تاریخ خرید
    (SELECT TOP 1 Factor_Date FROM tbl_Factor 
     WHERE GoodsCode = g.Code AND FactorKind = 2 AND Price > 0 
     ORDER BY Factor_Date DESC, ID DESC) as LastPurchaseDate,
    -- آخرین قیمت فروش ثبت‌شده در فاکتورها (FactorKind = 1)
    (SELECT TOP 1 Price FROM tbl_Factor 
     WHERE GoodsCode = g.Code AND FactorKind = 1 AND Price > 0 
     ORDER BY Factor_Date DESC, ID DESC) as LastRealSalePrice,
    -- محاسبه موجودی فیزیکی انبار بر مبنای تمام ورودها منهای خروج‌ها
    COALESCE(SUM(CASE WHEN f.[I/O] = 1 THEN f.Tedad WHEN f.[I/O] = 2 THEN -f.Tedad ELSE 0 END), 0) as CalculatedCurrentStock
FROM tbl_Goods g
LEFT JOIN tbl_Factor f ON f.GoodsCode = g.Code
GROUP BY 
    g.Code, g.CName, g.FaniNum, g.Barcode, g.PhysicalAddress, g.UnitName_1, g.Price_1, g.Price_2
ORDER BY g.Code ASC;
"@
$summary["کالاها"] = Export-QueryToFiles -Query $goodsQuery -FileNamePrefix "01_products" -Title "کاتالوگ کالاها، قیمت‌ها و موجودی"

# ۲. اشخاص (مشتریان و فروشندگان) با شماره تلفن و آدرس
$contactsQuery = @"
SELECT 
    t.KolCode,
    t.MoeenCode,
    t.TafsiliCode,
    LTRIM(RTRIM(t.CName)) as FullName,
    LTRIM(RTRIM(COALESCE(t.Tel, ''))) as Phone,
    LTRIM(RTRIM(COALESCE(t.Mobile, ''))) as Mobile,
    LTRIM(RTRIM(COALESCE(t.Address, ''))) as Address,
    LTRIM(RTRIM(COALESCE(t.CodeNat, ''))) as NationalCode,
    LTRIM(RTRIM(COALESCE(t.CodePost, ''))) as PostalCode,
    LTRIM(RTRIM(COALESCE(t.CodeEco, ''))) as EconomicCode,
    COALESCE((SELECT SUM(Bed - Bes) FROM tbl_Document WHERE TafsiliCode = t.TafsiliCode), 0) as FinalBalance
FROM tbl_Telephone t
ORDER BY t.TafsiliCode ASC;
"@
$summary["اشخاص و مخاطبین"] = Export-QueryToFiles -Query $contactsQuery -FileNamePrefix "02_customers_and_suppliers" -Title "مشتریان، تأمین‌کنندگان و مخاطبین"

# ۳. فاکتورهای خرید (با ریز اقلام)
$purchaseQuery = @"
SELECT 
    f.Factor_Num as InvoiceNumber,
    f.Factor_Date as InvoiceDate,
    f.Taraf_T as SupplierCode,
    LTRIM(RTRIM(COALESCE(t.CName, ''))) as SupplierName,
    f.GoodsCode as ProductCode,
    LTRIM(RTRIM(COALESCE(g.CName, ''))) as ProductName,
    f.Tedad as Quantity,
    f.Price as UnitPrice,
    (f.Tedad * f.Price) as RowTotal,
    COALESCE(f.Discont, 0) as Discount,
    COALESCE(f.GoodsDiscont, 0) as LineDiscount,
    f.Sanad_Num as SanadNumber,
    LTRIM(RTRIM(COALESCE(f.FactorComment, ''))) as Comment
FROM tbl_Factor f
LEFT JOIN tbl_Goods g ON g.Code = f.GoodsCode
LEFT JOIN tbl_Telephone t ON t.TafsiliCode = f.Taraf_T
WHERE f.FactorKind = 2
ORDER BY f.Factor_Date DESC, f.Factor_Num DESC, f.ID ASC;
"@
$summary["فاکتورهای خرید"] = Export-QueryToFiles -Query $purchaseQuery -FileNamePrefix "03_purchase_invoices" -Title "فاکتورهای خرید و اقلام وارده"

# ۴. فاکتورهای فروش (با ریز اقلام)
$salesQuery = @"
SELECT 
    f.Factor_Num as InvoiceNumber,
    f.Factor_Date as InvoiceDate,
    f.Taraf_T as CustomerCode,
    LTRIM(RTRIM(COALESCE(t.CName, ''))) as CustomerName,
    f.GoodsCode as ProductCode,
    LTRIM(RTRIM(COALESCE(g.CName, ''))) as ProductName,
    f.Tedad as Quantity,
    f.Price as UnitPrice,
    (f.Tedad * f.Price) as RowTotal,
    COALESCE(f.Discont, 0) as Discount,
    COALESCE(f.GoodsDiscont, 0) as LineDiscount,
    f.Sanad_Num as SanadNumber,
    LTRIM(RTRIM(COALESCE(f.FactorComment, ''))) as Comment
FROM tbl_Factor f
LEFT JOIN tbl_Goods g ON g.Code = f.GoodsCode
LEFT JOIN tbl_Telephone t ON t.TafsiliCode = f.Taraf_T
WHERE f.FactorKind = 1
ORDER BY f.Factor_Date DESC, f.Factor_Num DESC, f.ID ASC;
"@
$summary["فاکتورهای فروش"] = Export-QueryToFiles -Query $salesQuery -FileNamePrefix "04_sale_invoices" -Title "فاکتورهای فروش و اقلام صادره"

# ۵. چک‌ها (دریافتی و پرداختی)
$chequesQuery = @"
SELECT 
    c.Chk_Num as ChequeNumber,
    LTRIM(RTRIM(COALESCE(c.Sayad, ''))) as SayadId,
    c.Money as Amount,
    c.ExpDate as DueDate,
    c.RecDate as ReceiveDate,
    LTRIM(RTRIM(COALESCE(c.Bank, ''))) as BankName,
    LTRIM(RTRIM(COALESCE(c.Acc_Num, ''))) as AccountNumber,
    c.Taraf_T as CustomerOrSupplierCode,
    LTRIM(RTRIM(COALESCE(t.CName, ''))) as PersonName,
    CASE c.Vos_Pas 
        WHEN 0 THEN N'نزد صندوق / در جریان وصول'
        WHEN 1 THEN N'وصول شده'
        WHEN 2 THEN N'برگشت خورده'
        WHEN 3 THEN N'خرج شده / واگذار شده'
        ELSE N'نامشخص'
    END as StatusText,
    c.Chk_Kind as ChequeKind,
    LTRIM(RTRIM(COALESCE(c.Comment, ''))) as Note
FROM tbl_Check c
LEFT JOIN tbl_Telephone t ON t.TafsiliCode = c.Taraf_T
ORDER BY c.ExpDate ASC;
"@
$summary["چک‌ها"] = Export-QueryToFiles -Query $chequesQuery -FileNamePrefix "05_cheques" -Title "چک‌های دریافتی و پرداختی"

# ۶. کدینگ و سرفصل حساب‌ها
$coaQuery = @"
SELECT 
    k.Code as KolCode,
    k.CName as KolName,
    m.Code as MoeenCode,
    m.CName as MoeenName,
    t.Code as TafsiliCode,
    t.CName as TafsiliName
FROM tbl_Kol k
LEFT JOIN tbl_Moeen m ON m.KolCode = k.Code
LEFT JOIN tbl_Tafsili t ON t.KolCode = k.Code AND t.MoeenCode = m.Code
ORDER BY k.Code, m.Code, t.Code;
"@
$summary["کدینگ حساب‌ها"] = Export-QueryToFiles -Query $coaQuery -FileNamePrefix "06_chart_of_accounts" -Title "درختواره و سرفصل حساب‌ها"

# گزارش خلاصه
$reportFile = Join-Path $outputDir "00_REPORT_SUMMARY.txt"
$reportContent = @"
======================================================
  گزارش استخراج داده‌های پارسیان برای کاردو
  تاریخ استخراج: $(Get-Date -Format "yyyy/MM/dd HH:mm:ss")
  نام دیتابیس: $dbName
  سرور: $ServerUsed
======================================================

آمار رکوردهای استخراج‌شده:
------------------------------------------------------
$($summary.GetEnumerator() | ForEach-Object { " • $($_.Key): $($_.Value) رکورد" } | Out-String)
------------------------------------------------------
کلیه فایل‌ها با دو فرمت JSON و CSV در همین پوشه ذخیره شده‌اند.
فایل‌های CSV دارای استاندارد UTF-8 BOM بوده و در اکسل بدون به‌هم‌ریختگی باز می‌شوند.
"@

$reportContent | Out-File -FilePath $reportFile -Encoding utf8

$ConnectedConn.Close()

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host " 🎉 استخراج کامل با موفقیت به پایان رسید!" -ForegroundColor Green
Write-Host " 📂 پوشه خروجی:" -ForegroundColor Yellow
Write-Host "    $outputDir" -ForegroundColor White
Write-Host "=================================================================" -ForegroundColor Green
