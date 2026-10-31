import { requireAdminPage } from "@/lib/server-account";
import { WarehouseView } from "./warehouse-view";

export const instant = false;

export const metadata = {
  title: "پنل جمع‌آوری و بسته‌بندی انبار مرکزی کرمان | کاردو B2B",
};

export default async function AdminWarehousePage() {
  await requireAdminPage();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/70 pb-4 print:hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-ink">برگه جمع‌آوری انبار مرکزی کرمان (Warehouse Pick List)</h1>
          <p className="text-xs sm:text-sm text-ink-soft mt-1">
            تجمیع اقلام سفارش‌های تسویه‌شده جهت خروج یکپارچه از قفسه‌های انبار و تفکیک باربری
          </p>
        </div>
      </header>

      <WarehouseView />
    </div>
  );
}
