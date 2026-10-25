"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, PackagePlus, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { cancelPurchase, downloadPurchaseImportTemplate, getPurchases, getSuppliers, getWarehouses } from "@/lib/api";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTablePagination } from "@/components/data-table-pagination";
import { ActiveFilters, ListMoreMenu, ListToolbar, type ActiveFilter } from "@/components/list-toolbar";

const ALLOWED = ["ADMIN", "MANAGER"] as const;
const PAGE_SIZE = 20;
const NUM = "text-end tabular-nums";

export default function PurchasesPage() {
  const canUse = useAuthStore((s) => s.hasRole)(...ALLOWED);
  const queryClient = useQueryClient();
  const [term, setTerm] = React.useState("");
  const [applied, setApplied] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [supplierId, setSupplierId] = React.useState("");
  const [warehouseId, setWarehouseId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [cancelling, setCancelling] = React.useState<{ id: string; number: number } | null>(null);

  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: getSuppliers, enabled: canUse });
  const warehousesQ = useQuery({ queryKey: ["warehouses"], queryFn: getWarehouses, enabled: canUse });
  const listQ = useQuery({
    queryKey: ["purchases", applied, supplierId, warehouseId, status, page],
    queryFn: () => getPurchases({ q: applied || undefined, supplierId: supplierId || undefined, warehouseId: warehouseId || undefined, status: status || undefined, page, limit: PAGE_SIZE }),
    enabled: canUse,
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => cancelPurchase(cancelling!.id, reason),
    onSuccess: () => { toast.success("فاکتور خرید باطل شد و موجودی برگشت"); setCancelling(null); queryClient.invalidateQueries({ queryKey: ["purchases"] }); },
    onError: (e) => toast.error(e instanceof ApiException ? e.message : "ابطال ناموفق بود"),
  });

  if (!canUse) return <Card className="p-6 text-center text-muted-foreground">این بخش فقط برای مدیر است.</Card>;
  const rows = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;
  const hasFilters = !!(applied || supplierId || warehouseId || status);
  const clearFilters = () => { setTerm(""); setApplied(""); setSupplierId(""); setWarehouseId(""); setStatus(""); setPage(1); };
  const selectFilter = (setter: React.Dispatch<React.SetStateAction<string>>) => (v: string) => { setPage(1); setter(v === "ALL" ? "" : v); };

  const supplierName = suppliersQ.data?.find((s) => s.id === supplierId)?.name;
  const warehouseName = warehousesQ.data?.find((w) => w.id === warehouseId)?.name;
  const activeFilters: ActiveFilter[] = [
    ...(applied ? [{ key: "q", label: `جست‌وجو: ${applied}`, onRemove: () => { setTerm(""); setApplied(""); setPage(1); } }] : []),
    ...(supplierId ? [{ key: "sup", label: `تأمین‌کننده: ${supplierName ?? "…"}`, onRemove: () => { setSupplierId(""); setPage(1); } }] : []),
    ...(warehouseId ? [{ key: "wh", label: `انبار: ${warehouseName ?? "…"}`, onRemove: () => { setWarehouseId(""); setPage(1); } }] : []),
    ...(status ? [{ key: "st", label: `وضعیت: ${PURCHASE_STATUS_LABELS[status] ?? status}`, onRemove: () => { setStatus(""); setPage(1); } }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="فاکتورهای خرید" description="ثبت و پیگیری ورود کالا از برگه‌ی فروشنده" icon={PackagePlus} />

      <div className="space-y-2">
        <ListToolbar
          actions={
            <>
              {meta ? (
                <span className="text-xs text-muted-foreground tabular-nums">{toFa(meta.total)} فاکتور</span>
              ) : null}
              <Button asChild size="sm">
                <Link href="/admin/purchases/new">
                  <Plus className="size-4" />
                  فاکتور خرید جدید
                </Link>
              </Button>
              <ListMoreMenu>
                <DropdownMenuItem asChild>
                  <Link href="/admin/purchases/import">
                    <FileSpreadsheet className="size-4" />
                    ورود از Excel
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    downloadPurchaseImportTemplate().catch((e) =>
                      toast.error(e instanceof ApiException ? e.message : "دانلود قالب ناموفق بود"),
                    )
                  }
                >
                  <Download className="size-4" />
                  دانلود قالب Excel
                </DropdownMenuItem>
                {hasFilters ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={clearFilters}>پاک کردن فیلترها</DropdownMenuItem>
                  </>
                ) : null}
              </ListMoreMenu>
            </>
          }
        >
          {/* همان رفتارِ قبلی: جست‌وجو با Enter یا دکمه اعمال می‌شود */}
          <form
            className="flex flex-1 flex-wrap items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(term.trim()); }}
          >
            <div className="relative min-w-56 flex-1">
              <Search className="absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="شماره سند، شماره برگه یا تأمین‌کننده"
                aria-label="جست‌وجوی فاکتور خرید"
                className="h-9 pe-9"
              />
            </div>
            <Select value={supplierId || "ALL"} onValueChange={selectFilter(setSupplierId)}>
              <SelectTrigger className="h-9 w-44"><SelectValue placeholder="همه تأمین‌کننده‌ها" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">همه تأمین‌کننده‌ها</SelectItem>
                {(suppliersQ.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={warehouseId || "ALL"} onValueChange={selectFilter(setWarehouseId)}>
              <SelectTrigger className="h-9 w-36"><SelectValue placeholder="همه انبارها" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">همه انبارها</SelectItem>
                {(warehousesQ.data ?? []).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status || "ALL"} onValueChange={selectFilter(setStatus)}>
              <SelectTrigger className="h-9 w-36"><SelectValue placeholder="همه وضعیت‌ها" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">همه وضعیت‌ها</SelectItem>
                <SelectItem value="CONFIRMED">تأییدشده</SelectItem>
                <SelectItem value="CANCELLED">باطل‌شده</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" variant="secondary">
              <Search className="size-4" />
              جست‌وجو
            </Button>
          </form>
        </ListToolbar>

        <ActiveFilters filters={activeFilters} onClearAll={clearFilters} />
      </div>

      {listQ.isLoading ? (
        <LoadingState />
      ) : listQ.isError ? (
        <ErrorState onRetry={() => listQ.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={hasFilters ? "فاکتوری با این فیلترها پیدا نشد" : "هنوز فاکتور خریدی ثبت نشده"}
          description={hasFilters ? "فیلترها را تغییر دهید یا پاک کنید." : "اولین برگه‌ی فروشنده را از دکمه‌ی «فاکتور خرید جدید» وارد کنید."}
          action={hasFilters ? <Button variant="outline" size="sm" onClick={clearFilters}>پاک کردن فیلترها</Button> : null}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table containerClassName="max-h-[calc(100vh-19rem)] overflow-y-auto">
            <TableHeader sticky>
              <TableRow>
                <TableHead className="w-24">شماره</TableHead>
                <TableHead className="w-32">تاریخ</TableHead>
                <TableHead>تأمین‌کننده</TableHead>
                <TableHead className="w-32">شماره برگه</TableHead>
                <TableHead className={`${NUM} w-24`}>اقلام</TableHead>
                <TableHead className={`${NUM} w-40`}>مبلغ (ریال)</TableHead>
                <TableHead className="w-28">وضعیت</TableHead>
                <TableHead className="w-24">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium tabular-nums">
                    <Link className="text-primary underline-offset-4 hover:underline" href={`/admin/purchases/${p.id}`}>{toFa(p.number)}</Link>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{formatJalali(new Date(p.invoiceDate ?? p.createdAt))}</TableCell>
                  <TableCell className="whitespace-normal">
                    {p.supplier?.id ? (
                      <Link className="text-primary underline-offset-4 hover:underline" href={`/admin/suppliers/${p.supplier.id}`}>{p.supplier.name}</Link>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{p.supplierRef ?? "—"}</TableCell>
                  <TableCell className={NUM}>{faQty(p._count?.lines ?? 0)}</TableCell>
                  <TableCell className={`${NUM} font-semibold`}>{money(p.total)}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "CANCELLED" ? "destructive" : "secondary"}>
                      {PURCHASE_STATUS_LABELS[p.status] ?? p.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {p.status === "CONFIRMED" ? (
                      <Button variant="ghost" size="sm" onClick={() => setCancelling({ id: p.id, number: p.number })}>ابطال</Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {meta ? (
        <DataTablePagination
          page={page}
          totalPages={meta.lastPage}
          onChange={setPage}
        />
      ) : null}

      <ConfirmDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)} title={`ابطال فاکتور خرید ${toFa(cancelling?.number ?? "")}`} description="موجودیِ واردشده از انبار کم می‌شود. اگر کالا بعد از ورود فروخته یا جابه‌جا شده باشد، ابطال انجام نمی‌شود." confirmText="ابطال فاکتور" destructive requireReason reasonPlaceholder="دلیل ابطال" loading={cancel.isPending} onConfirm={(reason) => cancel.mutate(reason ?? "")} />
    </div>
  );
}
