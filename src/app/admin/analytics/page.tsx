import { requireAdminPage } from "@/lib/server-account";
import { AnalyticsView } from "./analytics-view";

export const metadata = {
  title: "داشبورد هوش تجاری و گزارشات فروش B2B | کاردو B2B",
};

export default async function AdminAnalyticsPage() {
  await requireAdminPage();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/70 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-ink">داشبورد هوش تجاری و تحلیل فروش استان کرمان</h1>
          <p className="text-xs sm:text-sm text-ink-soft mt-1">
            آمار فروش به تفکیک شهرستان‌ها، قطعات پرفروش، مدیریت ریسک اعتباری و سررسید چک‌های صیادی
          </p>
        </div>
      </header>

      <AnalyticsView />
    </div>
  );
}
