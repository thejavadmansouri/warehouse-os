import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/server-account";
import { faDate } from "@/lib/date";
import { toFaDigits } from "@/lib/digits";
import Link from "next/link";
import { PrintButton } from "@/app/invoice/[token]/print-button";

export const instant = false;

export const metadata = {
  title: "برچسب باربری و الصاق روی کارتن | کاردو B2B",
};

export default async function ShippingLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const acc = await requireCustomer();
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      shipping: true,
      shipment: true,
      items: true,
    },
  });

  if (!order || order.customerId !== acc.customer.id) notFound();

  const totalQty = order.items.reduce((sum, it) => sum + it.qty, 0);

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white text-slate-900 p-4 sm:p-8 font-sans flex flex-col items-center justify-center" dir="rtl">
      {/* نوار اقدام */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/orders/${order.id}`}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 transition-colors"
        >
          ← بازگشت
        </Link>
        <PrintButton />
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('print-btn')?.addEventListener('click', () => window.print());`,
        }}
      />

      {/* لیبل حرارتی استاندارد باربری ۱۰x۱۵ */}
      <div className="w-[100mm] min-h-[145mm] max-w-full bg-white border-2 border-dashed border-slate-800 print:border-solid print:border-2 p-5 shadow-2xl print:shadow-none flex flex-col justify-between text-xs leading-relaxed select-none">
        {/* سربرگ لیبل */}
        <div className="border-b-2 border-slate-900 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-9 grid place-items-center bg-slate-900 text-white font-black text-lg rounded-md">
              ک
            </span>
            <div>
              <div className="font-black text-sm text-slate-900 tracking-tight">کاردو دیار کریمان</div>
              <div className="text-[10px] text-slate-500 font-bold">حواله رسمی ارسال قطعات خودرو</div>
            </div>
          </div>

          <div className="text-left font-mono">
            <div className="font-bold text-xs">{order.number}</div>
            <div className="text-[10px] text-slate-500 nums">{faDate(order.createdAt)}</div>
          </div>
        </div>

        {/* اطلاعات فرستنده */}
        <div className="py-2.5 border-b border-slate-300 text-[11px] space-y-1">
          <div className="font-black text-slate-700 flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-slate-700" />
            فرستنده:
          </div>
          <div className="font-bold text-slate-900">انبار مرکزی شرکت کاردو B2B</div>
          <div className="text-slate-600 text-[10px]">کرمان، شهرک صنعتی شماره ۲ (خضراء)، فاز قطعات خودرو</div>
          <div className="font-mono text-[10px] text-slate-700">تلفن هماهنگی: ۰۳۴-۳۳۲۲۴۴۵۵</div>
        </div>

        {/* اطلاعات گیرنده (برجسته و خوانا) */}
        <div className="py-3 border-b-2 border-slate-900 bg-slate-50/80 -mx-5 px-5 space-y-1.5">
          <div className="font-black text-blue-900 flex items-center gap-1 text-xs">
            <span className="size-2 rounded-full bg-blue-700" />
            گیرنده (تحویل‌گیرنده بار):
          </div>
          <div className="font-black text-base text-slate-950">{order.customer.companyName}</div>
          <div className="font-bold text-xs text-slate-800">
            تحویل‌گیرنده: {order.customer.contactName || "مسئول انبار همکار"}
          </div>
          <div className="font-mono font-bold text-sm text-slate-900" dir="ltr">
            موبایل: {order.customer.phone}
          </div>
          <div className="text-[11px] text-slate-700 pt-0.5">
            نشانی مقصد: {order.customer.address || "انبار مقصد همکار در شهرستان"}
          </div>
        </div>

        {/* مشخصات باربری و بیجک */}
        <div className="py-2.5 border-b border-slate-300 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-slate-500 font-medium">روش ارسال: </span>
            <span className="font-bold text-slate-900">{order.shipping?.name || "باربری کرمان"}</span>
          </div>
          <div>
            <span className="text-slate-500 font-medium">شماره بیجک: </span>
            <span className="font-mono font-bold text-slate-900">
              {order.shipment?.waybillNumber || "ثبت در باربری"}
            </span>
          </div>
          <div>
            <span className="text-slate-500 font-medium">تعداد اقلام: </span>
            <span className="font-bold text-slate-900 nums">{toFaDigits(order.items.length)} ردیف</span>
          </div>
          <div>
            <span className="text-slate-500 font-medium">مجموع قطعات: </span>
            <span className="font-black text-slate-900 nums">{toFaDigits(totalQty)} قطعه</span>
          </div>
        </div>

        {/* بارکد سفارش و علائم احتیاط */}
        <div className="pt-3 text-center space-y-2">
          {/* شبیه‌ساز بارکد میله‌ای Code 128 */}
          <div className="flex items-center justify-center gap-0.5 h-10 overflow-hidden px-4 opacity-90">
            {Array.from({ length: 48 }).map((_, i) => (
              <span
                key={i}
                className="h-full bg-slate-950"
                style={{ width: `${(i % 3) + 1.2}px`, marginLeft: `${(i % 2) * 1.5}px` }}
              />
            ))}
          </div>
          <div className="font-mono font-bold text-xs tracking-widest text-slate-800">{order.number}</div>

          {/* علائم استاندارد حمل قطعات حساس */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-around text-[10px] text-slate-600 font-bold">
            <span>☂️ دور از رطوبت</span>
            <span>⬆️ جهت صحیح کارتن</span>
            <span>⚠️ قطعات حساس خودرو</span>
          </div>
        </div>
      </div>
    </div>
  );
}
