import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { CustomersPanel } from "@/app/admin/customers-panel";
import { AdminCreateForm } from "@/app/admin/admin-create-form";
import { AdminCustomersTable } from "@/app/admin/customers-table";
import { toFaDigits } from "@/lib/digits";
import Link from "next/link";

// این پنل برای همه‌ی بازدیدکننده‌ها شخصی است — رندر مسدودی، بدون پیش-ساخت
export const instant = false;

/*
 * پنل ادمین — تأیید مشتری‌های در انتظار + ساخت دستی مشتری تلفنی و مدیریت ۳۶۰ درجه.
 */
export default async function AdminPage() {
  await connection();

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token ?? "");

  if (session?.role !== "admin") redirect("/login");

  const [pending, actives, orderCount, awaitingCredit, tiers] = await Promise.all([
    prisma.customer.findMany({
      where: { status: "PENDING", deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        companyName: true,
        contactName: true,
        phone: true,
        createdAt: true,
        nationalId: true,
      },
    }),
    prisma.customer.findMany({
      where: { status: { in: ["ACTIVE", "BLOCKED"] }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        companyName: true,
        contactName: true,
        phone: true,
        status: true,
        username: true,
        nationalId: true,
        tier: { select: { name: true } },
      },
    }),
    prisma.order.count(),
    prisma.order.count({ where: { status: "AWAITING_CREDIT_APPROVAL" } }),
    prisma.tier.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 pb-16 space-y-6">
      {/* تیتر و توضیحات بخش */}
      <div>
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
          مدیریت سامانه
        </p>
        <h1 className="text-xl font-black text-stone-900 mt-1">
          مدیریت مشتریان و پرونده‌های CRM همکاران
        </h1>
        <p className="text-xs text-stone-500 mt-0.5">
          بررسی صف تأیید، ثبت مشتری تلفنی، تحلیل رفتار خرید و رصد زنده قطعات جستجو شده
        </p>
      </div>

      {/* آمارهای کلیدی */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="در انتظار بررسی"
          value={pending.length}
          tone={pending.length ? "brass" : undefined}
          icon="⏳"
        />
        <Stat
          label="همکاران فعال"
          value={actives.filter((a) => a.status === "ACTIVE").length}
          icon="👥"
        />
        <Stat
          label="کل اسناد فاکتور"
          value={orderCount}
          icon="📑"
        />
        <Stat
          label="اعتباری در انتظار"
          value={awaitingCredit}
          tone={awaitingCredit ? "alarm" : undefined}
          icon="💳"
        />
      </div>

      {/* صف در انتظار تایید */}
      {pending.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm text-stone-900 flex items-center gap-2">
              <span>⚠️ مشتریان جدید در انتظار تأیید</span>
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-900 font-bold">
                {toFaDigits(pending.length)}
              </span>
            </h2>
          </div>

          <CustomersPanel
            initial={pending.map((c) => ({
              ...c,
              createdAt: c.createdAt.toISOString(),
            }))}
          />
        </section>
      )}

      {/* جدول مشتریان فعال و مسدود */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-sm text-stone-900">
              فهرست مشتریان و همکاران تجاری
            </h2>
            <p className="text-[11px] text-stone-500">
              جهت مشاهده رفتار خرید، سوابق فاکتور و تحلیل قطعات جستجو شده، روی نام یا دکمه پرونده ۳۶۰ کلیک کنید.
            </p>
          </div>
          <AdminCreateForm tiers={tiers} />
        </div>

        <AdminCustomersTable
          customers={actives.map((c) => ({
            id: c.id,
            companyName: c.companyName,
            contactName: c.contactName,
            phone: c.phone,
            status: c.status,
            username: c.username,
            nationalId: c.nationalId,
            tierName: c.tier?.name || null,
          }))}
        />

        {/* میانبرهای سریع ادمین */}
        <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-stone-200">
          <Link
            href="/admin/orders"
            className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 shadow-xs hover:bg-stone-50"
          >
            📋 بررسی اسناد و باربری فاکتورها
          </Link>
          <Link
            href="/admin/wallet"
            className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 shadow-xs hover:bg-stone-50"
          >
            💰 شارژ کیف پول و کنترل اعتبارات
          </Link>
          <Link
            href="/admin/products"
            className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 shadow-xs hover:bg-stone-50"
          >
            📦 انبار و مدیریت قطعات یدکی
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: "brass" | "alarm";
  icon?: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
        <span>{label}</span>
        {icon && <span className="text-base">{icon}</span>}
      </div>
      <p
        className={`nums text-2xl font-black mt-1 ${
          tone === "brass"
            ? "text-amber-600"
            : tone === "alarm"
            ? "text-rose-600"
            : "text-stone-900"
        }`}
      >
        {toFaDigits(value)}
      </p>
    </div>
  );
}
