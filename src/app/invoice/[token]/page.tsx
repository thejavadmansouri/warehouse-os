// سند رسمی عمومی با توکن — بدون نیاز به لاگین
export const instant = false;

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { faDate } from "@/lib/date";
import { formatToman, toFaDigits, numberToFaWords } from "@/lib/digits";
import { ORDER_STATUS } from "@/lib/status";
import { PrintButton } from "./print-button";

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    include: {
      items: true,
      shipping: true,
      customer: {
        select: {
          companyName: true,
          contactName: true,
          phone: true,
          nationalId: true,
          address: true,
        },
      },
    },
  });

  if (!order) notFound();

  const st = ORDER_STATUS[order.status] ?? ORDER_STATUS.PROFORMA;
  const isPaid = order.status === "PAID" || order.status === "APPROVED_CREDIT";

  return (
    <main className="min-h-dvh py-4 sm:py-8 px-2 sm:px-4 flex justify-center bg-paper">
      <div className="print-sheet card w-full max-w-[50rem] p-4 sm:p-8 bg-[#fffefb] border border-rule shadow-md text-ink">
        {/* نوار بالایی ابزار در صفحه وب (مخفی در پرینت) */}
        <div className="no-print mb-6 pb-4 border-b border-rule flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-soft">لینک اشتراک امن پیش‌فاکتور:</span>
            <span className="nums text-xs font-bold text-brass bg-brass-soft/40 px-2 py-0.5 rounded-[2px]">
              {order.number}
            </span>
          </div>
          <PrintButton />
        </div>

        {/* سربرگ رسمی سند */}
        <header className="border-b-2 border-ink pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-14 bg-ink text-paper rounded-[3px] flex flex-col items-center justify-center font-bold">
                <span className="text-xl leading-none">کاردو</span>
                <span className="text-[9px] tracking-widest text-brass mt-0.5">B2B</span>
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight">
                  شرکت کاردو دیار کریمان (سهامی خاص)
                </h1>
                <p className="text-xs text-ink-soft mt-0.5">
                  مرکز تأمین و توزیع عمده قطعات یدکی خودرو — کرمان
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-ink-soft mt-1 nums">
                  <span>شناسه ملی: ۱۰۸۶۱۴۳۹۲۵۱</span>
                  <span>کد اقتصادی: ۴۱۱۴۹۶۳۸۲۷۱۴</span>
                  <span>شماره ثبت: ۱۸۴۲۹</span>
                </div>
              </div>
            </div>

            <div className="border border-rule rounded-[3px] p-2.5 bg-paper/60 sm:min-w-[12rem] text-start sm:text-end text-xs">
              <div className="flex justify-between sm:justify-end gap-2 text-[11px] text-ink-soft">
                <span>نوع سند:</span>
                <span className="font-bold text-ink">
                  {order.status === "PAID" ? "فاکتور رسمی فروش" : "پیش‌فاکتور معتبر"}
                </span>
              </div>
              <div className="flex justify-between sm:justify-end gap-2 mt-1">
                <span className="text-ink-soft">شماره سند:</span>
                <span className="font-bold nums text-sm">{order.number}</span>
              </div>
              <div className="flex justify-between sm:justify-end gap-2 mt-1 text-[11px]">
                <span className="text-ink-soft">تاریخ صدور:</span>
                <span className="nums">{faDate(order.createdAt)}</span>
              </div>
              {order.expiresAt && (
                <div className="flex justify-between sm:justify-end gap-2 mt-1 text-[11px]">
                  <span className="text-ink-soft">اعتبار تا:</span>
                  <span className="nums">{faDate(order.expiresAt)}</span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* مشخصات طرفین معامله */}
        <section className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* فروشنده */}
          <div className="border border-rule rounded-[3px] p-3 bg-paper-raised/40">
            <span className="label font-bold text-ink border-b border-rule pb-1 block mb-2">
              مشخصات فروشنده
            </span>
            <p className="font-bold">شرکت کاردو دیار کریمان</p>
            <p className="text-ink-soft mt-1">
              نشانی: کرمان، بلوار جمهوری، شهرک صنعتی شماره ۲، مجتمع کاردو
            </p>
            <div className="flex justify-between mt-2 pt-1 text-[11px] text-ink-soft border-t border-rule/50 nums">
              <span>تلفن: ۰۳۴-۳۳۲۲۴۴۵۵</span>
              <span>کد پستی: ۷۶۱۸۸۳۳۲۲۱</span>
            </div>
          </div>

          {/* خریدار */}
          <div className="border border-rule rounded-[3px] p-3 bg-paper-raised/40">
            <div className="flex items-center justify-between border-b border-rule pb-1 mb-2">
              <span className="label font-bold text-ink">مشخصات خریدار</span>
              <span className={`stamp text-[10px] ${st.tone === "green" ? "text-ledger-green" : st.tone === "red" ? "text-alarm" : "text-brass"}`}>
                {st.label}
              </span>
            </div>
            <p className="font-bold">{order.customer.companyName}</p>
            <p className="text-ink-soft mt-1">نماینده: {order.customer.contactName}</p>
            <p className="text-ink-soft mt-0.5">
              نشانی: {order.customer.address || "آدرس در پرونده مشتری ثبت شده است"}
            </p>
            <div className="flex justify-between mt-2 pt-1 text-[11px] text-ink-soft border-t border-rule/50 nums">
              <span>تلفن: {order.customer.phone}</span>
              <span>کد/شناسه ملی: {order.customer.nationalId || "—"}</span>
            </div>
          </div>
        </section>

        {/* جدول اقلام */}
        <div className="mt-4 border border-rule rounded-[3px] overflow-hidden">
          <table className="w-full text-xs text-start">
            <thead className="bg-brass-soft/40 border-b border-rule text-ink-soft text-[11px]">
              <tr>
                <th className="py-2.5 px-3 text-center w-10">ردیف</th>
                <th className="py-2.5 px-3 text-start">شرح کالا یا خدمات</th>
                <th className="py-2.5 px-3 text-center w-24">کد فنی (SKU)</th>
                <th className="py-2.5 px-3 text-center w-20">تعداد / واحد</th>
                <th className="py-2.5 px-3 text-end w-28">قیمت واحد (تومان)</th>
                <th className="py-2.5 px-3 text-end w-20">تخفیف</th>
                <th className="py-2.5 px-3 text-end w-32">مبلغ کل (تومان)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/50">
              {order.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-paper/30">
                  <td className="py-2.5 px-3 text-center nums text-ink-soft">{toFaDigits(idx + 1)}</td>
                  <td className="py-2.5 px-3">
                    <p className="font-medium text-[12px]">{item.name}</p>
                  </td>
                  <td className="py-2.5 px-3 text-center nums font-mono text-[11px] text-ink-soft">
                    {item.sku}
                  </td>
                  <td className="py-2.5 px-3 text-center nums">
                    {toFaDigits(item.qty)} {item.unit}
                  </td>
                  <td className="py-2.5 px-3 text-end nums">{formatToman(item.unitPrice)}</td>
                  <td className="py-2.5 px-3 text-end nums text-[11px] text-brass">
                    {Number(item.discountPercent) > 0 ? `${toFaDigits(Number(item.discountPercent))}٪` : "۰"}
                  </td>
                  <td className="py-2.5 px-3 text-end nums font-bold">{formatToman(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* خلاصه مبالغ و اطلاعات ارسال */}
        <section className="mt-4 grid grid-cols-1 sm:grid-cols-[1.2fr_1fr] gap-4 text-xs">
          <div className="border border-rule rounded-[3px] p-3 text-ink-soft flex flex-col justify-between">
            <div>
              <p className="font-semibold text-ink mb-1">شیوه ارسال و تحویل:</p>
              <p className="text-xs">
                {order.shipping?.name ? `${order.shipping.name} (${order.shipping.note || "ارسال از انبار مرکزی"})` : "تحویل حضوری در انبار مرکزی کرمان"}
              </p>
              {order.note && (
                <p className="text-[11px] mt-2 bg-paper/60 p-2 rounded border border-rule/50">
                  یادداشت: {order.note}
                </p>
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-rule/50">
              <span className="text-[11px]">مبلغ به حروف:</span>
              <p className="font-bold text-ink mt-0.5 text-xs">
                {numberToFaWords(order.total)} تومان
              </p>
            </div>
          </div>

          <div className="border border-rule rounded-[3px] p-3 bg-paper-raised/40">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-soft">جمع ناخالص کالاها:</span>
                <span className="nums">{formatToman(order.subtotal)} ت</span>
              </div>

              {Number(order.discountTotal) > 0 && (
                <div className="flex justify-between text-ledger-green">
                  <span>مجموع تخفیف‌های اعمال‌شده:</span>
                  <span className="nums">− {formatToman(order.discountTotal)} ت</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-ink-soft">کرایه حمل و نقل:</span>
                <span className="nums">
                  {Number(order.shippingCost) === 0 ? "رایگان (پس‌کرایه)" : `${formatToman(order.shippingCost)} ت`}
                </span>
              </div>

              <div className="border-t-2 border-ink pt-2 mt-2 flex justify-between items-center text-sm font-bold">
                <span>مبلغ قابل پرداخت:</span>
                <span className="nums text-base text-brass">{formatToman(order.total)} تومان</span>
              </div>

              {isPaid && (
                <div className="pt-2 text-[11px] text-ledger-green flex justify-between font-medium">
                  <span>وضعیت پرداخت:</span>
                  <span>تسویه شده / ثبت در حسابداری</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* امضا و مهر طرفین */}
        <footer className="mt-8 pt-6 border-t border-rule grid grid-cols-2 gap-4 text-xs text-center">
          <div className="flex flex-col items-center justify-between min-h-[5rem]">
            <span className="text-ink-soft font-medium">مهر و امضای فروشنده (شرکت کاردو):</span>
            <div className="w-32 h-14 border border-dashed border-rule rounded flex items-center justify-center text-[10px] text-brass font-bold">
              [مهر و امضای رسمی کاردو]
            </div>
          </div>
          <div className="flex flex-col items-center justify-between min-h-[5rem]">
            <span className="text-ink-soft font-medium">امضا و تأیید خریدار:</span>
            <div className="w-32 h-14 border border-dashed border-rule rounded flex items-center justify-center text-[10px] text-ink-soft">
              {order.customer.companyName}
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
