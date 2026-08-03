use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
}

// ---------------------------------------------------------------------------
// ویندوز — چاپ خام (RAW) از طریق winspool
// ---------------------------------------------------------------------------
// فیش‌پرینتر حرارتی بایت‌های ESC/POS را مستقیم می‌خواهد. اگر از مسیر معمولی
// چاپ گرافیکی ویندوز برود، درایور آن را به تصویر تبدیل می‌کند و دستورهای
// ESC/POS (برش کاغذ، کشوی پول، متن فشرده) از بین می‌روند. بنابراین باید با
// datatype = "RAW" به spooler داده شود.

#[cfg(windows)]
mod imp {
    use super::PrinterInfo;
    use std::ptr;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, GetDefaultPrinterW,
        OpenPrinterW, StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W,
        PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_2W,
    };

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn default_printer() -> Option<String> {
        unsafe {
            let mut len: u32 = 0;
            // اولین فراخوانی فقط طول لازم را می‌دهد.
            let _ = GetDefaultPrinterW(None, &mut len);
            if len == 0 {
                return None;
            }

            let mut buf = vec![0u16; len as usize];
            GetDefaultPrinterW(
                Some(windows::core::PWSTR(buf.as_mut_ptr())),
                &mut len,
            )
            .ok()?;

            let s = String::from_utf16_lossy(&buf);
            Some(s.trim_end_matches('\0').to_string())
        }
    }

    pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
        unsafe {
            let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
            let mut needed: u32 = 0;
            let mut returned: u32 = 0;

            // فراخوانی اول: اندازه‌ی بافر لازم.
            let _ = EnumPrintersW(flags, PCWSTR::null(), 2, None, &mut needed, &mut returned);

            if needed == 0 {
                return Ok(vec![]);
            }

            let mut buffer = vec![0u8; needed as usize];

            EnumPrintersW(
                flags,
                PCWSTR::null(),
                2,
                Some(buffer.as_mut_slice()),
                &mut needed,
                &mut returned,
            )
            .map_err(|e| format!("خواندن فهرست پرینترها ناموفق بود: {e}"))?;

            let def = default_printer();
            let infos = buffer.as_ptr() as *const PRINTER_INFO_2W;
            let mut out = Vec::with_capacity(returned as usize);

            for i in 0..returned as isize {
                let info = &*infos.offset(i);
                if info.pPrinterName.is_null() {
                    continue;
                }
                let name = info.pPrinterName.to_string().unwrap_or_default();
                let is_default = def.as_deref() == Some(name.as_str());
                out.push(PrinterInfo { name, is_default });
            }

            Ok(out)
        }
    }

    pub fn print_raw(printer: Option<&str>, bytes: &[u8]) -> Result<(), String> {
        // اگر نام پرینتر داده نشده، پرینتر پیش‌فرض ویندوز.
        let name = match printer.filter(|p| !p.trim().is_empty()) {
            Some(p) => p.to_string(),
            None => default_printer()
                .ok_or_else(|| "هیچ پرینتر پیش‌فرضی در ویندوز تنظیم نشده است".to_string())?,
        };

        let wide_name = to_wide(&name);
        let mut doc_name = to_wide("فیش فروش");
        let mut datatype = to_wide("RAW");

        unsafe {
            let mut handle = HANDLE::default();

            OpenPrinterW(PCWSTR(wide_name.as_ptr()), &mut handle, None)
                .map_err(|e| format!("اتصال به پرینتر «{name}» ناموفق بود: {e}"))?;

            // از اینجا به بعد هر خروجی باید ClosePrinter را صدا بزند.
            let result = (|| -> Result<(), String> {
                let doc_info = DOC_INFO_1W {
                    pDocName: windows::core::PWSTR(doc_name.as_mut_ptr()),
                    pOutputFile: windows::core::PWSTR::null(),
                    pDatatype: windows::core::PWSTR(datatype.as_mut_ptr()),
                };

                let job = StartDocPrinterW(handle, 1, &doc_info);
                if job == 0 {
                    return Err("شروع کار چاپ ناموفق بود".to_string());
                }

                StartPagePrinter(handle)
                    .ok()
                    .ok_or_else(|| "شروع صفحه‌ی چاپ ناموفق بود".to_string())?;

                let mut written: u32 = 0;
                let ok = WritePrinter(
                    handle,
                    bytes.as_ptr() as *const _,
                    bytes.len() as u32,
                    &mut written,
                );

                let _ = EndPagePrinter(handle);
                let _ = EndDocPrinter(handle);

                if !ok.as_bool() {
                    return Err("ارسال داده به پرینتر ناموفق بود".to_string());
                }

                if written as usize != bytes.len() {
                    return Err(format!(
                        "چاپ ناقص انجام شد: {written} از {} بایت ارسال شد",
                        bytes.len()
                    ));
                }

                Ok(())
            })();

            let _ = ClosePrinter(handle);
            let _ = ptr::null::<u8>(); // جلوگیری از هشدار unused import در بعضی نسخه‌ها

            result
        }
    }
}

// ---------------------------------------------------------------------------
// غیرویندوز — فقط برای اینکه توسعه روی مک/لینوکس ممکن باشد.
// ---------------------------------------------------------------------------
// عمداً خطا برمی‌گرداند و **هرگز Ok نمی‌دهد**: اگر بی‌صدا موفق شود، برنامه
// می‌گوید «چاپ شد» و هیچ فیشی چاپ نمی‌شود — بدترین حالت ممکن.

#[cfg(not(windows))]
mod imp {
    use super::PrinterInfo;

    pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
        Err("چاپ فقط روی ویندوز پشتیبانی می‌شود".to_string())
    }

    pub fn print_raw(_printer: Option<&str>, _bytes: &[u8]) -> Result<(), String> {
        Err("چاپ فقط روی ویندوز پشتیبانی می‌شود".to_string())
    }
}

// ---------------------------------------------------------------------------
// دستورهای Tauri
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    imp::list_printers()
}

/// چاپ فیش. `bytes` رشته‌ی بایت ESC/POS است که سمت جاوااسکریپت ساخته می‌شود.
#[tauri::command]
pub fn print_receipt(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<(), String> {
    if bytes.is_empty() {
        return Err("داده‌ای برای چاپ ارسال نشده است".to_string());
    }

    let cfg = crate::config::load_config(&app);
    let printer = if cfg.printer_name.trim().is_empty() {
        None
    } else {
        Some(cfg.printer_name.clone())
    };

    imp::print_raw(printer.as_deref(), &bytes)
}

/// چاپ آزمایشی، برای دکمه‌ی «تست پرینتر» در تنظیمات.
#[tauri::command]
pub fn test_print(app: tauri::AppHandle) -> Result<(), String> {
    // ESC @ = بازنشانی، ESC a 1 = وسط‌چین، GS V 0 = برش کاغذ
    let mut bytes: Vec<u8> = vec![0x1B, 0x40, 0x1B, 0x61, 0x01];
    bytes.extend_from_slice("Warehouse OS\n".as_bytes());
    bytes.extend_from_slice("--- TEST PRINT OK ---\n\n\n".as_bytes());
    bytes.extend_from_slice(&[0x1D, 0x56, 0x00]);

    print_receipt(app, bytes)
}
