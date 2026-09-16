"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, faDateTime, toFa } from "@/lib/format";
import type { VoucherRow, VoucherSourceType } from "@/lib/types";

/**
 * لینکِ «سندِ مبدأ» برای هر نوع سند — «از هر سند به سندِ مبدأش».
 *
 * فاکتورِ مبدأ برای مرجوعی/اصلاحیه از خودِ سندِ مالی جدا است (`sourceId`
 * شناسه‌ی مرجوعی است)؛ سرور همان را در `invoiceId` می‌گذارد تا این‌جا فقط
 * لینک ساخته شود.
 */
export function sourceHrefFor(v: VoucherRow): {
  href: string | null;
  label: string;
} {
  switch (v.sourceType) {
    case "SALE_INVOICE":
      return { href: `/admin/invoices/${v.sourceId}`, label: "مشاهدهٔ فاکتور" };
    case "SALE_CANCEL":
      return {
        href: `/admin/invoices/${v.sourceId}`,
        label: "مشاهدهٔ فاکتور باطل‌شده",
      };
    case "SALE_RETURN":
    case "SALE_CORRECTION":
      // از مرجوعی/اصلاحیه به فاکتورِ مبدأ — ردِ مالی را روی فاکتور دنبال کن.
      return v.invoiceId
        ? { href: `/admin/invoices/${v.invoiceId}`, label: "مشاهدهٔ فاکتور مبدأ" }
        : { href: "/admin/documents", label: "مشاهدهٔ اسناد" };
    case "PURCHASE_INVOICE":
      return { href: `/admin/purchases/${v.sourceId}`, label: "مشاهدهٔ فاکتور خرید" };
    case "PURCHASE_CANCEL":
      return {
        href: `/admin/purchases/${v.sourceId}`,
        label: "مشاهدهٔ فاکتور خرید باطل‌شده",
      };
    case "RECEIPT":
      return { href: "/admin/receipts", label: "مشاهدهٔ رسیدها" };
    case "CUSTOMER_PAYOUT":
      return { href: "/admin/payouts", label: "مشاهدهٔ پرداخت‌ها" };
    case "PAYMENT_REVERSAL":
    case "PAYMENT_RECOMPOSE":
      return v.invoiceId
        ? {
            href: `/admin/invoices/${v.invoiceId}`,
            label: "مشاهدهٔ فاکتور",
          }
        : { href: "/admin/invoices", label: "مشاهدهٔ فاکتورها" };
    // چرخه‌ی چک صفحه‌ی جدا ندارد — شماره‌ی چک در یادداشتِ سند است.
    case "CHEQUE_DEPOSIT":
    case "CHEQUE_BOUNCED":
    case "CHEQUE_CASHED":
      return { href: null, label: "" };
    default:
      return { href: null, label: "" };
  }
}

/** نوع‌هایی که «برگشتی به فاکتور» هستند — برای برچسبِ سندِ مبدأ در کارت. */
export const RETURNS_TO_INVOICE: VoucherSourceType[] = [
  "SALE_INVOICE",
  "SALE_CANCEL",
  "SALE_RETURN",
  "SALE_CORRECTION",
  "PAYMENT_REVERSAL",
  "PAYMENT_RECOMPOSE",
];

/**
 * کارتِ یک سند — سرصفحه + خطوطِ بدهکار/بستانکارِ بازشونده.
 *
 * در دفتر روزنامه (فهرست همه‌ی سندها) و در صفحه‌ی فاکتور (سندهای همان فاکتور)
 * یکسان استفاده می‌شود تا دو جا دو شکلِ متفاوت برای «یک سند» نشان ندهند.
 */
export function VoucherCard({ voucher }: { voucher: VoucherRow }) {
  const [open, setOpen] = React.useState(false);

  const totalDebit = voucher.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = voucher.lines.reduce((s, l) => s + l.credit, 0);
  const balanced = totalDebit === totalCredit;
  const { href, label } = sourceHrefFor(voucher);

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/50"
      >
        <span className="w-16 shrink-0 text-sm font-bold tabular-nums text-muted-foreground">
          #{toFa(voucher.number)}
        </span>
        <span className="w-32 shrink-0">
          <Badge variant={voucher.reversesVoucherId ? "destructive" : "outline"}>
            {voucher.sourceLabel}
          </Badge>
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{voucher.note ?? "—"}</span>
        <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums md:block">
          {faDateTime(voucher.createdAt)}
        </span>
        <span className="shrink-0 text-sm font-bold tabular-nums">{money(totalDebit)}</span>
        <span className="shrink-0">
          {balanced ? (
            <CheckCircle2 className="size-4 text-emerald-500" />
          ) : (
            <span className="text-xs font-bold text-destructive">نامتوازن!</span>
          )}
        </span>
        {open ? (
          <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open ? (
        <div className="border-t px-4 py-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>حساب</TableHead>
                <TableHead className="text-start">یادداشت</TableHead>
                <TableHead className="text-start">بدهکار</TableHead>
                <TableHead className="text-start">بستانکار</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {voucher.lines.map((l) => (
                <TableRow key={`${voucher.id}-${l.account}-${l.amount}`}>
                  <TableCell className="font-medium">{l.accountLabel}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.note ?? "—"}
                  </TableCell>
                  <TableCell className="text-start tabular-nums">
                    {l.debit > 0 ? money(l.debit) : ""}
                  </TableCell>
                  <TableCell className="text-start tabular-nums text-destructive">
                    {l.credit > 0 ? money(l.credit) : ""}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-bold">جمع</TableCell>
                <TableCell />
                <TableCell className="text-start font-bold tabular-nums">
                  {money(totalDebit)}
                </TableCell>
                <TableCell className="text-start font-bold tabular-nums text-destructive">
                  {money(totalCredit)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {voucher.reversesVoucherId ? (
              <Badge variant="destructive">سندِ معکوس (ابطال)</Badge>
            ) : null}
            {href ? (
              <Link
                href={href}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="size-3" />
                {label}
              </Link>
            ) : null}
            <span className="tabular-nums">{faDateTime(voucher.createdAt)}</span>
          </div>
        </div>
      ) : null}
    </Card>
  );
}