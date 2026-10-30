import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { CustomersPanel } from "@/app/admin/customers-panel";
import { AdminCreateForm } from "@/app/admin/admin-create-form";
import { toFaDigits } from "@/lib/digits";
import Link from "next/link";

// این پنل برای همه‌ی بازدیدکننده‌ها شخصی است — رندر مسدودی، بدون پیش-ساخت
export const instant = false;

/*
 * پنل ادمین — تأیید مشتری‌های در انتظار + ساخت دستی مشتری تلفنی.
 */
export default async function AdminPage() {
  await connection();

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token ?? "");

  if (session?.role !== "admin") redirect("/login");

  const [pending, actives, orderCount, awaitingCredit] = await Promise.all([
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
        tier: { select: { name: true } },
      },
    }),
    prisma.order.count(),
    prisma.order.count({ where: { status: "AWAITING_CREDIT_APPROVAL" } }),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 pb-16">
      <p className="label">مدیریت</p>
      <h1 className="text-lg font-bold tracking-tight mt-1">مشتریان</h1>
      <p className="text-xs text-ink-soft mt-0.5">
        تأیید حساب‌های جدید، ساخت مشتری تلفنی و پیگیری وضعیت
      </p>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="در انتظار تأیید" value={pending.length} tone={pending.length ? "brass" : undefined} />
        <Stat label="مشتری فعال" value={actives.filter((a) => a.status === "ACTIVE").length} />
        <Stat label="کل اسناد" value={orderCount} />
        <Stat label="اعتباری در انتظار" value={awaitingCredit} tone={awaitingCredit ? "alarm" : undefined} />
      </div>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm">
            در انتظار تأیید{" "}
            <span className="nums text-brass">({toFaDigits(pending.length)})</span>
          </h2>
        </div>

        <div className="mt-2">
          <CustomersPanel
            initial={pending.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
          />
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-sm">مشتریان فعال / مسدود</h2>
          <AdminCreateForm />
        </div>

        <div className="mt-2 card overflow-hidden">
          {actives.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-soft">مشتری فعالی نیست.</p>
          ) : (
            <ul>
              {actives.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-rule/60 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.companyName}</p>
                    <p className="text-[11px] text-ink-soft truncate" dir="ltr">
                      {c.phone}
                      {c.username ? ` · ${c.username}` : ""}
                      {c.tier?.name ? ` · ${c.tier.name}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[11px] border rounded-[2px] px-2 py-0.5 ${
                      c.status === "ACTIVE"
                        ? "text-ledger-green border-ledger-green/30 bg-ledger-green/5"
                        : "text-alarm border-alarm/30 bg-alarm-soft"
                    }`}
                  >
                    {c.status === "ACTIVE" ? "فعال" : "مسدود"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/admin/orders" className="btn btn-ghost text-xs">
            بررسی اسناد
          </Link>
          <Link href="/admin/wallet" className="btn btn-ghost text-xs">
            شارژ کیف پول مشتری
          </Link>
          <Link href="/admin/products" className="btn btn-ghost text-xs">
            مدیریت محصولات
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "brass" | "alarm" }) {
  return (
    <div className="card px-3 py-2.5">
      <p className="label">{label}</p>
      <p
        className={`nums text-xl font-bold mt-0.5 ${
          tone === "brass" ? "text-brass" : tone === "alarm" ? "text-alarm" : ""
        }`}
      >
        {toFaDigits(value)}
      </p>
    </div>
  );
}
