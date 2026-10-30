import { requireAdminPage } from "@/lib/server-account";
import { RmaAdminView } from "./rma-admin-view";

export const metadata = {
  title: "مدیریت مرجوعی، گارانتی و RMA | کاردو B2B",
};

export default async function AdminRmaPage() {
  await requireAdminPage();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/70 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-ink">مرکز مدیریت مرجوعی و گارانتی قطعات (RMA)</h1>
          <p className="text-xs sm:text-sm text-ink-soft mt-1">
            بررسی خرابی فنی قطعات، مغایرت کد فنی، شکستگی باربری و عودت مستقیم به کیف پول همکاران
          </p>
        </div>
      </header>

      <RmaAdminView />
    </div>
  );
}
