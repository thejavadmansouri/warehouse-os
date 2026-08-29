"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";

import { cancelPurchase, getPurchases, getSuppliers, getWarehouses } from "@/lib/api";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ALLOWED = ["ADMIN", "MANAGER"] as const;
const PAGE_SIZE = 20;

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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="فاکتورهای خرید" description="ثبت و پیگیری ورود کالا از برگه‌ی فروشنده" icon={PackagePlus} actions={<Button asChild><Link href="/admin/purchases/new"><Plus className="me-2 h-4 w-4" />فاکتور خرید جدید</Link></Button>} />

      <Card className="border-primary/15 bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="size-4 text-primary" />جست‌وجو و فیلتر</div>
        <form className="grid gap-2 lg:grid-cols-[minmax(240px,1fr)_repeat(3,minmax(140px,auto))_auto]" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(term.trim()); }}>
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="شماره سند، شماره برگه یا تأمین‌کننده" aria-label="جست‌وجوی فاکتور خرید" />
          <Select value={supplierId || "ALL"} onValueChange={selectFilter(setSupplierId)}><SelectTrigger><SelectValue placeholder="همه تأمین‌کننده‌ها" /></SelectTrigger><SelectContent><SelectItem value="ALL">همه تأمین‌کننده‌ها</SelectItem>{(suppliersQ.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
          <Select value={warehouseId || "ALL"} onValueChange={selectFilter(setWarehouseId)}><SelectTrigger><SelectValue placeholder="همه انبارها" /></SelectTrigger><SelectContent><SelectItem value="ALL">همه انبارها</SelectItem>{(warehousesQ.data ?? []).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select>
          <Select value={status || "ALL"} onValueChange={selectFilter(setStatus)}><SelectTrigger><SelectValue placeholder="همه وضعیت‌ها" /></SelectTrigger><SelectContent><SelectItem value="ALL">همه وضعیت‌ها</SelectItem><SelectItem value="CONFIRMED">تأییدشده</SelectItem><SelectItem value="CANCELLED">باطل‌شده</SelectItem></SelectContent></Select>
          <div className="flex gap-2"><Button type="submit" className="flex-1"><Search className="me-2 size-4" />جست‌وجو</Button>{hasFilters ? <Button type="button" variant="ghost" size="icon" onClick={clearFilters} aria-label="پاک‌کردن فیلترها" title="پاک‌کردن فیلترها"><X className="size-4" /></Button> : null}</div>
        </form>
        {hasFilters ? <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span>فیلتر فعال:</span>{applied ? <Badge variant="outline">جست‌وجو: {applied}</Badge> : null}{supplierId ? <Badge variant="outline">تأمین‌کننده</Badge> : null}{warehouseId ? <Badge variant="outline">انبار</Badge> : null}{status ? <Badge variant="outline">{PURCHASE_STATUS_LABELS[status] ?? status}</Badge> : null}</div> : null}
      </Card>

      <Card className="overflow-hidden p-0">
        {listQ.isLoading ? <LoadingState /> : listQ.isError ? <ErrorState onRetry={() => listQ.refetch()} /> : rows.length === 0 ? <EmptyState title={hasFilters ? "فاکتوری با این فیلترها پیدا نشد" : "هنوز فاکتور خریدی ثبت نشده"} description={hasFilters ? "فیلترها را تغییر دهید یا پاک کنید." : "اولین برگه‌ی فروشنده را از دکمه‌ی بالا وارد کنید."} /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>شماره</TableHead><TableHead>تاریخ</TableHead><TableHead>تأمین‌کننده</TableHead><TableHead>شماره برگه</TableHead><TableHead>اقلام</TableHead><TableHead>مبلغ</TableHead><TableHead>وضعیت</TableHead><TableHead className="w-24">عملیات</TableHead></TableRow></TableHeader><TableBody>{rows.map((p) => <TableRow key={p.id}><TableCell className="font-medium"><Link className="text-primary underline-offset-4 hover:underline" href={`/admin/purchases/${p.id}`}>{toFa(p.number)}</Link></TableCell><TableCell className="whitespace-nowrap">{formatJalali(new Date(p.invoiceDate ?? p.createdAt))}</TableCell><TableCell>{p.supplier?.name ?? "—"}</TableCell><TableCell>{p.supplierRef ?? "—"}</TableCell><TableCell>{faQty(p._count?.lines ?? 0)}</TableCell><TableCell className="whitespace-nowrap">{money(p.total)}</TableCell><TableCell><Badge variant={p.status === "CANCELLED" ? "destructive" : "secondary"}>{PURCHASE_STATUS_LABELS[p.status] ?? p.status}</Badge></TableCell><TableCell>{p.status === "CONFIRMED" ? <Button variant="ghost" size="sm" onClick={() => setCancelling({ id: p.id, number: p.number })}>ابطال</Button> : <span className="text-xs text-muted-foreground">—</span>}</TableCell></TableRow>)}</TableBody></Table></div>}
      </Card>
      {meta && meta.lastPage > 1 ? <div className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>قبلی</Button><span className="text-sm text-muted-foreground">صفحه {toFa(page)} از {toFa(meta.lastPage)}</span><Button variant="outline" disabled={page >= meta.lastPage} onClick={() => setPage((p) => p + 1)}>بعدی</Button></div> : null}
      <ConfirmDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)} title={`ابطال فاکتور خرید ${toFa(cancelling?.number ?? "")}`} description="موجودیِ واردشده از انبار کم می‌شود. اگر کالا بعد از ورود فروخته یا جابه‌جا شده باشد، ابطال انجام نمی‌شود." confirmText="ابطال فاکتور" destructive requireReason reasonPlaceholder="دلیل ابطال" loading={cancel.isPending} onConfirm={(reason) => cancel.mutate(reason ?? "")} />
    </div>
  );
}
