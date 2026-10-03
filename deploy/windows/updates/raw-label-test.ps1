# تست چاپ خام TSPL روی پرینتر لیبل (TSC TTP-244 Pro) — همان مکانیزمی که اپ
# فروشنده بعد از بیلد دوباره استفاده می‌کند (winspool با datatype=RAW).
# اگر لیبل ۵۰×۳۰ با بارکد بیرون آمد، پرینتر/کابل/صف سالم است.

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KardoRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFOA { public string pDocName; public string pOutputFile; public string pDatatype; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv")]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOA di);
  [DllImport("winspool.drv")]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv")]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv")]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv")]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
}
"@

$printer = if ($args.Count -gt 0) { $args[0] } else { "TSC TTP-244 Pro" }

# لیبل آزمایشی ۵۰×۳۰: بارکد CODE128 + عدد زیرش — دقیقاً همان شکل لیبل کالا.
$tspl = "SIZE 50 mm,30 mm`r`nGAP 2 mm,0 mm`r`nDIRECTION 1`r`nCLS`r`n" +
        'BARCODE 4,6,"128",70,2,0,2,2,2,"900200-TEST"' + "`r`n" +
        "PRINT 1,1`r`n"
# latin1 — دستورهای TSPL فقط ASCII‌اند.
$bytes = [System.Text.Encoding]::GetEncoding(28591).GetBytes($tspl)

$di = New-Object KardoRawPrinter+DOCINFOA
$di.pDocName = "Kardo Label Test"
$di.pDatatype = "RAW"

$h = [IntPtr]::Zero
if (-not [KardoRawPrinter]::OpenPrinter($printer, [ref]$h, [IntPtr]::Zero)) {
  Write-Output "FAIL: OpenPrinter $printer"
  exit 1
}
try {
  if ([KardoRawPrinter]::StartDocPrinter($h, 1, [ref]$di) -eq 0) {
    Write-Output "FAIL: StartDocPrinter"
    exit 1
  }
  [KardoRawPrinter]::StartPagePrinter($h) | Out-Null
  $written = 0
  $ok = [KardoRawPrinter]::WritePrinter($h, $bytes, $bytes.Length, [ref]$written)
  [KardoRawPrinter]::EndPagePrinter($h) | Out-Null
  [KardoRawPrinter]::EndDocPrinter($h) | Out-Null
  if ($ok -and $written -eq $bytes.Length) {
    Write-Output "OK: $written byte TSPL فرستاده شد به «$printer»"
  } else {
    Write-Output "FAIL: write ok=$ok written=$written / $($bytes.Length)"
    exit 1
  }
} finally {
  [KardoRawPrinter]::ClosePrinter($h) | Out-Null
}