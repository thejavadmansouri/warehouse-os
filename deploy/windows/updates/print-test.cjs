/*
 * Send the first N roll segments of kardo-labels.prn to the TSC via winspool RAW.
 * Usage: node print-test.cjs [segments=2]
 */
const fs = require("fs");

const SEGMENTS = Number(process.argv[2] || 2);
const src = fs.readFileSync("C:\\Users\\K\\Desktop\\kardo-labels.prn");
const text = src.toString("latin1");

// Each segment ends with PRINT 1,1\r\n — split into complete segments.
const segs = text.split(/PRINT 1,1\r\n/).filter((s) => s.trim().length > 0).map((s) => s + "PRINT 1,1\r\n");
console.log("total segments in file:", segs.length);

const payload = segs.slice(0, SEGMENTS).join("");
const bytes = Buffer.from(payload, "latin1");
console.log(`sending ${SEGMENTS} segment(s), ${bytes.length} bytes...`);

const ps = `
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
$printer = "TSC TTP-244 Pro"
$bytes = [System.IO.File]::ReadAllBytes("$env:TEMP\\kardo-test-seg.bin")
$di = New-Object KardoRawPrinter+DOCINFOA
$di.pDocName = "Kardo Label Test 2up"
$di.pDatatype = "RAW"
$h = [IntPtr]::Zero
if (-not [KardoRawPrinter]::OpenPrinter($printer, [ref]$h, [IntPtr]::Zero)) { Write-Output "FAIL: OpenPrinter"; exit 1 }
try {
  if ([KardoRawPrinter]::StartDocPrinter($h, 1, [ref]$di) -eq 0) { Write-Output "FAIL: StartDocPrinter"; exit 1 }
  [KardoRawPrinter]::StartPagePrinter($h) | Out-Null
  $written = 0
  $ok = [KardoRawPrinter]::WritePrinter($h, $bytes, $bytes.Length, [ref]$written)
  [KardoRawPrinter]::EndPagePrinter($h) | Out-Null
  [KardoRawPrinter]::EndDocPrinter($h) | Out-Null
  if ($ok -and $written -eq $bytes.Length) { Write-Output "OK: $written bytes sent to '$printer'" }
  else { Write-Output "FAIL: ok=$ok written=$written / $($bytes.Length)"; exit 1 }
} finally { [KardoRawPrinter]::ClosePrinter($h) | Out-Null }
`;

fs.writeFileSync(process.env.TEMP + "\\kardo-test-seg.bin", bytes);
fs.writeFileSync(process.env.TEMP + "\\kardo-send.ps1", ps);
const { execSync } = require("child_process");
const out = execSync(
  `powershell -NoProfile -ExecutionPolicy Bypass -File "${process.env.TEMP}\\kardo-send.ps1"`,
  { encoding: "utf8" },
);
console.log(out.trim());
