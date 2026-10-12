import * as React from "react";
import { Suspense } from "react";
import { CatalogHome } from "./_components/catalog-home";

export default function ShopPage() {
  return (
    <>
      <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-8" />}>
        <CatalogHome />
      </Suspense>
      <ShopSeoText />
    </>
  );
}

/**
 * متنِ سئوی صفحه‌ی اول — سروررندر تا گوگل آن را ببیند.
 *
 * کاتالوگ خودش کلاینتی است (برای گوگل خالی)؛ این بلوکِ استاتیک همان چیزی است
 * که اتوموبی/ترب پایینِ صفحه‌ی اول دارند: معرفی فروشگاه + راهنمای خرید با
 * لینک‌های داخلی. «نمایش بیشتر» با details/pure-CSS است تا بدون JS هم کار کند.
 */
function ShopSeoText() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-10">
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-2 text-base font-bold">
          خرید لوازم یدکی از شهر یدکی صادقی
        </h2>
        <p className="text-sm leading-7 text-muted-foreground">
          شهر یدکی صادقی مرجع خرید اینترنتی قطعات یدکی خودروهای ایرانی است؛ از
          لنت ترمز پراید و سمند تا رینگ موتور و دستگیره درب. همه‌ی کالاها با عکس
          واقعی، قیمت شفاف به تومان و موجودی به‌روز عرضه می‌شوند و سفارش‌ها با
          پرداخت در محل یا کارت‌به‌کارت به سراسر کشور ارسال می‌شود.
        </p>
        <details className="group mt-2">
          <summary className="cursor-pointer text-sm font-medium text-primary">
            راهنمای خرید قطعه مناسب
          </summary>
          <div className="mt-2 space-y-2 text-sm leading-7 text-muted-foreground">
            <p>
              پیش از خرید، از سازگاری قطعه با مدل خودرو مطمئن شوید: اول از بخش
              «خودروت را انتخاب کن» مدل ماشین را بزنید تا فقط قطعات همان خودرو
              نمایش داده شود، بعد در صفحه‌ی کالا «خودروهای سازگار» را چک کنید.
              اگر قیمت کالا «تماس بگیرید» بود یعنی قیمت روز را باید تلفنی بپرسید.
            </p>
            <p>
              همه‌ی قطعات ضمانت اصالت دارند؛ اگر کالای تحویلی با عکس و توضیح
              سایت فرق داشت، پشتیبانی فروشگاه راهنمایی‌تان می‌کند. نظرهای
              تأییدشده‌ی هر کالا (ستاره‌های زیر نام کالا) تجربه‌ی خریداران قبلی
              است — به آن‌ها نگاه کنید.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
