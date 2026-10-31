import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME } from "@/lib/auth-cookie";
import { verifySession } from "@/lib/session";

/*
 * صفحه‌ی ورودی کاردو B2B
 * کاربرانی که وارد شده‌اند مستقیماً به کاتالوگ یا پنل هدایت می‌شوند.
 */
export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    const session = await verifySession(token);
    if (session) {
      if (session.role === "admin") {
        redirect("/admin");
      }
      if (session.role === "customer") {
        redirect("/catalog");
      }
    }
  }

  return (
    <div className="min-h-dvh flex flex-col justify-between bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950">
      {/* هدر کاردو */}
      <header className="border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="size-11 grid place-items-center bg-linear-to-tr from-amber-600 to-orange-500 text-slate-950 text-xl font-black rounded-xl shadow-lg shadow-orange-500/20">
              ک
            </span>
            <div className="flex flex-col">
              <span className="font-black text-xl tracking-tight text-white flex items-center gap-1.5">
                کاردو
                <span className="text-orange-400 text-[11px] font-black bg-orange-950/80 px-2 py-0.5 rounded-md border border-orange-500/30">
                  B2B
                </span>
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                شرکت کاردو دیار کریمان (سهامی خاص)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/catalog"
              prefetch={false}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors px-3 py-2 rounded-lg hover:bg-slate-800/60"
            >
              مشاهده کاتالوگ
            </Link>
            <Link
              href="/login"
              prefetch={false}
              className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-lg transition-all shadow-md active:scale-95"
            >
              ورود همکاران
            </Link>
          </div>
        </div>
      </header>

      {/* بخش مرکزی */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-12 sm:py-20 relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-2xl text-center space-y-7 relative z-10">
          <div className="inline-flex items-center gap-2 bg-orange-950/60 border border-orange-500/40 px-3.5 py-1.5 rounded-full text-xs text-orange-300 font-bold shadow-sm">
            <span className="size-2 rounded-full bg-orange-400 animate-pulse shrink-0" />
            <span>مرکز توزیع عمده و پخش قطعات یدکی خودرو در سراسر کشور</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-3xl sm:text-5xl leading-tight font-black text-white tracking-tight">
              سامانه فروش و توزیع عمده
              <br />
              <span className="text-transparent bg-clip-text bg-linear-to-r from-amber-400 via-orange-400 to-amber-500">
                قطعات یدکی خودرو کاردو
              </span>
            </h1>
            <p className="text-sm sm:text-base text-slate-300 max-w-lg mx-auto leading-relaxed font-normal">
              دسترسی مستقیم به انبار مرکزی، قیمت‌های مصوب همکار، ثبت سفارش گروهی اکسل، استعلام آنی و تسویه اعتباری.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3 max-w-md mx-auto">
            <Link
              href="/catalog"
              prefetch={false}
              className="w-full sm:flex-1 h-13 px-6 rounded-xl bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm sm:text-base shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 active:scale-98"
            >
              <span>ورود مستقیم به کاتالوگ کالاها</span>
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </Link>

            <Link
              href="/login"
              prefetch={false}
              className="w-full sm:flex-1 h-13 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 active:scale-98"
            >
              <span>ورود به حساب کاربری</span>
            </Link>
          </div>

          <div className="pt-6 border-t border-slate-800/80 flex items-center justify-center gap-6 text-xs text-slate-400 font-medium flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-400" />
              ورود سریع پیامکی (OTP)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-400" />
              تسویه اعتباری و چکی ۳۰ روزه
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-orange-400" />
              ارسال مستقیم از انبار مرکزی کرمان
            </span>
          </div>
        </div>
      </main>

      {/* فوتر */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 py-5">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            <span>تلفن هماهنگی و پشتیبانی فروش: </span>
            <span className="font-bold text-amber-400 nums">۰۳۴-۳۳۲۲۴۴۵۵</span>
          </div>
          <div>
            <span>انبار مرکزی: کرمان، شهرک صنعتی شماره ۲، مجتمع کاردو B2B</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
