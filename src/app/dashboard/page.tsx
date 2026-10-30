import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { toFaDigits } from "@/lib/digits";
import { LogoutButton } from "@/app/dashboard/logout-button";

// داشبورد اختصاصی هر مشتری است — رندر مسدودی (پیش‌ساختی ندارد)
export const instant = false;

/*
 * وضعیت حساب — برای مشتریِ در انتظار تأیید.
 * حقیقت همیشه از DB خوانده می‌شود تا تأیید ادمین فوری اثر کند.
 */
export default async function DashboardPage() {
  await connection();

  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token ?? "");

  const customer = session
    ? await prisma.customer.findUnique({
        where: { id: session.sub },
        select: {
          id: true,
          companyName: true,
          contactName: true,
          phone: true,
          status: true,
          tier: { select: { name: true } },
        },
      })
    : null;

  if (!customer) {
    return (
      <main className="min-h-dvh grid place-items-center px-4">
        <div className="card p-6 text-center">
          <p className="text-sm text-ink-soft">نشست نامعتبر — دوباره وارد شوید.</p>
          <Link href="/login" className="btn btn-primary mt-4 px-5 py-2 text-sm">
            ورود
          </Link>
        </div>
      </main>
    );
  }

  const statusMap: Record<string, { title: string; note: string; tone: string }> = {
    PENDING: {
      title: "در انتظار تأیید ادمین",
      note: "حساب ساخته شده و در صف تأیید است. به‌محض تأیید، قیمت‌ها و موجودی فعال می‌شود — معمولاً کمتر از یک روز کاری.",
      tone: "border-brass/40 bg-brass-soft/50 text-brass",
    },
    ACTIVE: {
      title: "حساب فعال است",
      note: "کاتالوگ، قیمت‌های عمده و پیش‌فاکتور برای شما باز است.",
      tone: "border-ledger-green/30 bg-ledger-green/5 text-ledger-green",
    },
    REJECTED: {
      title: "درخواست شما رد شد",
      note: "برای پیگیری با فروشگاه تماس بگیرید.",
      tone: "border-alarm/30 bg-alarm-soft text-alarm",
    },
    BLOCKED: {
      title: "حساب مسدود شده",
      note: "دسترسی موقتاً بسته است. با فروشگاه تماس بگیرید.",
      tone: "border-alarm/30 bg-alarm-soft text-alarm",
    },
  };

  const status = statusMap[customer.status] ?? statusMap.PENDING;

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto w-full max-w-lg px-4 h-14 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="size-7 grid place-items-center bg-ink text-paper text-sm font-bold rounded-[2px]">
              ک
            </span>
            <span className="font-bold tracking-tight text-sm">وضعیت حساب</span>
          </Link>
          <div className="ms-auto">
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-lg px-4 py-6">
        <p className="label">حساب</p>
        <h1 className="text-lg font-bold tracking-tight mt-1">{customer.companyName}</h1>
        <p className="text-xs text-ink-soft mt-1">
          {customer.contactName} · <span dir="ltr">{toFaDigits(customer.phone)}</span>
        </p>

        <section className={`mt-4 card border p-4 ${status.tone}`}>
          <h2 className="font-bold text-sm">{status.title}</h2>
          <p className="text-xs leading-6 mt-1">{status.note}</p>
        </section>

        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div className="card p-4">
            <dt className="label">طبقه مشتری</dt>
            <dd className="font-bold mt-1">{customer.tier?.name ?? "—"}</dd>
          </div>
          <div className="card p-4">
            <dt className="label">وضعیت</dt>
            <dd className="font-bold mt-1">
              {customer.status === "ACTIVE"
                ? "فعال"
                : customer.status === "PENDING"
                  ? "در انتظار"
                  : customer.status === "BLOCKED"
                    ? "مسدود"
                    : "رد شده"}
            </dd>
          </div>
        </dl>

        {customer.status === "ACTIVE" && (
          <Link href="/catalog" className="btn btn-primary w-full mt-4 py-3">
            ورود به کاتالوگ قطعات
          </Link>
        )}

        <p className="mt-4 text-[11px] text-ink-soft text-center leading-5">
          سؤال دارید؟ با فروشگاه کاردو در کرمان تماس بگیرید.
        </p>
      </div>
    </main>
  );
}
