"use client";

import * as React from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";

// کامپوننت صفحه‌بندی RTL — در جهت فارسی «قبلی» سمت راست و «بعدی» سمت چپ قرار می‌گیرد
export function DataTablePagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const safeTotal = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), safeTotal);

  // ساخت دکمه‌های صفحات با ellipsis هوشمند
  const pages: (number | "ellipsis")[] = [];
  const push = (v: number | "ellipsis") => pages.push(v);

  push(1);
  if (current > 3) push("ellipsis");
  const start = Math.max(2, current - 1);
  const end = Math.min(safeTotal - 1, current + 1);
  for (let i = start; i <= end; i++) push(i);
  if (current < safeTotal - 2) push("ellipsis");
  if (safeTotal > 1) push(safeTotal);

  // در RTL: «قبلی» (صفحه کوچکتر) سمت راست، «بعدی» سمت چپ
  return (
    <Pagination className="mt-4 justify-center sm:justify-start" dir="rtl">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            aria-disabled={current === 1}
            onClick={(e) => {
              e.preventDefault();
              if (current > 1) onChange(current - 1);
            }}
            className={
              current === 1 ? "pointer-events-none opacity-50" : ""
            }
          >
            <ChevronRight className="h-4 w-4" />
            <span className="hidden sm:block">قبلی</span>
          </PaginationPrevious>
        </PaginationItem>

        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <PaginationItem key={`e-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink
                href="#"
                isActive={p === current}
                onClick={(e) => {
                  e.preventDefault();
                  if (p !== current) onChange(p);
                }}
              >
                {p.toLocaleString("fa-IR")}
              </PaginationLink>
            </PaginationItem>
          )
        )}

        <PaginationItem>
          <PaginationNext
            href="#"
            aria-disabled={current === safeTotal}
            onClick={(e) => {
              e.preventDefault();
              if (current < safeTotal) onChange(current + 1);
            }}
            className={
              current === safeTotal
                ? "pointer-events-none opacity-50"
                : ""
            }
          >
            <span className="hidden sm:block">بعدی</span>
            <ChevronLeft className="h-4 w-4" />
          </PaginationNext>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
