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
import { SHIPMENT_STATUS_MAP, FREIGHT_PAYMENT_LABELS } from "@/lib/logistics";
import { PayPanel } from "./pay-panel";

const toneClass: Record<string, string> = {
  amber: "text-amber-700 bg-amber-50 border border-amber-200",
  green: "text-emerald-700 bg-emerald-50 border border-emerald-200",
  red: "text-rose-700 bg-rose-50 border border-rose-200",
  ink: "text-slate-700 bg-slate-100 border border-slate-200",
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
    include: { items: true, shipping: true, shipment: true, rmaRequests: true },
  });

  if (!order || order.customerId !== acc.customer.id) notFound();

  const st = ORDER_STATUS[order.status] ?? ORDER_STATUS.PROFORMA;
  const remaining = Number(order.total) - Number(order.paidWallet) - Number(order.paidGateway);

  return (
    <CustomerShell
      companyName={acc.customer.companyName}
      contactName={acc.customer.contactName}
      phone={acc.customer.phone}
      tierName={acc.customer.tier?.name}
      tierDiscount={acc.tierDiscount}
      wallet={acc.wallet}
      availableCredit={acc.availableCredit}
      active="orders"
    >
      <div className="mx-auto w-full max-w-4xl px-3 sm:px-6 py-6 pb-24">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/orders" prefetch={false} className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium">
                <span>←</span>
                <span>فهرست اسناد</span>
              </Link>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-500">{isNew ? "پیش‌فاکتور جدید" : "سند رسمی"}</span>
            </div>
            <h1 className="nums text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">{order.number}</h1>
            <p className="text-xs text-slate-500 mt-1">{faDateTime(order.createdAt)}</p>
          </div>
          <div className="text-end">
            <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${toneClass[st.tone]}`}>{st.label}</span>
            <div className="flex flex-col items-end gap-1.5 mt-2">
              <Link href={`/invoice/${order.publicToken}`} target="_blank" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
                <span>نسخه چاپی A4</span>
                <span>↗</span>
              </Link>
              <Link href={`/orders/${order.id}/tax-invoice`} target="_blank" className="text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors">
                <span>📄 صورت‌حساب رسمی سامانه مودیان</span>
                <span>↗</span>
              </Link>
              <Link href={`/orders/${order.id}/shipping-label`} target="_blank" className="text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors">
                <span>🏷️ برچسب باربری کارتن (۱۰×۱۵)</span>
                <span>↗</span>
              </Link>
            </div>
          </div>
        </div>

        {isNew && order.status === "PROFORMA" && (
          <div className="mt-4 p-4 card border-blue-200 bg-blue-50/60 rounded-xl text-xs leading-6 text-blue-900">
            سند با موفقیت ثبت شد و موجودی قطعات تا تاریخ <b>{order.expiresAt ? faDate(order.expiresAt) : "۲۴ ساعت"}</b> در انبار مرکزی کرمان رزرو گردید.
          </div>
        )}

        {/* کارت رهگیری بیجک و وضعیت ارسال باربری کرمان */}
        {order.shipment && (
          <div className="mt-4 card p-4 sm:p-5 bg-white border-blue-200 shadow-2xs rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                <h3 className="font-extrabold text-sm text-slate-900">وضعیت ارسال و حواله باربری کرمان</h3>
              </div>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                  SHIPMENT_STATUS_MAP[order.shipment.status]?.badgeClass || "bg-slate-100 text-slate-700"
                }`}
              >
                {SHIPMENT_STATUS_MAP[order.shipment.status]?.label || order.shipment.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200/70">
              <div>
                <span className="text-slate-500">شرکت باربری / حامل:</span>
                <p className="font-bold text-slate-800 mt-0.5">{order.shipment.carrierName}</p>
                {order.shipment.carrierPhone && (
                  <p className="text-slate-400 font-mono nums mt-0.5">{order.shipment.carrierPhone}</p>
                )}
              </div>

              <div>
                <span className="text-slate-500">شماره بیجک / بارنامه:</span>
                <p className="font-black text-sm text-blue-700 mt-0.5 nums">
                  {order.shipment.waybillNumber ? toFaDigits(order.shipment.waybillNumber) : "در حال صدور توسط باربری"}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {FREIGHT_PAYMENT_LABELS[order.shipment.freightPaymentType] || order.shipment.freightPaymentType}
                </p>
              </div>

              <div>
                <span className="text-slate-500">شهر مقصد در استان کرمان:</span>
                <p className="font-bold text-slate-800 mt-0.5">{order.shipment.destinationCity}</p>
                {order.shipment.shippedAt && (
                  <p className="text-slate-500 nums mt-0.5">
                    تحویل باربری: {faDate(order.shipment.shippedAt)}
                  </p>
                )}
              </div>
            </div>

            {order.shipment.adminNote && (
              <p className="text-xs text-slate-600 bg-blue-50/50 p-2.5 rounded-lg border border-blue-100">
                <b>یادداشت ارسال:</b> {order.shipment.adminNote}
              </p>
            )}
          </div>
        )}

        {/* دکمه ثبت درخواست مرجوعی برای فاکتورهای تسویه‌شده */}
        {(order.status === "PAID" || order.status === "APPROVED_CREDIT") && (
          <div className="mt-3 flex items-center justify-between bg-slate-100/70 px-4 py-2.5 rounded-xl text-xs text-slate-600 border border-slate-200/70">
            <span>آیا قطعه‌ای با نقص فنی، شکستگی یا مغایرت دریافت کرده‌اید؟</span>
            <Link
              href="/rma"
              prefetch={false}
              className="text-blue-600 font-bold hover:underline flex items-center gap-1"
            >
              <span>ثبت درخواست گارانتی / مرجوعی (RMA)</span>
              <span>←</span>
            </Link>
          </div>
        )}

        {/* لیست اقلام فاکتور — بهینه‌شده برای موبایل و دسکتاپ */}
        <div className="mt-5 card overflow-hidden border-slate-200 rounded-xl bg-white shadow-2xs">
          <div className="hidden sm:grid grid-cols-[1fr_5rem_8rem_8rem] gap-2 px-5 py-3 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            <span>شرح قطعه و مشخصات</span>
            <span className="text-center">تعداد</span>
            <span className="text-left">قیمت واحد</span>
            <span className="text-left">جمع ردیف</span>
          </div>

          <ul className="divide-y divide-slate-100">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="p-4 sm:px-5 sm:py-3.5 sm:grid sm:grid-cols-[1fr_5rem_8rem_8rem] sm:items-center gap-2 hover:bg-slate-50/60 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500 nums mt-0.5">
                    کد فنی: <span className="font-mono">{item.sku}</span> · واحد: {item.unit}
                  </p>
                </div>

                <div className="mt-2 sm:mt-0 flex items-center justify-between sm:justify-center text-xs">
                  <span className="sm:hidden text-slate-500">تعداد:</span>
                  <span className="nums font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded sm:bg-transparent">
                    {toFaDigits(item.qty)} {item.unit}
                  </span>
                </div>

                <div className="mt-1 sm:mt-0 flex items-center justify-between sm:justify-start sm:text-left text-xs nums">
                  <span className="sm:hidden text-slate-500">قیمت واحد:</span>
                  <span className="text-slate-700">{formatToman(item.unitPrice)} ت</span>
                </div>

                <div className="mt-1 sm:mt-0 flex items-center justify-between sm:justify-start sm:text-left text-xs nums">
                  <span className="sm:hidden text-slate-500 font-bold">جمع:</span>
                  <span className="font-extrabold text-sm text-slate-900">{formatToman(item.lineTotal)} ت</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="p-4 sm:p-5 text-xs sm:text-sm border-t border-slate-200 bg-slate-50/70 space-y-2">
            <Row label="جمع ناخالص کالاها" value={`${formatToman(order.subtotal)} تومان`} />
            {Number(order.discountTotal) > 0 && (
              <Row label="تخفیف همکاری" value={`− ${formatToman(order.discountTotal)} تومان`} tone="green" />
            )}
            <Row
              label={`کرایه ارسال باربری (${order.shipping?.name ?? "پیش‌فرض"})`}
              value={Number(order.shippingCost) === 0 ? "رایگان" : `${formatToman(order.shippingCost)} تومان`}
            />
            <div className="flex justify-between items-baseline border-t border-slate-200 pt-2.5 font-bold">
              <span className="text-slate-900 text-sm sm:text-base">مبلغ کل سند:</span>
              <span className="nums text-lg sm:text-xl font-extrabold text-blue-600">
                {formatToman(order.total)} <span className="text-xs font-normal text-slate-500">تومان</span>
              </span>
            </div>
            {Number(order.paidWallet) > 0 && (
              <Row label="پرداخت‌شده از کیف پول" value={`${formatToman(order.paidWallet)} تومان`} tone="green" />
            )}
            {Number(order.paidGateway) > 0 && (
              <Row label="پرداخت‌شده از درگاه بانکی" value={`${formatToman(order.paidGateway)} تومان`} tone="green" />
            )}
          </div>
        </div>

        {/* پنل پرداخت در صورتی که سند در وضعیت پیش‌فاکتور و دارای باقیمانده باشد */}
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
          <div className="mt-4 p-3.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-600">
            <b>یادداشت سفارش:</b> {order.note}
          </div>
        )}
      </div>
    </CustomerShell>
  );
}

function Row(props: { label: string; value: string; tone?: "green" | "amber" }) {
  return (
    <div className="flex justify-between py-1 text-slate-600 text-xs sm:text-sm">
      <span>{props.label}</span>
      <span
        className={`nums font-bold ${
          props.tone === "green" ? "text-emerald-600" : props.tone === "amber" ? "text-amber-600" : "text-slate-800"
        }`}
      >
        {props.value}
      </span>
    </div>
  );
}
