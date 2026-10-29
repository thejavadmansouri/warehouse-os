import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CustomersPanel } from "@/app/admin/customers-panel";
import { AdminCreateForm } from "@/app/admin/admin-create-form";

// این پنل برای همه‌ی بازدیدکننده‌ها شخصی است — رندر مسدودی، بدون پیش-ساخت
export const instant = false;

/*
 * پنل ادمین فاز ۱ — تأیید مشتری‌های در انتظار + ساخت دستی مشتری تلفنی.
 * لیست مستقیم از DB (سرور کامپوننت)؛ اکشن‌ها از API میدرود.
 */
export default async function AdminPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token ?? "");

  if (session?.role !== "admin") redirect("/login");

  const [pending, actives] = await Promise.all([
    prisma.customer.findMany({
      where: { status: "PENDING", deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, companyName: true, contactName: true, phone: true, createdAt: true, nationalId: true },
    }),
    prisma.customer.findMany({
      where: { status: { in: ["ACTIVE", "BLOCKED"] }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, companyName: true, contactName: true, phone: true, status: true, username: true, tier: { select: { name: true } } },
    }),
  ]);

  return (
    <main className="flex-1 mx-auto w-full max-w-2xl flex flex-col gap-8 px-5 py-8">
      <header>
        <h1 className="text-xl font-bold">پنل ادمین کاردو B2B</h1>
        <p className="text-sm text-muted">مدیریت مشتری‌های عمده — فاز ۱</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-bold flex items-center gap-2">
          در انتظار تأیید
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            {pending.length.toString()}
          </span>
        </h2>
        <CustomersPanel initial={pending.map(c => ({ ...c, createdAt: c.createdAt.toISOString() }))} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-bold">مشتری‌های فعال/مسدود</h2>
        <AdminCreateForm />
        <ul className="flex flex-col gap-2">
          {actives.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{c.companyName}</p>
                <p className="text-xs text-muted truncate" dir="ltr">
                  {c.phone} {c.username ? `· ${c.username}` : ""} {c.tier?.name ? `· ${c.tier.name}` : ""}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                  c.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
                }`}
              >
                {c.status === "ACTIVE" ? "فعال" : "مسدود"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
