"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, PackagePlus } from "lucide-react";

import { getPurchase } from "@/lib/api";
import { money, qty as faQty, toFa } from "@/lib/format";
import { formatJalali } from "@/lib/jalali";
import { useAuthStore } from "@/lib/auth-store";
import { LoadingState, ErrorState } from "@/components/states";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PURCHASE_STATUS_LABELS } from "@/lib/types";

const ALLOWED = ["ADMIN", "MANAGER"] as const;

export default function PurchaseDetailPage() {
  const params = useParams<{ id: string }>();
  const canUse = useAuthStore((s) => s.hasRole)(...ALLOWED);
  const purchaseQ = useQuery({
    queryKey: ["purchase", params.id],
    queryFn: () => getPurchase(params.id),
    enabled: canUse && !!params.id,
  });

  if (!canUse) {
    return <Card className="p-6 text-center text-muted-foreground">این بخش فقط برای مدیر است.</Card>;
  }

  if (purchaseQ.isLoading) return <LoadingState />;
  if (purchaseQ.isError || !purchaseQ.data) {
    return <ErrorState message="بارگذاری فاکتور خرید ناموفق بود." onRetry={() => purchaseQ.refetch()} />;
  }

  const p = purchaseQ.data;
  const lines = p.lines ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`جزئیات فاکتور خرید ${toFa(p.number)}`}
        description="اقلام، قیمت خرید، مکان ورود و اطلاعات سند"
        icon={PackagePlus}
        actions={<Button asChild variant="outline"><Link href="/admin/purchases"><ArrowRight className="me-2 h-4 w-4" />بازگشت</Link></Button>}
      />

      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="تاریخ" value={formatJalali(new Date(p.invoiceDate ?? p.createdAt))} />
        <Info label="تأمین‌کننده" value={p.supplier?.name ?? "مشخص نشده"} />
        <Info label="شماره فاکتور فروشنده" value={p.supplierRef ?? "—"} />
        <Info label="وضعیت" value={<Badge variant={p.status === "CANCELLED" ? "destructive" : "secondary"}>{PURCHASE_STATUS_LABELS[p.status] ?? p.status}</Badge>} />
      </Card>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader><TableRow><TableHead>ردیف</TableHead><TableHead>کالا</TableHead><TableHead>کد</TableHead><TableHead>مکان</TableHead><TableHead>تعداد</TableHead><TableHead>قیمت واحد</TableHead><TableHead>جمع</TableHead></TableRow></TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const net = Math.max(0, (line.quantity * (line.unitPrice ?? 0)));
              return <TableRow key={line.id}>
                <TableCell>{toFa(index + 1)}</TableCell>
                <TableCell className="font-medium">{line.product?.name ?? "محصول حذف‌شده"}</TableCell>
                <TableCell>{line.product?.sku ?? "—"}</TableCell>
                <TableCell>{line.location?.path ?? line.location?.name ?? "انبار موقت"}</TableCell>
                <TableCell>{faQty(line.quantity)} {line.product?.unit ?? ""}</TableCell>
                <TableCell>{money(line.unitPrice ?? 0)}</TableCell>
                <TableCell>{money(net)}</TableCell>
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="ms-auto w-full max-w-sm space-y-2 p-4 text-sm">
        <Summary label="جمع اقلام" value={money(p.subtotal)} />
        <Summary label="تخفیف" value={money(p.discount)} />
        <Summary label="مبلغ نهایی" value={money(p.total)} strong />
        {p.note ? <div className="border-t pt-2 text-muted-foreground">یادداشت: {p.note}</div> : null}
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div>;
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "border-t pt-2 text-base font-semibold" : ""}`}><span>{label}</span><span>{value}</span></div>;
}
