import Link from "next/link";
import { formatToman, toFaDigits } from "@/lib/digits";

/*
 * صفحه‌ی اول کاردو B2B — درگاه تأمین عمده لوازم یدکی خودرو
 * سیستم استاندارد صنعتی، کاتالوگ دقیق، استعلام چندردیفی و تسویه اعتباری
 */
export default function Home() {
  return (
    <div className="min-h-dvh flex flex-col bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* هدر بالایی */}
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-30 shadow-2xs">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 h-15 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" prefetch={false} className="flex items-center gap-2.5">
              <span className="size-9 grid place-items-center bg-slate-900 text-white text-base font-bold rounded-lg shadow-sm">
                ک
              </span>
              <span className="font-extrabold tracking-tight text-lg text-slate-900">
                کاردو <span className="text-blue-600 text-xs align-top font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60">B2B</span>
              </span>
            </Link>

            <span className="hidden sm:inline text-xs text-slate-400 border-s border-slate-200 ps-3">
              پخش تخصصی و عمده قطعات خودرو — کرمان
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/catalog" prefetch={false} className="text-xs font-semibold text-slate-600 hover:text-slate-900 hidden md:inline px-3 py-1.5">
              کاتالوگ قطعات
            </Link>
            <Link href="/login" prefetch={false} className="btn btn-ghost px-4 py-2 text-xs font-semibold rounded-lg">
              ورود همکار
            </Link>
            <Link href="/register" prefetch={false} className="btn btn-primary px-4 py-2 text-xs font-bold rounded-lg shadow-xs">
              افتتاح حساب عمده
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 sm:py-14">
        {/* بخش اصلی (Hero) */}
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200/80 px-3 py-1 rounded-full text-xs text-blue-700 font-bold mb-4 shadow-2xs">
              <span className="size-2 rounded-full bg-blue-600 animate-pulse" />
              <span>سامانه رسمی تأمین و توزیع شرکت کاردو دیار کریمان</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-[1.3] tracking-tight text-slate-900">
              تأمین مستقیم قطعات خودرو،
              <br />
              <span className="text-blue-600">قیمت دست‌اول و استعلام آنلاین</span>
              <br />
              پیش‌فاکتور رسمی در چند ثانیه.
            </h1>

            <p className="mt-4 text-sm sm:text-base leading-8 text-slate-600 max-w-xl">
              ویژه توزیع‌کنندگان، فروشگاه‌های لوازم یدکی و ناوگان‌های خودرویی:
              دسترسی به موجودی زنده انبار مرکزی کرمان، کدهای فنی و OEM، تخفیف‌های پلکانی تیراژ (Volume Pricing)، استعلام چندردیفی (RFQ) و تسویه اعتباری ۳۰ روزه.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/register" prefetch={false} className="btn btn-brass px-6 py-3 text-sm font-bold shadow-md rounded-lg">
                افتتاح حساب همکاری عمده
              </Link>
              <Link href="/catalog" prefetch={false} className="btn btn-ghost px-6 py-3 text-sm font-semibold rounded-lg border-slate-300">
                مشاهده کاتالوگ قطعات
              </Link>
            </div>

            <div className="mt-6 flex items-center gap-6 text-xs text-slate-600 nums font-medium flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="size-4.5 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center text-[10px] font-bold">✓</span>
                رزرو خودکار موجودی انبار
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-4.5 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center text-[10px] font-bold">✓</span>
                ارسال فوری از باربری کرمان
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-4.5 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center text-[10px] font-bold">✓</span>
                سقف اعتبار باز و تسویه چکی
              </span>
            </div>
          </div>

          {/* برگه‌ی نمونه پیش‌فاکتور دیجیتال مدرن */}
          <div className="card p-5 sm:p-6 bg-white border border-slate-200/90 shadow-xl rounded-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <p className="text-[11px] font-semibold text-slate-400">پیش‌فاکتور رسمی معتبر</p>
                <p className="nums font-extrabold text-lg text-slate-900 mt-0.5">PF-۱۴۰۵-۰۱۲۷</p>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full">
                  موجودی رزرو شد
                </span>
                <span className="text-[11px] text-slate-400 mt-1">باربری کرمان (تحویل ۲۴ساعته)</span>
              </div>
            </div>

            <table className="w-full mt-3.5 text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100 text-[11px]">
                  <th className="py-2 text-start font-medium">شرح کالا</th>
                  <th className="py-2 text-center font-medium">تعداد</th>
                  <th className="py-2 text-end font-medium">مبلغ کل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  ["لنت ترمز جلو پراید کره‌ای", "۱۲ جین", 15_840_000],
                  ["فیلتر روغن پژو ۲۰۶ سرکان", "۱۰۰ عدد", 17_575_000],
                  ["دیسک چرخ جلو سمند دیسکی", "۱۰ عدد", 32_430_000],
                ].map(([name, qty, total]) => (
                  <tr key={name as string}>
                    <td className="py-2.5 text-xs font-bold text-slate-800">{name}</td>
                    <td className="py-2.5 text-center nums text-slate-500">{qty}</td>
                    <td className="py-2.5 text-end nums font-bold text-slate-900">{formatToman(total as number)} ت</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 pt-3 border-t border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">تخفیف طبقه طلایی و تیراژ:</span>
                <span className="nums text-emerald-600 font-bold">− ۹٪</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">کرایه تحویل باربری:</span>
                <span className="nums text-emerald-600 font-bold">رایگان</span>
              </div>
              <div className="flex justify-between items-baseline border-t border-slate-200 mt-2.5 pt-2.5">
                <span className="font-extrabold text-sm text-slate-900">مبلغ نهایی پیش‌فاکتور:</span>
                <span className="nums font-extrabold text-xl text-blue-600">{formatToman(65_845_000)} تومان</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
              <span className="border border-slate-200 rounded-lg py-2 text-center text-slate-600 bg-slate-50 font-medium">
                رزرو قطعی
              </span>
              <span className="border border-slate-200 rounded-lg py-2 text-center text-slate-600 bg-slate-50 font-medium">
                کیف پول
              </span>
              <span className="bg-slate-900 text-white rounded-lg py-2 text-center font-bold shadow-xs">
                تسویه اعتباری
              </span>
            </div>
          </div>
        </div>

        {/* مراحل خرید و سفارش */}
        <section className="mt-16 sm:mt-24">
          <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
            <h2 className="font-extrabold text-lg sm:text-xl text-slate-900">مراحل فرآیند سفارش در پورتال</h2>
            <span className="text-xs text-slate-500 nums font-medium">
              سامانه یکپارچه بدون واسطه
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "۰۱",
                t: "انتخاب قطعه یا استعلام چندردیفی",
                d: "جست‌وجوی سریع کاتالوگ با کد فنی و OEM، یا ارسال لیست اختصاصی چندقلمی برای قطعات کم‌تیراژ.",
              },
              {
                n: "۰۲",
                t: "پیش‌فاکتور شفاف و رزرو موجودی",
                d: "محاسبه خودکار تخفیف‌های تیراژ و همکار، تعیین باربری مقصد و دریافت لینک معتبر اشتراک فاکتور.",
              },
              {
                n: "۰۳",
                t: "تسویه نقدی، کیف پول یا اعتبار",
                d: "امکان پرداخت مستقیم آنلاین، کسر از کیف پول یا خرید با اعتبار شرکتی ۳۰ روزه با تأیید ادمین.",
              },
            ].map((s) => (
              <div key={s.n} className="card p-5 bg-white border border-slate-200 rounded-xl shadow-2xs hover:shadow-md transition-shadow">
                <p className="nums text-blue-600 text-sm font-extrabold">{s.n}</p>
                <p className="font-bold text-base text-slate-900 mt-2">{s.t}</p>
                <p className="text-xs sm:text-sm leading-7 text-slate-600 mt-2">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* مزایای پورتال */}
        <section className="mt-12 card overflow-hidden border border-slate-200 rounded-2xl bg-white shadow-2xs">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 font-bold text-sm text-slate-900">
            مزایای همکاری و خرید از کاردو B2B
          </div>
          <div className="divide-y divide-slate-100 text-xs sm:text-sm">
            {[
              ["تخفیف‌های پلکانی تیراژ (Volume Pricing)", "با افزایش تعداد در هر ردیف، قیمت به‌طور خودکار کاهش می‌یابد."],
              ["استعلام چندردیفی قطعات (RFQ)", "لیست قطعات کارگاه یا فروشگاه را یکجا ارسال و قیمت تضمینی دریافت کنید."],
              ["کیف پول اعتباری و خرید چکی", "مدیریت ساده مانده‌حساب، شارژ آنلاین و درخواست خرید اعتباری شرکتی."],
              ["لینک اشتراک و خروجی رسمی A4", "پیش‌فاکتور استاندارد با کد اقتصادی، شناسه ملی، مبلغ حروفی و مهر شرکت."],
            ].map(([t, d]) => (
              <div key={t} className="px-6 py-4 grid sm:grid-cols-[15rem_1fr] gap-2 sm:gap-4 items-center">
                <span className="font-bold text-slate-900">{t}</span>
                <span className="text-slate-600 leading-relaxed">{d}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 mt-16 bg-white py-8">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <p className="font-extrabold text-sm text-slate-800">شرکت کاردو دیار کریمان (سهامی خاص)</p>
            <p className="text-xs mt-1">مرکز تخصصی تأمین و پخش عمده قطعات یدکی خودرو — انبار مرکزی کرمان</p>
          </div>
          <div className="text-start sm:text-end nums text-xs">
            <p className="font-semibold text-slate-700">تلفن هماهنگی و فروش: ۰۳۴-۳۳۲۲۴۴۵۵</p>
            <p className="mt-0.5">پشتیبانی آنلاین همکاران: شنبه تا چهارشنبه ۸:۰۰ الی ۱۷:۰۰</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
