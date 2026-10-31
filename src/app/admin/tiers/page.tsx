import { requireAdminPage } from "@/lib/server-account";
import { TiersView } from "./tiers-view";

export const instant = false;

export const metadata = {
  title: "مدیریت سطوح همکاری و تخفیف‌های B2B | کاردو B2B",
};

export default async function AdminTiersPage() {
  await requireAdminPage();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/70 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-ink">مدیریت سطوح همکاری و تخفیف‌های B2B</h1>
          <p className="text-xs sm:text-sm text-ink-soft mt-1">
            تعریف گروه‌های همکاران (عمده‌فروشان، فروشگاه‌ها، تعمیرگاه‌ها)، سقف اعتبار و درصد تخفیف‌های پایه
          </p>
        </div>
      </header>

      <TiersView />
    </div>
  );
}
