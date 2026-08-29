/**
 * فرمان‌های سند — یک جدول، برای همه‌ی سندها.
 *
 * قاعده: یک کلید، یک معنی، در هر سندی. فاکتور فروش، پیش‌فاکتور، برگشتی و
 * اصلاحیه همه از همین جدول می‌خوانند؛ هیچ صفحه‌ای کلید خودش را تعریف نمی‌کند.
 *
 * دستِ فروشنده کلید را با «جای دکمه» یاد می‌گیرد نه با اسمش. برای همین
 * فرمانی که به یک سند نمی‌خورد **حذف نمی‌شود، خاموش می‌شود** — جایش را ترک
 * نمی‌کند. (اجرایش در document-shell.tsx: هر فرمانِ بدونِ handler خاموش است.)
 */

import {
  Ban, Check, ChevronLeft, ChevronRight, CreditCard, Eye, FileClock, FilePlus,
  FileSpreadsheet, MessageSquare, Minus, Package, Percent, Plus, Printer,
  ClipboardList, FileSearch, Keyboard, PackagePlus, PackageX, PenLine, ReceiptText,
  Search, Send, User, Wallet, type LucideIcon,
} from "lucide-react";

export type CommandId =
  | "new" | "prev" | "next" | "find" | "quotes"
  | "addRow" | "delRow" | "discount" | "lineNote"
  | "party" | "ledger" | "kardex"
  | "print" | "preview" | "excel" | "sms"
  | "dispatch" | "workTasks" | "addProduct" | "shortage"
  | "quote" | "pay" | "commit" | "void"
  | "help";

export type CommandGroup =
  | "سند" | "ردیف" | "طرف حساب" | "خروجی" | "انبار" | "ثبت" | "راهنما";

export interface CommandSpec {
  id: CommandId;
  group: CommandGroup;
  /**
   * نوار فقط آیکن است.
   *
   * با برچسبِ متنی، نوزده فرمان دو برابرِ عرض می‌گرفتند و آخری‌ها بیرون از
   * قابِ دید می‌ماندند — یعنی همان چیزی که «جای ثابتِ دکمه» را می‌کشد.
   * برچسب و کلید در tooltip و در راهنمای F1 هستند.
   */
  icon: LucideIcon;
  /** برچسبِ پیش‌فرض. هر صفحه می‌تواند بازنویسی‌اش کند (مثلاً «ثبت اصلاح»). */
  label: string;
  /** آنچه روی دکمه چاپ می‌شود. */
  keyLabel: string;
  match: (e: KeyboardEvent) => boolean;
  /** دکمه‌ی اصلیِ سند — تنها دکمه‌ی توپُر. */
  primary?: boolean;
  destructive?: boolean;
}

/** Ctrl یا Cmd — مک هم پشتِ همین برنامه می‌نشیند. */
const mod = (e: KeyboardEvent) => e.ctrlKey || e.metaKey;

/**
 * تطبیقِ حرف، **مستقل از چیدمانِ صفحه‌کلید**.
 *
 * ### باگی که این تابع بست
 *
 * `KeyboardEvent.key` حرفی را می‌دهد که چیدمانِ فعلی تولید می‌کند، نه کلیدی که
 * فشرده شده. روی ویندوزِ فروشگاه که چیدمان **فارسی** فعال است، Alt+N مقدارِ
 * `e.key === "ن"` می‌دهد نه `"n"` — پس شرطِ قبلی یعنی
 * `e.key.toLowerCase() === "n"` هیچ‌وقت درست نمی‌شد و **همه‌ی میانبرهای حرفی خاموش بودند**. فروشنده مجبور بود برای
 * باز کردنِ تب و هر فرمانِ دیگری موس بردارد، در حالی که کد کاملاً درست به‌نظر
 * می‌رسید و روی چیدمانِ انگلیسیِ برنامه‌نویس هم کار می‌کرد.
 *
 * `e.code` نامِ **فیزیکیِ** کلید است (`"KeyN"`) و به چیدمان کاری ندارد؛ همان
 * کلید روی هر زبانی همان `code` را می‌دهد.
 *
 * `e.key` به‌عنوان پشتیبان می‌ماند برای صفحه‌کلیدهای مجازی/غیرعادی که ممکن است
 * `code` نفرستند.
 */
const letter = (e: KeyboardEvent, ch: string) =>
  e.code === `Key${ch.toUpperCase()}` || e.key.toLowerCase() === ch;

/**
 * انتخابِ کلیدها روی کروم/ویندوز آزمایش شده است.
 *
 * چیزهایی که عمداً استفاده **نشده‌اند**، چون مرورگر برشان می‌دارد و
 * preventDefault هم جلویشان را نمی‌گیرد: Ctrl+N، Ctrl+T، Ctrl+W،
 * Ctrl+Shift+N، Ctrl+PageUp/PageDown، F11، F12.
 *
 * F5 هم کنار گذاشته شد: گرفتنش شدنی است، ولی یک بار از دست رفتنش یعنی
 * رفرشِ صفحه و پریدنِ کلِ فرمِ نیمه‌کاره. ارزشش را ندارد.
 */
export const COMMANDS: CommandSpec[] = [
  { id: "new",   group: "سند", icon: FilePlus, label: "سند نو",   keyLabel: "Alt+N",
    match: (e) => e.altKey && !mod(e) && letter(e, "n") },
  { id: "prev",  group: "سند", icon: ChevronRight, label: "قبلی",     keyLabel: "Alt+PgUp",
    match: (e) => e.altKey && e.key === "PageUp" },
  { id: "next",  group: "سند", icon: ChevronLeft, label: "بعدی",     keyLabel: "Alt+PgDn",
    match: (e) => e.altKey && e.key === "PageDown" },
  { id: "find",  group: "سند", icon: ReceiptText, label: "فاکتورها", keyLabel: "Ctrl+F",
    match: (e) => mod(e) && !e.shiftKey && letter(e, "f") },

  { id: "quotes", group: "سند", icon: FileSearch, label: "پیش‌فاکتورهای باز", keyLabel: "Alt+Q",
    match: (e) => e.altKey && !mod(e) && letter(e, "q") },

  { id: "addRow",   group: "ردیف", icon: Plus, label: "افزودن ردیف", keyLabel: "Insert",
    match: (e) => e.key === "Insert" },
  { id: "delRow",   group: "ردیف", icon: Minus, label: "حذف ردیف",   keyLabel: "Delete",
    match: (e) => e.key === "Delete" && !mod(e) },
  { id: "discount", group: "ردیف", icon: Percent, label: "تخفیف",      keyLabel: "F6",
    match: (e) => e.key === "F6" },

  { id: "lineNote", group: "ردیف", icon: PenLine, label: "توضیح این قلم", keyLabel: "Alt+T",
    match: (e) => e.altKey && !mod(e) && letter(e, "t") },

  { id: "party",  group: "طرف حساب", icon: User, label: "مشتری",      keyLabel: "F4",
    match: (e) => e.key === "F4" },
  { id: "ledger", group: "طرف حساب", icon: Wallet, label: "حساب مشتری", keyLabel: "F3",
    match: (e) => e.key === "F3" },
  { id: "kardex", group: "طرف حساب", icon: Package, label: "کاردکس کالا", keyLabel: "Alt+K",
    match: (e) => e.altKey && !mod(e) && letter(e, "k") },

  { id: "print",   group: "خروجی", icon: Printer, label: "چاپ",        keyLabel: "Ctrl+P",
    match: (e) => mod(e) && !e.shiftKey && letter(e, "p") },
  { id: "preview", group: "خروجی", icon: Eye, label: "پیش‌نمایش",  keyLabel: "Ctrl+⇧+P",
    match: (e) => mod(e) && e.shiftKey && letter(e, "p") },
  { id: "excel",   group: "خروجی", icon: FileSpreadsheet, label: "اکسل",        keyLabel: "Ctrl+E",
    match: (e) => mod(e) && letter(e, "e") },
  { id: "sms",     group: "خروجی", icon: MessageSquare, label: "پیامک",       keyLabel: "Ctrl+M",
    match: (e) => mod(e) && letter(e, "m") },

  { id: "dispatch",   group: "انبار", icon: Send, label: "ارسال به کارگر", keyLabel: "F9",
    match: (e) => e.key === "F9" },
  { id: "workTasks",  group: "انبار", icon: ClipboardList, label: "کارهای انبار", keyLabel: "Alt+W",
    match: (e) => e.altKey && !mod(e) && letter(e, "w") },
  { id: "addProduct", group: "انبار", icon: PackagePlus, label: "افزودن کالا", keyLabel: "Alt+A",
    match: (e) => e.altKey && !mod(e) && letter(e, "a") },
  { id: "shortage",   group: "انبار", icon: PackageX, label: "کسری کالا", keyLabel: "Alt+S",
    match: (e) => e.altKey && !mod(e) && letter(e, "s") },

  { id: "quote",  group: "ثبت", icon: FileClock, label: "پیش‌فاکتور", keyLabel: "F8",
    match: (e) => e.key === "F8" },
  { id: "pay",    group: "ثبت", icon: CreditCard, label: "پرداخت",  keyLabel: "F7",
    match: (e) => e.key === "F7" },
  { id: "commit", group: "ثبت", icon: Check, label: "ثبت سند", keyLabel: "F2", primary: true,
    match: (e) => e.key === "F2" },
  { id: "void",   group: "ثبت", icon: Ban, label: "ابطال",   keyLabel: "Ctrl+Del", destructive: true,
    match: (e) => mod(e) && e.key === "Delete" },

  /*
   * راهنما آخرین آیکنِ نوار است، جدا از بقیه.
   *
   * نوارِ کلیدهای پایینِ صفحه حذف شد: یک خطِ همیشگی که بعد از روز اول کسی
   * نمی‌خواندش، ولی هر روز یک ردیف از ارتفاعِ جدول می‌خورد. هر کلیدی که لازم
   * باشد پشتِ همین آیکن است — و روی tooltipِ خودِ همان دکمه.
   */
  { id: "help", group: "راهنما", icon: Keyboard, label: "همه‌ی کلیدها", keyLabel: "F1",
    match: (e) => e.key === "F1" },
];

/**
 * رنگِ هر گروه.
 *
 * رنگ اینجا تزئین نیست، **شناسه** است — همان قاعده‌ای که کاشی‌های صفحه‌ی اول
 * دارند. فروشنده بعد از چند روز «سبزِ وسط» را می‌زند بدون اینکه tooltip را
 * بخواند، پس رنگ به گروه بسته است نه به تک‌تک آیکن‌ها و هرگز جابه‌جا نمی‌شود.
 *
 * اشباع پایین نگه داشته شده: نوار همیشه جلوی چشم است و رنگِ تند بعد از یک
 * ساعت آزاردهنده می‌شود. تنها دکمه‌ی توپُر «ثبت» است.
 */
export const GROUP_COLOR: Record<CommandGroup, string> = {
  "سند": "text-sky-600 dark:text-sky-400",
  "ردیف": "text-violet-600 dark:text-violet-400",
  "طرف حساب": "text-rose-600 dark:text-rose-400",
  "خروجی": "text-teal-600 dark:text-teal-400",
  "انبار": "text-amber-600 dark:text-amber-400",
  "ثبت": "text-emerald-600 dark:text-emerald-400",
  "راهنما": "text-muted-foreground",
};

export const COMMAND_GROUPS: CommandGroup[] = ["سند", "ردیف", "طرف حساب", "خروجی", "انبار", "ثبت", "راهنما"];

/** فرمان‌های هر گروه، به ترتیبِ ثابتِ نوار. */
export function commandsOf(group: CommandGroup): CommandSpec[] {
  return COMMANDS.filter((c) => c.group === group);
}
