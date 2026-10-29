import Link from "next/link";
import { formatToman } from "@/lib/digits";

export default function Home() {
  // نمونه نمایش ارقام فارسی — در فاز ۲ با داده واقعی جایگزین می‌شود
  const samplePrice = formatToman(1250000);

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-12 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-primary-foreground">
          ک
        </span>
        <div className="text-start">
          <h1 className="text-2xl font-bold">کاردو B2B</h1>
          <p className="text-sm text-muted">
            عمده‌فروشی لوازم یدکی خودرو — کرمان
          </p>
        </div>
      </div>

      <p className="max-w-md leading-7 text-muted">
        پورتال خرید عمده کاردو فقط برای مشتریان ثبت‌شده فعال است. پس از تأیید
        حساب، موجودی و قیمت‌ها را می‌بینید و می‌توانید درخواست پیش‌فاکتور ثبت
        کنید.
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/login"
          className="rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground transition active:scale-[0.98] hover:bg-[#153f68]"
        >
          ورود مشتریان عمده
        </Link>
        <Link
          href="/register"
          className="rounded-xl border border-primary/20 px-6 py-3 font-medium text-primary transition active:scale-[0.98] hover:bg-primary/5"
        >
          ثبت‌نام شرکت جدید
        </Link>
      </div>

      <p className="text-xs text-muted">
        نمونه قالب‌بندی قیمت: <span className="nums">{samplePrice} تومان</span>
      </p>
    </main>
  );
}
