import { connection } from "next/server";
// داده‌ی پویا — بدون پیش‌ساخت
export const instant = false;

import { ImportView } from "./import-view";

export default async function AdminImportPage() {
  await connection();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 pb-20">
      <div className="pb-4 border-b border-slate-200">
        <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
          مرکز ورود گروهی محصولات و به‌روزرسانی نرخ (Import Center)
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          بارگذاری دسته‌جمعی اقلام از فایل‌های اکسل/CSV تأمین‌کنندگان، انبارداران و نرم‌افزارهای حسابداری
        </p>
      </div>

      <div className="mt-6">
        <ImportView />
      </div>
    </div>
  );
}
