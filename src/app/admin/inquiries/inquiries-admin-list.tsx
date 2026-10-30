"use client";

import { useState } from "react";
import Link from "next/link";
import { formatToman, toFaDigits } from "@/lib/digits";
import { faDate } from "@/lib/date";
import { INQUIRY_STATUS } from "@/lib/status";

export type AdminInquiry = {
  id: string;
  number: string;
  status: "PENDING" | "ANSWERED" | "CONVERTED" | "REJECTED";
  customerNote: string | null;
  adminNote: string | null;
  totalQuoted: number | null;
  createdAt: string;
  customer: {
    id: string;
    companyName: string;
    contactName: string;
    phone: string;
  };
  items: {
    id: string;
    partName: string;
    brand: string | null;
    model: string | null;
    sku: string | null;
    qty: number;
    unit: string;
    targetPrice: number | null;
    quotedUnitPrice: number | null;
    lineTotal: number | null;
  }[];
};

export function InquiriesAdminList(props: { initialInquiries: AdminInquiry[] }) {
  const [filter, setFilter] = useState<string>("ALL");
  const [inquiries] = useState<AdminInquiry[]>(props.initialInquiries);

  const filtered = inquiries.filter((inq) => {
    if (filter === "ALL") return true;
    return inq.status === filter;
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-rule">
        <div>
          <h1 className="text-lg font-bold">مدیریت استعلام‌های قیمت (RFQ)</h1>
          <p className="text-xs text-ink-soft mt-0.5">
            بررسی درخواست‌های استعلام چندردیفی خریداران عمده و اعلام قیمت
          </p>
        </div>

        <div className="flex items-center gap-1 text-xs">
          {[
            { id: "ALL", label: "همه" },
            { id: "PENDING", label: "در انتظار قیمت" },
            { id: "ANSWERED", label: "پاسخ‌داده‌شده" },
            { id: "CONVERTED", label: "تبدیل به فاکتور" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-[2px] transition-colors ${
                filter === tab.id
                  ? "bg-ink text-paper font-bold"
                  : "text-ink-soft hover:bg-brass-soft/40"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <div className="card p-10 text-center text-xs text-ink-soft">
            استعلامی در این دسته‌بندی یافت نشد.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="hidden md:grid grid-cols-[8.5rem_1.2fr_1fr_6rem_8rem_6.5rem] gap-2 px-4 py-2.5 border-b border-rule bg-brass-soft/40 text-[11px] text-ink-soft">
              <span>شماره / تاریخ</span>
              <span>مشتری</span>
              <span>اقلام استعلام</span>
              <span className="text-center">وضعیت</span>
              <span className="text-left">مبلغ اعلامی</span>
              <span className="text-center">اقدام</span>
            </div>

            <ul className="divide-y divide-rule/60">
              {filtered.map((inq) => {
                const st = INQUIRY_STATUS[inq.status] ?? INQUIRY_STATUS.PENDING;
                return (
                  <li
                    key={inq.id}
                    className="p-4 md:grid md:grid-cols-[8.5rem_1.2fr_1fr_6rem_8rem_6.5rem] md:items-center gap-2 hover:bg-brass-soft/10 text-xs"
                  >
                    <div>
                      <p className="font-bold nums text-brass">{inq.number}</p>
                      <p className="text-[10px] text-ink-soft mt-0.5">{faDate(inq.createdAt)}</p>
                    </div>

                    <div>
                      <p className="font-semibold text-ink">{inq.customer.companyName}</p>
                      <p className="text-[11px] text-ink-soft">
                        {inq.customer.contactName} ({toFaDigits(inq.customer.phone)})
                      </p>
                    </div>

                    <div>
                      <p className="text-ink truncate">
                        {inq.items.map((i) => i.partName).join("، ")}
                      </p>
                      <p className="text-[11px] text-ink-soft mt-0.5">
                        <span className="nums">{toFaDigits(inq.items.length)}</span> قلم کالا
                      </p>
                    </div>

                    <div className="md:text-center">
                      <span
                        className={`stamp text-[10px] ${
                          st.tone === "green"
                            ? "text-ledger-green"
                            : st.tone === "red"
                            ? "text-alarm"
                            : st.tone === "ink"
                            ? "text-ink"
                            : "text-brass"
                        }`}
                      >
                        {st.label}
                      </span>
                    </div>

                    <div className="md:text-left nums font-bold">
                      {inq.totalQuoted && inq.totalQuoted > 0 ? (
                        <span>{formatToman(inq.totalQuoted)} ت</span>
                      ) : (
                        <span className="text-ink-soft font-normal text-[11px]">تعیین نشده</span>
                      )}
                    </div>

                    <div className="mt-2 md:mt-0 md:text-center">
                      <Link
                        href={`/admin/inquiries/${inq.id}`}
                        className="btn btn-brass text-xs px-3 py-1.5 w-full md:w-auto"
                      >
                        قیمت‌گذاری
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
