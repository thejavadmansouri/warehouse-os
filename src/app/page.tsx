import Link from "next/link";

/*
 * صفحه‌ی اول کاردو B2B — درگاه ورودی اختصاصی همکاران و خریداران عمده
 * طراحی مینیمال، مدرن و متمرکز بر ۲ دکمه اصلی: ورود و ثبت‌نام
 */
export default function Home() {
  return (
    <div className="min-h-dvh flex flex-col justify-between bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* هدر ساده و باوقار */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="size-10 grid place-items-center bg-slate-900 text-white text-lg font-bold rounded-xl shadow-sm">
              ک
            </span>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-900">
                کاردو <span className="text-blue-600 text-xs font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200/70 align-top">B2B</span>
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                شرکت کاردو دیار کریمان (سهامی خاص)
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-500 hidden sm:block font-medium">
            مرکز پخش عمده قطعات خودرو — انبار مرکزی کرمان
          </div>
        </div>
      </header>

      {/* بخش مرکزی: معرفی کوتاه و دکمه‌های ورود و ثبت‌نام */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-16">
        <div className="w-full max-w-xl text-center space-y-6 sm:space-y-8">
          {/* نشان وضعیت سامانه */}
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200/80 px-3 py-1.5 rounded-full text-[11px] sm:text-xs text-blue-700 font-bold shadow-2xs">
            <span className="size-2 rounded-full bg-blue-600 animate-pulse shrink-0" />
            <span>پورتال اختصاصی همکاران، فروشگاه‌ها و پخش لوازم یدکی</span>
          </div>

          {/* تیتر اصلی */}
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-4xl leading-snug sm:leading-tight font-extrabold text-slate-900 tracking-tight">
              سامانه فروش و توزیع عمده
              <br />
              <span className="text-blue-600">قطعات یدکی خودرو کاردو</span>
            </h1>
            <p className="text-xs sm:text-base text-slate-600 max-w-md mx-auto leading-relaxed">
              دسترسی مستقیم به موجودی انبار مرکزی، قیمت‌های مصوب همکار، استعلام چندردیفی آنلاین و صدور پیش‌فاکتور رسمی.
            </p>
          </div>

          {/* فقط ۲ دکمه اصلی: ورود و ثبت‌نام */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1 max-w-md mx-auto">
            <Link
              href="/login"
              prefetch={false}
              className="w-full sm:flex-1 h-13 sm:h-14 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm sm:text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-98"
            >
              <svg className="size-5 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" x2="3" y1="12" y2="12" />
              </svg>
              <span>ورود به حساب کاربری</span>
            </Link>

            <Link
              href="/register"
              prefetch={false}
              className="w-full sm:flex-1 h-13 sm:h-14 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm sm:text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-98"
            >
              <svg className="size-5 text-blue-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" x2="19" y1="8" y2="14" />
                <line x1="22" x2="16" y1="11" y2="11" />
              </svg>
              <span>ثبت‌نام و افتتاح حساب عمده</span>
            </Link>
          </div>

          {/* مزایای کوتاه و معتبر زیر دکمه‌ها */}
          <div className="pt-5 border-t border-slate-200/80 flex items-center justify-center gap-4 sm:gap-6 text-xs text-slate-500 font-medium flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              ورود سریع با پیامک OTP یا کلمه عبور
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-blue-500" />
              تسویه اعتباری ۳۰ روزه برای همکاران
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-amber-500" />
              ارسال فوری از باربری کرمان
            </span>
          </div>
        </div>
      </main>

      {/* فوتر ساده سازمانی */}
      <footer className="border-t border-slate-200/80 bg-white py-5">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            <span>تلفن هماهنگی و پشتیبانی فروش: </span>
            <span className="nums font-bold text-slate-800">۰۳۴-۳۳۲۲۴۴۵۵</span>
          </div>
          <div>
            <span>انبار مرکزی: کرمان، شهرک صنعتی شماره ۲، مجتمع کاردو B2B</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
