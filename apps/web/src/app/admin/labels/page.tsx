"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tags, Printer, Settings2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  getLabelSettings,
  getPendingLabels,
  printProductLabelsPdf,
  updateLabelSettings,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { faDate, qty, toFa } from "@/lib/format";
import type { LabelSettings } from "@/lib/types";

type Period = "today" | "week" | "all";

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "امروز" },
  { id: "week", label: "این هفته" },
  { id: "all", label: "همه" },
];

function sinceOf(p: Period): string | undefined {
  if (p === "all") return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === "week") d.setDate(d.getDate() - 7);
  return d.toISOString();
}

export default function LabelsPage() {
  const qc = useQueryClient();

  const [period, setPeriod] = React.useState<Period>("today");
  const [onlyWithStock, setOnlyWithStock] = React.useState(true);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  /** چند لیبل از هر کالا. پیش‌فرض ۱؛ معمولاً به تعداد موجودی لازم است. */
  const [copies, setCopies] = React.useState<Record<string, number>>({});
  const [showSettings, setShowSettings] = React.useState(false);
  const [draft, setDraft] = React.useState<LabelSettings | null>(null);

  const queue = useQuery({
    queryKey: ["pending-labels", period, onlyWithStock],
    queryFn: () =>
      getPendingLabels({ onlyWithStock, since: sinceOf(period), limit: 300 }),
  });

  const settings = useQuery({ queryKey: ["label-settings"], queryFn: getLabelSettings });

  React.useEffect(() => {
    if (settings.data && !draft) setDraft(settings.data);
  }, [settings.data, draft]);

  // انتخاب‌ها با تغییر فیلتر بی‌معنا می‌شوند.
  React.useEffect(() => setSelected(new Set()), [period, onlyWithStock]);

  const rows = queue.data?.data ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const copiesOf = (id: string) => copies[id] ?? 1;

  const totalLabels = rows
    .filter((r) => selected.has(r.id))
    .reduce((s, r) => s + copiesOf(r.id), 0);

  const saveSettings = useMutation({
    mutationFn: () => updateLabelSettings(draft!),
    onSuccess: () => {
      toast.success("تنظیمات چاپ ذخیره شد");
      qc.invalidateQueries({ queryKey: ["label-settings"] });
    },
    onError: () => toast.error("ذخیره‌ی تنظیمات ناموفق بود"),
  });

  const print = useMutation({
    mutationFn: () =>
      printProductLabelsPdf(
        rows
          .filter((r) => selected.has(r.id))
          .map((r) => ({ productId: r.id, quantity: copiesOf(r.id) })),
      ),
    onSuccess: () => {
      toast.success(`${toFa(totalLabels)} لیبل آماده‌ی چاپ شد`);
      setSelected(new Set());
      // سرور همین کالاها را «چاپ‌شده» علامت زده، پس صف باید تازه شود.
      qc.invalidateQueries({ queryKey: ["pending-labels"] });
    },
    onError: (e: unknown) => {
      const err = e instanceof ApiException ? e : null;
      toast.error(err?.message ?? "تهیه‌ی فایل چاپ ناموفق بود");
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="لیبل‌های در انتظار"
        description="کالاهایی که وارد انبار شده‌اند و هنوز لیبل نخورده‌اند"
        icon={Tags}
      />

      {/* فیلترها */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1.5">
            {PERIODS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={period === p.id ? "default" : "outline"}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch checked={onlyWithStock} onCheckedChange={setOnlyWithStock} />
            فقط کالاهای دارای موجودی
          </label>
        </div>

        <Button variant="outline" size="sm" onClick={() => setShowSettings((v) => !v)}>
          <Settings2 className="ms-2 size-4" />
          تنظیمات چاپ
        </Button>
      </Card>

      {/* تنظیمات چاپ */}
      {showSettings && draft && (
        <Card className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {([
              ["columns", "تعداد ستون"],
              ["widthMm", "عرض (میلی‌متر)"],
              ["heightMm", "ارتفاع (میلی‌متر)"],
              ["gapMm", "فاصله (میلی‌متر)"],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium">{label}</label>
                <Input
                  dir="ltr"
                  className="h-10 text-center tabular-nums"
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [key]: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1),
                    })
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-6">
            {([
              ["showName", "نام کالا روی لیبل"],
              ["showBarcodeText", "عدد زیر بارکد"],
              ["cropMarks", "خط برش"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch
                  checked={draft[key]}
                  onCheckedChange={(v) => setDraft({ ...draft, [key]: v })}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" disabled={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
              {saveSettings.isPending ? "در حال ذخیره…" : "ذخیره به‌عنوان پیش‌فرض"}
            </Button>
            <p className="text-xs text-muted-foreground">
              روی لیبل فقط نام و بارکد چاپ می‌شود — قیمتی روی لیبل نیست.
            </p>
          </div>
        </Card>
      )}

      {/* صف */}
      {queue.isLoading ? (
        <LoadingState />
      ) : queue.isError ? (
        <ErrorState onRetry={() => queue.refetch()} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <h3 className="text-base font-bold text-emerald-600">همه‌چیز لیبل خورده</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            در این بازه کالای بدون لیبلی نیست.
            {period !== "all" && " می‌توانید بازه را روی «همه» بگذارید."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <b className="tabular-nums">{toFa(queue.data!.meta.total)}</b> کالا در انتظار لیبل
              {selected.size > 0 && (
                <>
                  {" — "}
                  <b className="tabular-nums text-primary">{toFa(selected.size)}</b> انتخاب شده،{" "}
                  <b className="tabular-nums">{toFa(totalLabels)}</b> لیبل
                </>
              )}
            </p>

            <Button
              className="h-11"
              disabled={selected.size === 0 || print.isPending}
              onClick={() => print.mutate()}
            >
              <Printer className="ms-2 size-4" />
              {print.isPending ? "در حال آماده‌سازی…" : "چاپ لیبل‌های انتخاب‌شده"}
            </Button>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="max-h-[32rem] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>کالا</TableHead>
                    <TableHead>برند</TableHead>
                    <TableHead className="text-center">موجودی</TableHead>
                    <TableHead className="w-32 text-center">تعداد لیبل</TableHead>
                    <TableHead>تاریخ ثبت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => {
                    const on = selected.has(p.id);
                    return (
                      <TableRow
                        key={p.id}
                        className={`border-e-2 ${on ? "border-e-primary bg-primary/5" : "border-e-transparent"}`}
                      >
                        <TableCell>
                          <Checkbox checked={on} onCheckedChange={() => toggle(p.id)} />
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[24rem] truncate font-medium">{p.name}</div>
                          <div className="text-xs tabular-nums text-muted-foreground">
                            {toFa(p.sku)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{p.brandName ?? "—"}</TableCell>
                        <TableCell className="text-center tabular-nums">{qty(p.stock)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              dir="ltr"
                              className="h-9 text-center tabular-nums"
                              value={copiesOf(p.id)}
                              onChange={(e) =>
                                setCopies({
                                  ...copies,
                                  [p.id]: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1),
                                })
                              }
                            />
                            {p.stock > 1 && copiesOf(p.id) !== p.stock && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0 px-2 text-xs"
                                title="به تعداد موجودی"
                                onClick={() => setCopies({ ...copies, [p.id]: p.stock })}
                              >
                                ={toFa(p.stock)}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {faDate(p.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          <p className="rounded-md border-e-4 border-e-primary bg-primary/5 p-3 text-xs leading-6">
            پس از چاپ، کالاها از این صف خارج می‌شوند. اگر بعداً <b>نام</b> کالایی عوض شود
            خودش به صف برمی‌گردد، چون لیبل قبلی دیگر درست نیست. تغییر قیمت اثری ندارد —
            قیمت روی لیبل چاپ نمی‌شود.
          </p>
        </>
      )}
    </div>
  );
}
