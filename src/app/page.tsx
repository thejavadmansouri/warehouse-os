import Link from "next/link";
import { formatToman, toFaDigits } from "@/lib/digits";

/*
 * صفحه‌ی اول کاردو B2B — درگاه تأمین عمده لوازم یدکی خودرو
 * سیستم پیش‌فاکتور شفاف، کاتالوگ دقیق، استعلام چندردیفی و تسویه اعتباری
 */
export default function Home() {
  return (
    <div className="min-h-dvh flex flex-col selection:bg-brass selection:text-white">
      {/* هدر */}
      <header className="border-b border-rule bg-paper-raised/80 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto w-full max-w-5xl px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="size-8 grid place-items-center bg-ink text-paper text-sm font-bold rounded-[3px] shadow-xs">
                ک
              </span>
              <span className="font-bold tracking-tight text-base">
                کاردو <span className="text-brass text-xs align-top font-bold">B2B</span>
              </span>
            </Link>

            <span className="hidden sm:inline text-[11px] text-ink-soft border-s border-rule ps-3">
              عمده‌فروشی تخصصی قطعات خودرو — کرمان
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/catalog" className="text-xs text-ink-soft hover:text-ink hidden md:inline px-3 py-1.5">
              کاتالوگ قطعات
            </Link>
            <Link href="/login" className="btn btn-ghost px-3.5 py-1.5 text-xs">
              ورود همکار
            </Link>
            <Link href="/register" className="btn btn-primary px-3.5 py-1.5 text-xs">
              ثبت‌نام عمده
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
        {/* بخش معرفی و نمونه پیش‌فاکتور */}
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-brass-soft/40 border border-brass/30 px-2.5 py-1 rounded-[3px] text-[11px] text-brass font-bold mb-3">
              <span>★</span>
              <span>سامانه رسمی فروش B2B شرکت کاردو دیار کریمان</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-[1.4] tracking-tight text-ink">
              تأمین مستقیم قطعات یدکی خودرو،
              <br />
              <span className="text-brass">قیمت روز، استعلام آنلاین</span>
              <br />
              و صدور فوری پیش‌فاکتور رسمی.
            </h1>

            <p className="mt-4 text-xs sm:text-sm leading-7 text-ink-soft max-w-lg">
              ویژه پخش‌کنندگان، فروشگاه‌های لوازم یدکی و تعمیرگاه‌های مجاز:
              کاتالوگ کامل با کدهای فنی و OEM، تخفیف‌های پلکانی حجمی، استعلام قیمت چندردیفی (RFQ)، تسویه با کیف پول یا اعتبار شرکتی.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <Link href="/register" className="btn btn-brass px-5 py-2.5 text-xs sm:text-sm font-bold shadow-sm">
                افتتاح حساب همکاری عمده
              </Link>
              <Link href="/catalog" className="btn btn-ghost px-5 py-2.5 text-xs sm:text-sm">
                مشاهده کاتالوگ قطعات
              </Link>
            </div>

            <div className="mt-4 flex items-center gap-4 text-[11px] text-ink-soft nums">
              <span className="flex items-center gap-1">
                <span className="text-ledger-green font-bold">✓</span> رزرو خودکار موجودی
              </span>
              <span className="flex items-center gap-1">
                <span className="text-ledger-green font-bold">✓</span> ارسال فوری از انبار کرمان
              </span>
              <span className="flex items-center gap-1">
                <span className="text-ledger-green font-bold">✓</span> تسویه اعتباری ۳۰ روزه
              </span>
            </div>
          </div>

          {/* برگه‌ی نمونه — پیش‌فاکتور واقعی با استایل اداری */}
          <div className="card p-4 sm:p-5 rotate-[-0.5deg] shadow-[0_12px_36px_rgba(27,37,48,0.08)] bg-[#fffefc] border-2 border-rule">
            <div className="flex items-start justify-between border-b-2 border-ink pb-2.5">
              <div>
                <p className="text-[10px] text-ink-soft">پیش‌فاکتور رسمی فروش</p>
                <p className="nums font-bold text-base text-ink">PF-۱۴۰۵-۰۱۲۷</p>
              </div>
              <div className="flex flex-col items-end">
                <span className="stamp text-brass text-[10px]">تأییدشده</span>
                <span className="text-[10px] text-ink-soft mt-1 nums">ارسال با باربری</span>
              </div>
            </div>

            <table className="w-full mt-3 text-xs">
              <thead>
                <tr className="text-ink-soft border-b border-rule text-[11px]">
                  <th className="py-1.5 text-start font-medium">قطعه</th>
                  <th className="py-1.5 text-center font-medium">تعداد</th>
                  <th className="py-1.5 text-end font-medium">جمع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/40">
                {[
                  ["لنت ترمز جلو پراید (کره‌ای)", "۱۲ جین", 15_840_000],
                  ["فیلتر روغن پژو ۲۰۶ سرکان", "۱۰۰ عدد", 17_575_000],
                  ["دیسک چرخ جلو سمند دیسکی", "۱۰ عدد", 32_430_000],
                ].map(([name, qty, total]) => (
                  <tr key={name as string}>
                    <td className="py-2 text-[12px] font-medium">{name}</td>
                    <td className="py-2 text-center nums text-ink-soft">{qty}</td>
                    <td className="py-2 text-end nums font-bold text-ink">{formatToman(total as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 pt-2 border-t border-rule text-xs space-y-1">
              <div className="flex justify-between py-0.5">
                <span className="text-ink-soft">تخفیف طبقه طلایی و تیراژ:</span>
                <span className="nums text-ledger-green font-bold">− ۹٪</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-ink-soft">کرایه تحویل باربری:</span>
                <span className="nums text-ledger-green font-bold">رایگان</span>
              </div>
              <div className="flex justify-between items-baseline border-t-2 border-ink mt-2 pt-2">
                <span className="font-bold text-sm">مبلغ نهایی:</span>
                <span className="nums font-bold text-lg text-brass">{formatToman(65_845_000)} تومان</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-1.5 text-[11px]">
              <span className="border border-rule rounded-[2px] py-1.5 text-center text-ink-soft bg-paper">
                موجودی رزرو
              </span>
              <span className="border border-rule rounded-[2px] py-1.5 text-center text-ink-soft bg-paper">
                کیف پول
              </span>
              <span className="bg-ink text-paper rounded-[2px] py-1.5 text-center font-bold">
                تسویه اعتباری
              </span>
            </div>
          </div>
        </div>

        {/* مراحل کار با سیستم */}
        <section className="mt-14 sm:mt-18">
          <div className="flex items-baseline justify-between border-b border-rule pb-2">
            <h2 className="font-bold text-base sm:text-lg">فرآیند سفارش‌گذاری و خرید</h2>
            <span className="text-xs text-ink-soft nums">
              ساده، شفاف و بدون رفت‌وآمدهای سنتی
            </span>
          </div>

          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              {
                n: "۰۱",
                t: "انتخاب قطعه یا استعلام چندردیفی",
                d: "جست‌وجوی سریع کاتالوگ با کد فنی و OEM، یا ارسال لیست سفارشی چندقلمی برای قطعات کمیاب.",
              },
              {
                n: "۰۲",
                t: "پیش‌فاکتور شفاف و رزرو موجودی",
                d: "محاسبه آنی تخفیف‌های تیراژ و همکار، انتخاب شیوه باربری و دریافت پیش‌فاکتور با لینک و توکن رسمی.",
              },
              {
                n: "۰۳",
                t: "تسویه نقدی، کیف پول یا اعتبار",
                d: "امکان پرداخت مستقیم آنلاین، پرداخت از کیف پول شارژشده، یا خرید اعتباری ۳۰ روزه با سقف تعیین‌شده.",
              },
            ].map((s) => (
              <li key={s.n} className="card p-4 bg-paper-raised">
                <p className="nums text-brass text-sm font-bold">{s.n}</p>
                <p className="font-bold text-sm mt-1">{s.t}</p>
                <p className="text-xs leading-6 text-ink-soft mt-1">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ویژگی‌ها و مزایا */}
        <section className="mt-10 card overflow-hidden">
          <div className="px-4 py-3 border-b border-rule bg-brass-soft/40 text-xs font-bold text-ink">
            مزایای همکاری با کاردو B2B
          </div>
          <ul className="divide-y divide-rule/60 text-xs">
            {[
              ["تخفیف‌های پلکانی تیراژ (Volume Pricing)", "هرچه تعداد سفارش در یک ردیف بیشتر باشد، درصد تخفیف خرید خودکار افزایش می‌یابد."],
              ["استعلام چندردیفی قطعات (RFQ)", "لیست قطعات مورد نیاز کارگاه یا فروشگاه خود را یکجا ارسال کنید و قیمت تضمینی تحویل بگیرید."],
              ["کیف پول اعتباری و تسویه باز", "قابلیت شارژ آنلاین، مدیریت مانده حساب، شارژ دستی توسط ادمین و خرید اعتباری شرکتی."],
              ["لینک عمومی فاکتور و خروجی رسمی", "ارسال آسان پیش‌فاکتور به حسابداری، مدیران خرید و دریافت نسخه رسمی قابل پرینت."],
            ].map(([t, d]) => (
              <li key={t} className="px-4 py-3 grid sm:grid-cols-[13rem_1fr] gap-1 sm:gap-3 items-center">
                <span className="font-bold text-ink">{t}</span>
                <span className="text-[11px] leading-6 text-ink-soft">{d}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-rule mt-12 bg-paper-raised/60">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-ink-soft">
          <div>
            <p className="font-bold text-ink">شرکت کاردو دیار کریمان (سهامی خاص)</p>
            <p className="text-[11px] mt-0.5">مرکز تخصصی پخش عمده قطعات یدکی خودرو — انبار مرکزی کرمان</p>
          </div>
          <div className="text-start sm:text-end nums text-[11px]">
            <p>تلفن هماهنگی و فروش: ۰۳۴-۳۳۲۲۴۴۵۵</p>
            <p className="mt-0.5">پشتیبانی آنلاین: شنبه تا چهارشنبه ۸:۰۰ الی ۱۷:۰۰</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
