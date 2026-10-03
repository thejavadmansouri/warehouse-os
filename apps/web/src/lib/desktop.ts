/**
 * پلِ صفحه‌ی وب ↔ قابِ دسکتاپ (Tauri).
 *
 * همه‌ی تماس‌ها با `window.__TAURI__.core.invoke` است — همان روشی که
 * `backup-close-guard.tsx` هم دارد. یک نکته‌ی مهم: Rust فیلدها را با
 * snake_case می‌فرستد (`printer_name`)، پس هر دو شکل را با احتیاط می‌خوانیم.
 *
 * در مرورگر معمولی هیچ‌کدام از این‌ها وجود ندارد؛ `isDesktop()` false است و
 * صفحات باید بدون قاب هم کامل کار کنند — چاپ A4/A5 با window.print() مستقل از
 * این پل است.
 */

type TauriGlobal = {
  core?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
};

function tauri(): TauriGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
}

/** آیا صفحه داخل قابِ ویندوزی اجرا می‌شود؟ (SSR همیشه false) */
export function isDesktop(): boolean {
  return tauri() !== null;
}

/** invoke با پیامِ خطای فارسی وقتی قاب نیست. */
export async function desktopInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const t = tauri();
  if (!t?.core) throw new Error("قاب دسکتاپ در دسترس نیست");
  return (await t.core.invoke(cmd, args)) as T;
}

export interface DesktopPrinter {
  name: string;
  isDefault: boolean;
}

/** فهرست پرینترهای ویندوز (winspool از سمت Rust). */
export async function listDesktopPrinters(): Promise<DesktopPrinter[]> {
  const rows = await desktopInvoke<
    Array<{ name: string; is_default?: boolean; isDefault?: boolean }>
  >("list_printers");
  return rows.map((r) => ({
    name: r.name,
    isDefault: r.is_default ?? r.isDefault ?? false,
  }));
}

export interface DesktopConfig {
  serverUrl: string;
  printerName: string;
  labelPrinterName: string;
}

/** تنظیمات ذخیره‌شده‌ی قاب (آدرس سرور + پرینترهای انتخابی). */
export async function getDesktopConfig(): Promise<DesktopConfig> {
  const c = await desktopInvoke<{
    server_url?: string;
    printer_name?: string;
    label_printer_name?: string;
  }>("get_config");
  return {
    serverUrl: c.server_url ?? "",
    printerName: c.printer_name ?? "",
    labelPrinterName: c.label_printer_name ?? "",
  };
}

/** نام پرینتر فیش را در تنظیمات قاب ذخیره می‌کند. خالی = پیش‌فرض ویندوز. */
export function saveDesktopPrinter(name: string): Promise<void> {
  return desktopInvoke<void>("set_printer_name", { name });
}

/** نام پرینتر لیبل (حرارتی TSPL) را در تنظیمات قاب ذخیره می‌کند. خالی = پیش‌فرض. */
export function saveDesktopLabelPrinter(name: string): Promise<void> {
  return desktopInvoke<void>("set_label_printer_name", { name });
}

/** ارسال بایت‌های ESC/POS به spooler با datatype=RAW. */
export function printReceiptBytes(bytes: Uint8Array): Promise<void> {
  return desktopInvoke<void>("print_receipt", { bytes: Array.from(bytes) });
}

/** ارسال بایت‌های خام TSPL (لیبل حرارتی) به spooler با datatype=RAW. */
export function printTspLabel(bytes: Uint8Array): Promise<void> {
  return desktopInvoke<void>("print_tsp_label", { bytes: Array.from(bytes) });
}

/** چاپ آزمایشی — همان دستورِ دکمه‌ی «تست پرینتر». */
export function desktopTestPrint(): Promise<void> {
  return desktopInvoke<void>("test_print");
}
