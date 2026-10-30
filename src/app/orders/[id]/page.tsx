// داده‌ی شخصی/پویا — بدون پیش‌ساخت
export const instant = false;

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/server-account";
import { CustomerShell } from "@/components/customer-shell";
import { faDate, faDateTime } from "@/lib/date";
import { formatToman, toFaDigits } from "@/lib/digits";
import { ORDER_STATUS } from "@/lib/status";
import { PayPanel } from "./pay-panel";

const toneClass: Record<string, string> = {
  amber: "text-brass",
  green: "text-ledger-green",
  red: "text-alarm",
  ink: "text-ink",
};

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const acc = await requireCustomer();
  const { id } = await params;
  const { new: isNew } = await searchParams;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, shipping: true },
  });

  if (!order || order.customerId !== acc.customer.id) notFound();

  const st = ORDER_STATUS[order.status] ?? ORDER_STATUS.PROFORMA;
  const remaining = Number(order.total) - Number(order.paidWallet) - Number(order.paidGateway);

  return (
    <CustomerShell companyName={acc.customer.companyName} wallet={acc.wallet} active="orders">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-24">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label">{isNew ? "پیش‌فاکتور شما ثبت شد" : "سند"}</p>
            <h1 className="nums text-xl font-bold mt-1">{order.number}</h1>
            <p className="text-xs text-ink-soft mt-1">{faDateTime(order.createdAt)}</p>
          </div>
          <div className="text-end">
            <span className={`stamp ${toneClass[st.tone]}`}>{st.label}</span>
            <p className="text-[11px] text-ink-soft mt-2">
              <Link href={`/invoice/${order.publicToken}`} target="_blank" className="underline underline-offset-4">
                نسخه چاپی / لینک اشتراک
              </Link>
            </p>
          </div>
        </div>

        {isNew && order.status === "PROFORMA" && (
          <div className="mt-4 card border-brass/40 bg-brass-soft/50 px-4 py-3 text-xs leading-6">
            سند ثبت شد و موجودی تا <b>{order.expiresAt ? faDate(order.expiresAt) : "۲۴ ساعت"}</b> رزرو
            است. پرداخت را همین‌جا کامل کنید.
          </div>
        )}

        {/* جدول اقلام */}
        <div className="mt-5 card overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_4rem_7rem_7rem] gap-2 px-4 py-2 border-b border-rule bg-brass-soft/40 text-[11px] text-ink-soft">
            <span>قطعه</span>
            <span className="text-center">تعداد</span>
            <span className="text-left">قیمت واحد</span>
            <span className="text-left">جمع</span>
          </div>
          <ul>
            {order.items.map((item) => (
              <li
                key={item.id}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_4rem_7rem_7rem] gap-2 px-4 py-2.5 border-b border-rule/60 last:border-0 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{item.name}</p>
                  <p className="text-[10px] text-ink-soft nums">
                    {item.sku} · {item.unit}
                  </p>
                </div>
                <span className="nums text-center self-center">
                  {toFaDigits(item.qty)}
                  <span className="sm:hidden text-[10px] text-ink-soft"> {item.unit}</span>
                </span>
                <span className="hidden sm:block nums text-left self-center">{formatToman(item.unitPrice)}</span>
                <span className="hidden sm:block nums text-left self-center font-bold">
                  {formatToman(item.lineTotal)}
                </span>
                <span className="sm:hidden nums text-end self-center font-bold">
                  {formatToman(item.lineTotal)}
                </span>
              </li>
            ))}
          </ul>

          <div className="px-4 py-3 text-sm border-t border-rule bg-paper/60">
            <Row label="جمع کالاها" value={formatToman(order.subtotal)} />
            {Number(order.discountTotal) > 0 && (
              <Row label="تخفیف" value={`− ${formatToman(order.discountTotal)}`} tone="green" />
            )}
            <Row
              label={`ارسال — ${order.shipping?.name ?? "—"}`}
              value={Number(order.shippingCost) === 0 ? "رایگان" : formatToman(order.shippingCost)}
            />
            <div className="flex justify-between items-baseline border-t border-rule mt-2 pt-2">
              <span className="font-bold">مبلغ کل</span>
              <span className="nums text-lg font-bold">
                {formatToman(order.total)} <span className="text-[11px] font-normal">تومان</span>
              </span>
            </div>
            {Number(order.paidWallet) > 0 && (
              <Row label="پرداخت از کیف پول" value={formatToman(order.paidWallet)} tone="green" />
            )}
            {Number(order.paidGateway) > 0 && (
              <Row label="پرداخت آنلاین" value={formatToman(order.paidGateway)} tone="green" />
            )}
            {order.status === "AWAITING_CREDIT_APPROVAL" && (
              <Row label="درخواست اعتباری" value={formatToman(order.creditAmount)} tone="amber" />
            )}
            {order.status === "APPROVED_CREDIT" && (
              <Row
                label={`اعتباری — سررسید ${order.creditDueAt ? faDate(order.creditDueAt) : ""}`}
                value={formatToman(order.creditAmount)}
              />
            )}
          </div>
        </div>

        {order.status === "PROFORMA" && remaining > 0 && (
          <PayPanel
            orderId={order.id}
            remaining={remaining}
            wallet={acc.wallet}
            availableCredit={acc.availableCredit}
            expiresAt={order.expiresAt ? order.expiresAt.toISOString() : null}
          />
        )}

        {order.note && (
          <p className="mt-3 text-xs text-ink-soft">یادداشت: {order.note}</p>
        )}
      </div>
    </CustomerShell>
  );
}

function Row(props: { label: string; value: string; tone?: "green" | "amber" }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-ink-soft">{props.label}</span>
      <span
        className={`nums ${
          props.tone === "green" ? "text-ledger-green" : props.tone === "amber" ? "text-brass" : ""
        }`}
      >
        {props.value}
      </span>
    </div>
  );
}
