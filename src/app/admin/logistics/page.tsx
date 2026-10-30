import { requireAdminPage } from "@/lib/server-account";
import { LogisticsView } from "./logistics-view";

export const metadata = {
  title: "مدیریت لجستیک و ارسال باربری کرمان | کاردو B2B",
};

export default async function AdminLogisticsPage() {
  await requireAdminPage();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/70 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-ink">مرکز مدیریت لجستیک و باربری استان کرمان</h1>
          <p className="text-xs sm:text-sm text-ink-soft mt-1">
            صدور حواله باربری، ثبت شماره بیجک و بارنامه، پیگیری وضعیت تحویل به شهرهای استان کرمان
          </p>
        </div>
      </header>

      <LogisticsView />
    </div>
  );
}
