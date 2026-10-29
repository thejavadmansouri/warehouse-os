import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/session";
import { toFaDigits } from "@/lib/digits";
import { LogoutButton } from "@/app/dashboard/logout-button";

// داشبورد اختصاصی هر مشتری است — رندر مسدودی (پیش-ساختی ندارد)
export const instant = false;

/*
 * داشبورد فاز ۱ — فقط «وضعیت حساب».
 * هرگز از توکن وضعیت نمی‌خوانیم؛ حقیقت از DB می‌آید تا تأیید ادمین فوری اثر کند.
 */
export default async function DashboardPage() {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token ?? "");

  const customer = session
    ? await prisma.customer.findUnique({
        where: { id: session.sub },
        select: { id: true, companyName: true, contactName: true, phone: true, status: true, tier: { select: { name: true } } },
      })
    : null;

  if (!customer) {
    return <p className="m-auto text-muted">نشست نامعتبر — دوباره وارد شوید.</p>;
  }

  const statusMap: Record<string, { title: string; note: string; color: string }> = {
    PENDING: {
      title: "در انتظار تأیید ادمین",
      note: "حساب شما ساخته شده و در صف تأیید است. به‌محض تأیید، قیمت‌ها و موجودی فعال می‌شود. معمولاً کمتر از یک روز کاری طول می‌کشد.",
      color: "bg-amber-50 border-amber-200 text-amber-800",
    },
    ACTIVE: {
      title: "حساب فعال است",
      note: "کاتالوگ و قیمت‌گذاری عمده در فاز ۲ از همین‌جا فعال می‌شود.",
      color: "bg-green-50 border-green-200 text-green-800",
    },
    REJECTED: {
      title: "درخواست شما رد شد",
      note: "برای پیگیری با فروشگاه تماس بگیرید.",
      color: "bg-red-50 border-red-200 text-red-700",
    },
    BLOCKED: {
      title: "حساب مسدود شده",
      note: "دسترسی موقتاً بسته است. با فروشگاه تماس بگیرید.",
      color: "bg-red-50 border-red-200 text-red-700",
    },
  };

  const status = statusMap[customer.status] ?? statusMap.PENDING;
  const tierName = customer.tier?.name ?? "—";

  return (
    <main className="flex-1 flex flex-col gap-6 px-5 py-8 max-w-xl w-full mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg">{customer.companyName}</h1>
          <p className="text-sm text-muted">
            {customer.contactName} · <span dir="ltr">{toFaDigits(customer.phone)}</span>
          </p>
        </div>
        <LogoutButton />
      </header>

      <section className={`rounded-2xl border p-5 leading-7 ${status.color}`}>
        <h2 className="font-bold text-base mb-1">{status.title}</h2>
        <p className="text-sm">{status.note}</p>
      </section>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-slate-200 p-4">
          <dt className="text-muted">طبقه مشتری</dt>
          <dd className="font-bold mt-1">{tierName}</dd>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <dt className="text-muted">وضعیت</dt>
          <dd className="font-bold mt-1">{customer.status === "ACTIVE" ? "فعال" : "در انتظار"}</dd>
        </div>
      </dl>

      <p className="text-xs text-muted text-center">
        کاتالوگ، استعلام و پیش‌فاکتور در فازهای بعدی همین صفحه فعال می‌شوند.
      </p>
    </main>
  );
}
