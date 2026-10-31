"use client";

import Link from "next/link";
import { formatToman, toFaDigits } from "@/lib/digits";
import { faDate } from "@/lib/date";

export type TaxInvoiceProps = {
  order: {
    id: string;
    orderNumber: string;
    createdAt: string | Date;
    status: string;
    subtotal: number;
    discount: number;
    shippingCost: number;
    total: number;
    items: Array<{
      id: string;
      productName: string;
      sku: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
  };
  seller: {
    companyName: string;
    nationalId: string;
    economicCode: string;
    postalCode: string;
    address: string;
    phone: string;
  };
  buyer: {
    companyName: string;
    contactName?: string | null;
    nationalId?: string | null;
    phone: string;
    postalCode?: string | null;
    address?: string | null;
  };
  fiscalTaxId: string;
};

export function TaxInvoiceClient({ order, seller, buyer, fiscalTaxId }: TaxInvoiceProps) {
  // مالیات بر ارزش افزوده و عوارض قانونی (۱۰٪ قانون مالیات بر ارزش افزوده مصوب)
  const VAT_RATE = 0.10;
  const taxableAmount = Math.max(0, order.subtotal - order.discount);
  const vatAmount = Math.round(taxableAmount * VAT_RATE);
  const finalOfficialTotal = taxableAmount + vatAmount + order.shippingCost;

  const dateFa = faDate(new Date(order.createdAt));

  function downloadMoadianJson() {
    const payload = {
      header: {
        taxid: fiscalTaxId,
        inno: order.orderNumber,
        indatim: Math.floor(new Date(order.createdAt).getTime() / 1000),
        inty: 1, // صورت‌حساب الکترونیکی نوع اول
        inp: 1,  // الگوی فروش کالا
        ins: 1,  // نقدی / نسیه
        tprdis: order.subtotal,
        tdis: order.discount,
        tadis: taxableAmount,
        tvam: vatAmount,
        todam: 0,
        tbill: finalOfficialTotal,
      },
      seller: {
        tin: seller.economicCode,
        bid: seller.nationalId,
        postalCode: seller.postalCode,
      },
      buyer: {
        bid: buyer.nationalId || "0000000000",
        tin: buyer.nationalId || "0000000000",
        postalCode: buyer.postalCode || "0000000000",
      },
      body: order.items.map((i, idx) => {
        const itemTaxable = i.totalPrice;
        const itemVat = Math.round(itemTaxable * VAT_RATE);
        return {
          sstid: "2720000123456", // شناسه کالا استاندارد وزارت صمت
          sstt: i.productName,
          am: i.quantity,
          mu: i.unit,
          fee: i.unitPrice,
          prdis: i.totalPrice,
          dis: 0,
          adis: i.totalPrice,
          vra: 10,
          vam: itemVat,
          tsstam: itemTaxable + itemVat,
        };
      }),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Moadian-Tax-Invoice-${order.orderNumber}.json`;
    a.click();
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white text-slate-900 p-3 sm:p-8 font-sans" dir="rtl">
      {/* نوار اقدام بالا */}
      <div className="max-w-5xl mx-auto mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={`/orders/${order.id}`}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors flex items-center gap-1.5"
          >
            <span>←</span>
            <span>بازگشت به سند سفارش</span>
          </Link>
          <span className="text-xs text-slate-500 font-medium">
            صورت‌حساب رسمی الکترونیکی موضوع سامانه مودیان و ارزش افزوده
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={downloadMoadianJson}
            className="text-xs font-bold px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
          >
            <span>📥</span>
            <span>خروجی استاندارد سامانه مودیان (JSON)</span>
          </button>

          <button
            onClick={() => window.print()}
            className="text-xs font-bold px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition-all shadow-md flex items-center gap-1.5 active:scale-95"
          >
            <span>🖨️</span>
            <span>چاپ رسمی صورت‌حساب دارایی</span>
          </button>
        </div>
      </div>

      {/* برگ صورت‌حساب استاندارد سازمان امور مالیاتی کشور */}
      <div className="max-w-5xl mx-auto bg-white border border-slate-300 print:border-none p-6 sm:p-10 shadow-xl print:shadow-none text-xs">
        {/* سربرگ */}
        <div className="border border-slate-900 rounded-t-xl p-4 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="size-11 grid place-items-center bg-slate-900 text-white font-black text-xl rounded-lg">
              ک
            </span>
            <div>
              <div className="text-base sm:text-lg font-black text-slate-900">
                صورت‌حساب الکترونیکی فروش کالا و خدمات
              </div>
              <div className="text-[11px] text-slate-600 font-bold">
                موضوع ماده (۲۶) قانون پایانه‌های فروشگاهی و سامانه مودیان مالیاتی
              </div>
            </div>
          </div>

          <div className="text-left font-mono text-xs space-y-1">
            <div>
              <span className="font-sans font-bold">شماره فاکتور: </span>
              <span className="font-bold text-slate-900">{order.orderNumber}</span>
            </div>
            <div>
              <span className="font-sans font-bold">تاریخ صدور: </span>
              <span className="nums font-bold text-slate-900">{dateFa}</span>
            </div>
            <div>
              <span className="font-sans font-bold text-blue-700">شناسه مالیاتی مودیان: </span>
              <span className="font-bold text-blue-900 text-[11px]">{fiscalTaxId}</span>
            </div>
          </div>
        </div>

        {/* مشخصات فروشنده */}
        <div className="border-x border-b border-slate-900 p-4">
          <div className="font-black text-slate-900 mb-2 text-xs flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-slate-900" />
            مشخصات فروشنده (کاردو):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
            <div>
              <span className="text-slate-500">نام شخص حقوقی: </span>
              <span className="font-bold text-slate-900">{seller.companyName}</span>
            </div>
            <div>
              <span className="text-slate-500">شماره اقتصادی: </span>
              <span className="font-mono font-bold text-slate-900" dir="ltr">{seller.economicCode}</span>
            </div>
            <div>
              <span className="text-slate-500">شناسه ملی: </span>
              <span className="font-mono font-bold text-slate-900" dir="ltr">{seller.nationalId}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-slate-500">نشانی انبار و دفتر مرکزی: </span>
              <span className="font-medium text-slate-900">{seller.address}</span>
            </div>
            <div>
              <span className="text-slate-500">کد پستی / تلفن: </span>
              <span className="font-mono font-bold text-slate-900" dir="ltr">{seller.postalCode} - {seller.phone}</span>
            </div>
          </div>
        </div>

        {/* مشخصات خریدار */}
        <div className="border-x border-b border-slate-900 p-4 bg-slate-50/40">
          <div className="font-black text-slate-900 mb-2 text-xs flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-blue-600" />
            مشخصات خریدار (همکار / مشتری):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
            <div>
              <span className="text-slate-500">نام همکار / فروشگاه: </span>
              <span className="font-bold text-slate-900">{buyer.companyName}</span>
            </div>
            <div>
              <span className="text-slate-500">شماره ملی / شناسه اقتصادی: </span>
              <span className="font-mono font-bold text-slate-900" dir="ltr">{buyer.nationalId || "ثبت در پرونده"}</span>
            </div>
            <div>
              <span className="text-slate-500">شماره تماس: </span>
              <span className="font-mono font-bold text-slate-900" dir="ltr">{buyer.phone}</span>
            </div>
            <div className="sm:col-span-3">
              <span className="text-slate-500">نشانی تحویل کالا: </span>
              <span className="font-medium text-slate-900">{buyer.address || "انبار مقصد همکار"}</span>
            </div>
          </div>
        </div>

        {/* جدول کالاها */}
        <div className="overflow-x-auto border-x border-b border-slate-900">
          <table className="w-full text-right text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white font-bold text-[10px]">
                <th className="py-2 px-2.5 border border-slate-700 text-center w-8">ردیف</th>
                <th className="py-2 px-2.5 border border-slate-700">شناسه و کد قطعه</th>
                <th className="py-2 px-2.5 border border-slate-700">شرح کالا یا خدمت</th>
                <th className="py-2 px-2.5 border border-slate-700 text-center">تعداد</th>
                <th className="py-2 px-2.5 border border-slate-700 text-center">واحد</th>
                <th className="py-2 px-2.5 border border-slate-700 text-left">مبلغ واحد (تومان)</th>
                <th className="py-2 px-2.5 border border-slate-700 text-left">مبلغ کل (تومان)</th>
                <th className="py-2 px-2.5 border border-slate-700 text-center">ارزش افزوده</th>
                <th className="py-2 px-2.5 border border-slate-700 text-left">مبلغ نهایی با مالیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {order.items.map((it, idx) => {
                const itemVat = Math.round(it.totalPrice * VAT_RATE);
                const itemFinal = it.totalPrice + itemVat;
                return (
                  <tr key={it.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                    <td className="py-2 px-2.5 border border-slate-200 text-center nums">{idx + 1}</td>
                    <td className="py-2 px-2.5 border border-slate-200 font-mono text-[10px]" dir="ltr">{it.sku}</td>
                    <td className="py-2 px-2.5 border border-slate-200 font-bold text-slate-900">{it.productName}</td>
                    <td className="py-2 px-2.5 border border-slate-200 text-center nums font-bold">{toFaDigits(it.quantity)}</td>
                    <td className="py-2 px-2.5 border border-slate-200 text-center">{it.unit}</td>
                    <td className="py-2 px-2.5 border border-slate-200 text-left nums">{formatToman(it.unitPrice)}</td>
                    <td className="py-2 px-2.5 border border-slate-200 text-left nums font-bold">{formatToman(it.totalPrice)}</td>
                    <td className="py-2 px-2.5 border border-slate-200 text-center nums font-medium text-blue-700">۱۰٪ ({formatToman(itemVat)})</td>
                    <td className="py-2 px-2.5 border border-slate-200 text-left nums font-black text-slate-900">{formatToman(itemFinal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* جدول محاسبات جمع کل و مالیات قانونی */}
        <div className="border-x border-b border-slate-900 p-4 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-xs text-slate-600 space-y-1">
            <div>
              <span className="font-bold text-slate-900">روش تسویه: </span>
              <span>تسویه اعتباری همکار کاردو (B2B Credit Account)</span>
            </div>
            <div>
              <span className="font-bold text-slate-900">وضعیت سند: </span>
              <span className="font-bold text-emerald-700">تایید شده و ثبت در کارپوشه سامانه مودیان</span>
            </div>
          </div>

          <div className="w-full sm:w-80 space-y-1.5 font-bold text-xs">
            <div className="flex justify-between text-slate-700">
              <span>جمع بهای اقلام:</span>
              <span className="nums font-mono">{formatToman(order.subtotal)} تومان</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-rose-700">
                <span>تخفیف همکاری:</span>
                <span className="nums font-mono">- {formatToman(order.discount)} تومان</span>
              </div>
            )}
            <div className="flex justify-between text-blue-800">
              <span>مالیات و عوارض ارزش افزوده (۱۰٪):</span>
              <span className="nums font-mono">+ {formatToman(vatAmount)} تومان</span>
            </div>
            {order.shippingCost > 0 && (
              <div className="flex justify-between text-slate-700">
                <span>هزینه باربری و بسته‌بندی:</span>
                <span className="nums font-mono">+ {formatToman(order.shippingCost)} تومان</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black text-slate-950 pt-2 border-t border-slate-300">
              <span>مبلغ کل قابل پرداخت:</span>
              <span className="nums font-mono text-emerald-900">{formatToman(finalOfficialTotal)} تومان</span>
            </div>
          </div>
        </div>

        {/* امضا و مهر سازمانی */}
        <div className="border-x border-b border-slate-900 rounded-b-xl p-6 bg-white grid grid-cols-2 gap-8 text-center text-xs">
          <div className="border border-slate-200 rounded-xl p-4">
            <div className="font-black text-slate-900 mb-10">امضا و اثر انگشت خریدار / تحویل‌گیرنده</div>
            <div className="text-[10px] text-slate-400">تاریخ و امضا</div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 relative">
            <div className="font-black text-slate-900 mb-10">مهر و امضای امور مالی شرکت کاردو دیار کریمان</div>
            <div className="text-[10px] text-emerald-700 font-bold">تایید شده توسط توکن امضای دیجیتال مودیان ✓</div>
          </div>
        </div>
      </div>
    </div>
  );
}
