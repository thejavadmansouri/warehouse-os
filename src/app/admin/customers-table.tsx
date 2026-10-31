"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { toFaDigits } from "@/lib/digits";

export interface CustomerRow {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  status: string;
  username: string | null;
  nationalId?: string | null;
  tierName?: string | null;
}

export function AdminCustomersTable({
  customers,
}: {
  customers: CustomerRow[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (statusFilter !== "ALL" && c.status !== statusFilter) {
        return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        c.companyName.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.username && c.username.toLowerCase().includes(q)) ||
        (c.nationalId && c.nationalId.includes(q))
      );
    });
  }, [customers, search, statusFilter]);

  return (
    <div className="space-y-3">
      {/* فیلتر و جستجوی آنی */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو بر اساس نام فروشگاه، نام مسئول، شماره موبایل یا کد ملی..."
            className="w-full rounded-xl border border-stone-200 bg-white py-2 pr-9 pl-4 text-xs shadow-sm focus:border-amber-500 focus:outline-none"
          />
          <span className="absolute right-3 top-2.5 text-stone-400 text-xs">
            🔍
          </span>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute left-3 top-2.5 text-stone-400 hover:text-stone-700 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`rounded-lg px-2.5 py-1.5 font-bold transition ${
              statusFilter === "ALL"
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            همه ({toFaDigits(customers.length)})
          </button>
          <button
            onClick={() => setStatusFilter("ACTIVE")}
            className={`rounded-lg px-2.5 py-1.5 font-bold transition ${
              statusFilter === "ACTIVE"
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            فعال ({toFaDigits(customers.filter((c) => c.status === "ACTIVE").length)})
          </button>
          <button
            onClick={() => setStatusFilter("BLOCKED")}
            className={`rounded-lg px-2.5 py-1.5 font-bold transition ${
              statusFilter === "BLOCKED"
                ? "bg-rose-600 text-white"
                : "bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            مسدود ({toFaDigits(customers.filter((c) => c.status === "BLOCKED").length)})
          </button>
        </div>
      </div>

      {/* جدول مشتریان با دسترسی به پرونده ۳۶۰ درجه */}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-400">
            مشتری با این مشخصات یافت نشد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/75 text-stone-600 font-bold">
                  <th className="py-3 px-4">نام همکار / فروشگاه</th>
                  <th className="py-3 px-4">مسئول خرید</th>
                  <th className="py-3 px-4">موبایل / کاربری</th>
                  <th className="py-3 px-4">سطح قیمتی</th>
                  <th className="py-3 px-4">وضعیت</th>
                  <th className="py-3 px-4 text-center">پرونده مشتری و CRM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-amber-50/20 transition">
                    <td className="py-3 px-4 font-bold text-stone-900">
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="hover:text-amber-600 transition"
                      >
                        {c.companyName}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-stone-600">{c.contactName}</td>
                    <td className="py-3 px-4 font-mono text-stone-600" dir="ltr">
                      {toFaDigits(c.phone)}
                      {c.username && (
                        <span className="block text-[11px] text-stone-400">
                          @{c.username}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                        {c.tierName || "عادی"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                          c.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}
                      >
                        {c.status === "ACTIVE" ? "فعال" : "مسدود"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="inline-flex items-center gap-1 rounded-xl bg-stone-900 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs transition hover:bg-stone-800"
                      >
                        <span>🔍 پرونده ۳۶۰ و تحلیل سرچ</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
