import Link from "next/link";

// نتیجه پرداخت — پارامتر پویا
export const instant = false;

/** نتیجه پرداخت — مقصد کال‌بک درگاه */
export default async function PayResultPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; kind?: string; id?: string; reason?: string }>;
}) {
  const { ok, kind, id, reason } = await searchParams;
  const success = ok === "1";

  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <div
          className={`mx-auto size-14 grid place-items-center rounded-full text-2xl ${
            success ? "bg-ledger-green/10 text-ledger-green" : "bg-alarm-soft text-alarm"
          }`}
        >
          {success ? "✓" : "×"}
        </div>

        <h1 className="mt-4 font-bold text-lg">
          {success ? "پرداخت انجام شد" : "پرداخت ناموفق"}
        </h1>

        <p className="mt-2 text-sm text-ink-soft leading-6">
          {success
            ? kind === "wallet"
              ? "کیف پول شما شارژ شد."
              : "پیش‌فاکتور شما پرداخت و فاکتور صادر شد."
            : reason ?? "پرداخت کامل نشد — می‌توانید دوباره تلاش کنید."}
        </p>

        <div className="mt-5 flex flex-col gap-2">
          {success && kind === "order" && id && (
            <Link href={`/orders/${id}`} className="btn btn-primary w-full">
              مشاهده سند
            </Link>
          )}
          {success && kind === "wallet" && (
            <Link href="/wallet" className="btn btn-primary w-full">
              مشاهده کیف پول
            </Link>
          )}
          {!success && (
            <Link href="/orders" className="btn btn-primary w-full">
              اسناد من
            </Link>
          )}
          <Link href="/catalog" className="btn btn-ghost w-full">
            ادامه خرید
          </Link>
        </div>
      </div>
    </main>
  );
}
