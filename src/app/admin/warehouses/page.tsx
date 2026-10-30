import { requireAdminPage } from "@/lib/server-account";
import { WarehousesView } from "./warehouses-view";

export const metadata = {
  title: "مدیریت چندانباره و شعب توزیع استان کرمان | کاردو B2B",
};

export default async function AdminWarehousesPage() {
  await requireAdminPage();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/70 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-ink">مدیریت انبارهای چندگانه و شعب توزیع استان کرمان</h1>
          <p className="text-xs sm:text-sm text-ink-soft mt-1">
            انبار مرکزی کرمان، انبارهای منطقه‌ای (رفسنجان، سیرجان، جیرفت)، لوکیشن قفسه‌بندی و حواله‌های انتقال بین‌انبار
          </p>
        </div>
      </header>

      <WarehousesView />
    </div>
  );
}
