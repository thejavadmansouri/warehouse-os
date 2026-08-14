"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { cancelPurchase, getPurchases } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { PURCHASE_STATUS_LABELS } from "@/lib/types";
import { money, qty as faQty, toFa } from "@/lib/format";
import { formatJalali } from "@/lib/jalali";
import { useAuthStore } from "@/lib/auth-store";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ALLOWED = ["ADMIN", "MANAGER"] as const;
const PAGE_SIZE = 20;

export default function PurchasesPage() {
  const canUse = useAuthStore((s) => s.hasRole)(...ALLOWED);
  const queryClient = useQueryClient();

  const [term, setTerm] = React.useState("");
  const [applied, setApplied] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [cancelling, setCancelling] = React.useState<{ id: string; number: number } | null>(null);

  const listQ = useQuery({
    queryKey: ["purchases", applied, page],
    queryFn: () => getPurchases({ q: applied || undefined, page, limit: PAGE_SIZE }),
    enabled: canUse,
  });

  const cancel = useMutation({
    mutationFn: (reason: string) => cancelPurchase(cancelling!.id, reason),
    onSuccess: () => {
      toast.success("فاکتور خرید باطل شد و موجودی برگشت");
      setCancelling(null);
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
    },
    onError: (e) => {
      /*
       * پرتکرارترین حالت: جنس بعد از ورود فروخته شده. پیام سرور دقیقاً همین را
       * می‌گوید و باید عیناً دیده شود — «خطا در ابطال» هیچ کمکی نمی‌کند.
       */
      toast.error(e instanceof ApiException ? e.message : "ابطال ناموفق بود");
    },
  });

  if (!canUse) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        این بخش فقط برای مدیر است.
      </Card>
    );
  }

  const rows = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="فاکتورهای خرید"
        description="ورودِ کالا از برگه‌ی فروشنده — قیمت خرید اینجا ثبت می‌شود."
        icon={PackagePlus}
        actions={
          <Button asChild>
            <Link href="/admin/purchases/new">
              <Plus className="me-2 h-4 w-4" />
              فاکتور خرید جدید
            </Link>
          </Button>
        }
      />

      <Card className="p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setApplied(term.trim());
          }}
        >
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="شماره سند، شماره فاکتور فروشنده، یا نام تأمین‌کننده"
          />
          <Button type="submit" variant="outline">
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        {listQ.isLoading ? (
          <LoadingState />
        ) : listQ.isError ? (
          <ErrorState onRetry={() => listQ.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="هنوز فاکتور خریدی ثبت نشده"
            description="اولین برگه‌ای که فروشنده می‌آورد را از دکمه‌ی بالا وارد کنید."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>تأمین‌کننده</TableHead>
                <TableHead>شماره برگه</TableHead>
                <TableHead>اقلام</TableHead>
                <TableHead>مبلغ</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{toFa(p.number)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatJalali(new Date(p.invoiceDate ?? p.createdAt))}
                  </TableCell>
                  <TableCell>{p.supplier?.name ?? "—"}</TableCell>
                  <TableCell>{p.supplierRef ?? "—"}</TableCell>
                  <TableCell>{faQty(p._count?.lines ?? 0)}</TableCell>
                  <TableCell className="whitespace-nowrap">{money(p.total)}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "CANCELLED" ? "destructive" : "secondary"}>
                      {PURCHASE_STATUS_LABELS[p.status] ?? p.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {p.status === "CONFIRMED" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCancelling({ id: p.id, number: p.number })}
                      >
                        ابطال
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {meta && meta.lastPage > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            قبلی
          </Button>
          <span className="text-sm text-muted-foreground">
            صفحه {toFa(page)} از {toFa(meta.lastPage)}
          </span>
          <Button
            variant="outline"
            disabled={page >= meta.lastPage}
            onClick={() => setPage((p) => p + 1)}
          >
            بعدی
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={`ابطال فاکتور خرید ${toFa(cancelling?.number ?? "")}`}
        description="موجودیِ واردشده از انبار کم می‌شود. اگر کالا بعد از ورود فروخته یا جابه‌جا شده باشد، ابطال انجام نمی‌شود."
        confirmText="ابطال فاکتور"
        destructive
        requireReason
        reasonPlaceholder="دلیل ابطال"
        loading={cancel.isPending}
        onConfirm={(reason) => cancel.mutate(reason ?? "")}
      />
    </div>
  );
}
