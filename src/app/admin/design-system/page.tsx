import { requireAdminPage } from "@/lib/server-account";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const metadata = {
  title: "دیزاین سیستم کاردو B2B | Kardo Design System",
};

export default async function DesignSystemPage() {
  await requireAdminPage();

  return (
    <div className="space-y-8 pb-12">
      {/* هدر دیزاین سیستم */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <span className="size-10 grid place-items-center bg-linear-to-tr from-amber-500 to-orange-500 text-slate-950 font-black rounded-xl text-lg shadow-md shadow-orange-500/20">
            ک
          </span>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              دیزاین سیستم کاردو B2B
              <span className="text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                نسخه ۲.۰
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              هویت بصری یکپارچه، پالت رنگی اختصاصی کاردو (کهربایی/نارنجی صنعتی)، تایپوگرافی منسجم و کتابخانه کامپوننت‌ها
            </p>
          </div>
        </div>
      </div>

      {/* بخش ۱: پالت رنگی کاردو */}
      <section className="space-y-3">
        <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
          <span>🎨</span> پالت رنگی سازمانی (Brand Color Palette)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-4 rounded-2xl bg-amber-500 text-slate-950 font-bold space-y-1 shadow-sm">
            <div className="text-sm font-black">Amber 500</div>
            <div className="font-mono text-[10px] opacity-80">#F59E0B</div>
            <div className="text-[10px]">رنگ اصلی اکشن و کاتالوگ</div>
          </div>
          <div className="p-4 rounded-2xl bg-orange-600 text-white font-bold space-y-1 shadow-sm">
            <div className="text-sm font-black">Orange 600</div>
            <div className="font-mono text-[10px] opacity-80">#EA580C</div>
            <div className="text-[10px]">رنگ گرادینت پرانرژی</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900 text-white font-bold space-y-1 shadow-sm">
            <div className="text-sm font-black">Slate 900</div>
            <div className="font-mono text-[10px] opacity-80">#0F172A</div>
            <div className="text-[10px]">سورمه‌ای عمیق هدر و کارت</div>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-600 text-white font-bold space-y-1 shadow-sm">
            <div className="text-sm font-black">Emerald 600</div>
            <div className="font-mono text-[10px] opacity-80">#059669</div>
            <div className="text-[10px]">کیف پول و وضعیت موجود</div>
          </div>
          <div className="p-4 rounded-2xl bg-blue-600 text-white font-bold space-y-1 shadow-sm">
            <div className="text-sm font-black">Blue 600</div>
            <div className="font-mono text-[10px] opacity-80">#2563EB</div>
            <div className="text-[10px]">اسناد و چک‌های صیادی</div>
          </div>
          <div className="p-4 rounded-2xl bg-rose-600 text-white font-bold space-y-1 shadow-sm">
            <div className="text-sm font-black">Rose 600</div>
            <div className="font-mono text-[10px] opacity-80">#E11D48</div>
            <div className="text-[10px]">هشدار فوری و ناموجود</div>
          </div>
        </div>
      </section>

      {/* بخش ۲: دکمه‌ها */}
      <section className="space-y-3">
        <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
          <span>🔘</span> دکمه‌ها و تعاملات (Buttons)
        </h2>
        <Card className="bg-white border-slate-200 text-slate-900 shadow-sm p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">دکمه اصلی کاردو (Primary)</Button>
            <Button variant="amber">کهربایی (Amber)</Button>
            <Button variant="secondary">ثانویه (Secondary)</Button>
            <Button variant="emerald">موفقیت (Emerald)</Button>
            <Button variant="destructive">حذف / هشدار (Destructive)</Button>
            <Button variant="outline">دورخط (Outline)</Button>
            <Button variant="primary" loading>در حال ذخیره...</Button>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            <Button size="sm">اندازه کوچک (Small)</Button>
            <Button size="md">اندازه متوسط (Medium)</Button>
            <Button size="lg">اندازه بزرگ (Large)</Button>
          </div>
        </Card>
      </section>

      {/* بخش ۳: نشان‌ها و وضعیت‌ها */}
      <section className="space-y-3">
        <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
          <span>🏷️</span> نشان‌ها و برچسب‌های وضعیت (Badges & Pills)
        </h2>
        <Card className="bg-white border-slate-200 text-slate-900 shadow-sm p-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant="kardo">کاردو B2B</Badge>
            <Badge variant="success">موجود در انبار مرکزی</Badge>
            <Badge variant="warning">در انتظار تایید اعتبار</Badge>
            <Badge variant="danger">ناموجود / استعلام تلفنی</Badge>
            <Badge variant="info">سفارش ثبت‌شده در حسابداری</Badge>
            <Badge variant="neutral">پیش‌فاکتور عادی</Badge>
            <Badge variant="outline">همکار رتبه ۳</Badge>
          </div>
        </Card>
      </section>

      {/* بخش ۴: فیلدهای ورودی */}
      <section className="space-y-3">
        <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
          <span>📝</span> فیلدهای ورودی فرم (Inputs & Forms)
        </h2>
        <Card className="bg-white border-slate-200 text-slate-900 shadow-sm p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="نام قطعه خودرو" placeholder="مثلاً: کمک فنر پراید عظام" defaultValue="کمک فنر جلو روغنی" />
            <Input label="کد فنی قطعه (SKU)" placeholder="SHK-ABS-01" dir="ltr" defaultValue="SHK-ABS-PRD-01" />
            <Input label="شماره موبایل با خطا" placeholder="۰۹۱۲..." error="شماره همراه باید ۱۱ رقم باشد" defaultValue="0912" />
          </div>
        </Card>
      </section>

      {/* بخش ۵: کارت‌ها و باکس‌ها */}
      <section className="space-y-3">
        <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
          <span>📦</span> کارت محصول و آمار (Cards & KPI Widgets)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-white border-slate-200 text-slate-900 shadow-sm">
            <CardHeader className="border-slate-100 pb-3">
              <span className="text-xs font-bold text-slate-500">فروش کل امروز</span>
              <div className="text-2xl font-black text-slate-900 nums mt-1">۱۲۵,۴۰۰,۰۰۰ تومان</div>
            </CardHeader>
            <CardContent className="pt-2 text-xs text-emerald-600 font-bold flex items-center gap-1">
              <span>↑ ۱۸٪ رشد نسبت به هفته گذشته</span>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 text-white shadow-md">
            <CardHeader className="border-slate-800 pb-3">
              <span className="text-xs font-bold text-amber-400">سفارش‌های جدید B2B</span>
              <div className="text-2xl font-black text-white nums mt-1">۲۸ سفارش</div>
            </CardHeader>
            <CardContent className="pt-2 text-xs text-slate-400 font-medium">
              همگام‌سازی شده با سیستم حسابداری
            </CardContent>
          </Card>

          <Card className="bg-linear-to-tr from-amber-500/10 to-orange-500/10 border-orange-500/30 text-slate-900 shadow-sm">
            <CardHeader className="border-orange-500/20 pb-3">
              <span className="text-xs font-bold text-orange-900">سقف اعتبار فعال همکاران</span>
              <div className="text-2xl font-black text-orange-950 nums mt-1">۸۵۰,۰۰۰,۰۰۰ تومان</div>
            </CardHeader>
            <CardContent className="pt-2 text-xs text-orange-800 font-medium">
              تضمین با چک‌های صیادی بنفش
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
