"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tags, Printer, Settings2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  cancelPrintJob,
  confirmPrintJob,
  getLabelCoverage,
  getLabelSettings,
  getLabelsAtLocation,
  getPendingLabels,
  getPrintJobs,
  getWarehouses,
  printProductLabelsPdf,
  updateLabelSettings,
  type LabelCoverageRow,
  type ProductLabelPrintJob,
} from "@/lib/api";
import { LabelPrintDialog } from "@/components/labels/label-print-dialog";
import { LocationPrintPicker } from "@/components/labels/location-print-picker";
import { ApiException } from "@/lib/api-error-messages";
import { faDate, qty, toFa } from "@/lib/format";
import type { LabelSettings } from "@/lib/types";
import {
  ROLL_MEDIA_WIDTH_MM,
  ROLL_STICKER_PRESETS,
  matchRollPreset,
  rollColumns,
} from "@/lib/label-roll-presets";
import {
  getDesktopConfig,
  isDesktop,
  saveDesktopLabelPrinter,
} from "@/lib/desktop";
import { resolveLabelPrinterList } from "@/lib/label-direct-print";

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

/**
 * انتخاب پرینتر لیبل — اپ ویندوزی: کانفیگ Tauri؛ مرورگر: LabelSettings سرور
 * (نام صف ویندوز روی سرور یا IP شبکه :9100).
 */
function LabelPrinterField({
  draft,
  setDraft,
}: {
  draft: LabelSettings;
  setDraft: (d: LabelSettings) => void;
}) {
  const [printers, setPrinters] = React.useState<
    Array<{ name: string; isDefault: boolean }>
  >([]);
  const [loaded, setLoaded] = React.useState(false);
  const desktop = isDesktop();

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await resolveLabelPrinterList();
        if (!alive) return;
        setPrinters(list);
      } catch {
        if (alive) setPrinters([]);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (!desktop || !loaded) return;
    let alive = true;
    (async () => {
      try {
        const cfg = await getDesktopConfig();
        if (!alive || !cfg.labelPrinterName) return;
        setDraft({ ...draft, printerName: cfg.labelPrinterName });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
    // همگام‌سازی اولیه از کانفیگ اپ — فقط بعد از load فهرست
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop, loaded]);

  const changeName = async (name: string) => {
    setDraft({ ...draft, printerName: name || null });
    if (desktop) {
      try {
        await saveDesktopLabelPrinter(name);
        toast.success("پرینتر لیبل در اپ ذخیره شد");
      } catch (e) {
        toast.error(String(e instanceof Error ? e.message : e));
      }
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium">
          پرینتر لیبل (حرارتی)
        </label>
        <select
          dir="rtl"
          className="h-9 w-full rounded-md border bg-white px-2 text-sm"
          value={draft.printerName ?? ""}
          onChange={(e) => changeName(e.target.value)}
          disabled={!loaded}
        >
          <option value="">
            {desktop ? "پیش‌فرض ویندوز" : "انتخاب از فهرست سرور…"}
          </option>
          {printers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
              {p.isDefault ? "  (پیش‌فرض)" : ""}
            </option>
          ))}
        </select>
      </div>
      {!desktop ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium">
              IP پرینتر شبکه (اختیاری)
            </label>
            <Input
              dir="ltr"
              className="h-9"
              placeholder="192.168.1.50"
              value={draft.printerHost ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  printerHost: e.target.value.trim() || null,
                })
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">پورت</label>
            <Input
              dir="ltr"
              className="h-9"
              value={draft.printerPort ?? 9100}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  printerPort: Number(e.target.value.replace(/\D/g, "")) || 9100,
                })
              }
            />
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {desktop
          ? "چاپ مستقیم از اپ فروشنده روی همین PC با datatype=RAW."
          : "چاپ مستقیم از مرورگر از طریق سرور — پرینتر باید به PC سرور وصل باشد یا روی شبکه (پورت ۹۱۰۰) در دسترس باشد. با «ذخیره تنظیمات» ثبت می‌شود."}
      </p>
    </div>
  );
}

/**
 * صف کالاهای بدون لیبل (قدیمی) — داخل هاب «لیبل‌ها» و کارتابل استفاده می‌شود.
 */
function UnprintedLabelsPanel({ embedded }: { embedded?: boolean } = {}) {
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
    mutationFn: () => {
      if (!draft) throw new Error("draft missing");
      return updateLabelSettings({
        ...draft,
        mediaWidthMm: ROLL_MEDIA_WIDTH_MM,
      });
    },
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
        compact={embedded}
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
          <div>
            <p className="mb-1 text-sm font-medium">رول لیبل</p>
            <p className="text-xs text-muted-foreground">
              عرض تکهٔ رول ثابت{" "}
              <b className="text-foreground tabular-nums">
                {toFa(ROLL_MEDIA_WIDTH_MM)}
              </b>{" "}
              میلی‌متر است (همان صفحهٔ فایل موفق ۱۰۰۲۰۰). فقط اندازهٔ برچسب را
              انتخاب کن — خروجی PDF واقعی: QR + عدد درشت، چند تا کنار هم.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">اندازه هر برچسب روی رول</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLL_STICKER_PRESETS.map((p) => {
                const active =
                  draft.widthMm === p.widthMm && draft.heightMm === p.heightMm;
                const cols = rollColumns(p.widthMm);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        widthMm: p.widthMm,
                        heightMm: p.heightMm,
                        gapMm: p.gapMm,
                        mediaWidthMm: ROLL_MEDIA_WIDTH_MM,
                      })
                    }
                    className={
                      "rounded-xl border px-3 py-3 text-right transition " +
                      (active
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/40")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{p.label}</span>
                      <Badge variant={active ? "default" : "secondary"}>
                        {toFa(cols)} تا در ردیف
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{p.hint}</p>
                  </button>
                );
              })}
            </div>
            {!matchRollPreset(draft.widthMm, draft.heightMm) ? (
              <p className="text-xs text-amber-700">
                اندازهٔ فعلی ({toFa(draft.widthMm)}×{toFa(draft.heightMm)}) در
                فهرست آماده نیست — یکی از گزینه‌های بالا را بزن.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                انتخاب فعلی:{" "}
                <b className="text-foreground">
                  {matchRollPreset(draft.widthMm, draft.heightMm)!.label}
                </b>{" "}
                →{" "}
                <b className="tabular-nums text-foreground">
                  {toFa(rollColumns(draft.widthMm))}
                </b>{" "}
                برچسب در هر تکهٔ رول.
              </p>
            )}
          </div>

          <details className="rounded-lg border px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              تنظیمات اضافه برای لیبل کالا (A4 / نام و بارکد)
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    تعداد ستون روی کاغذ A4
                  </label>
                  <Input
                    dir="ltr"
                    className="h-10 text-center tabular-nums"
                    value={draft.columns}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        columns: Math.max(
                          1,
                          Number(e.target.value.replace(/\D/g, "")) || 1,
                        ),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    متن زیر لیبل کالا (اختیاری)
                  </label>
                  <Input
                    dir="rtl"
                    className="h-10"
                    placeholder="مثلاً: انبار مرکزی"
                    value={draft.footerText ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, footerText: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                {(
                  [
                    ["showName", "نام کالا روی لیبل"],
                    ["showBarcodeText", "عدد زیر بارکد"],
                    ["cropMarks", "خط برش"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Switch
                      checked={draft[key]}
                      onCheckedChange={(v) => setDraft({ ...draft, [key]: v })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </details>

          <LabelPrinterField draft={draft} setDraft={setDraft} />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              disabled={saveSettings.isPending}
              onClick={() => saveSettings.mutate()}
            >
              {saveSettings.isPending ? "در حال ذخیره…" : "ذخیره تنظیمات"}
            </Button>
            <p className="text-xs text-muted-foreground">
              بعد از ذخیره، چاپ قفسه از اپ فروشنده همان چیدمان را می‌زند.
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


function ConfirmPrintQueuePanel() {
  const qc = useQueryClient();
  const jobs = useQuery({
    queryKey: ["print-jobs", "PRODUCT_LABEL", "PENDING"],
    queryFn: () => getPrintJobs({ type: "PRODUCT_LABEL", status: "PENDING" }),
    refetchInterval: 8_000,
  });

  const confirm = useMutation({
    mutationFn: (id: string) => confirmPrintJob(id),
    onSuccess: () => {
      toast.success("چاپ انجام شد");
      qc.invalidateQueries({ queryKey: ["print-jobs"] });
      qc.invalidateQueries({ queryKey: ["pending-labels"] });
      qc.invalidateQueries({ queryKey: ["label-coverage"] });
    },
    onError: (e: unknown) => {
      const err = e instanceof ApiException ? e : null;
      toast.error(err?.message ?? "چاپ ناموفق بود — پرینتر و تنظیمات را چک کنید");
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelPrintJob(id),
    onSuccess: () => {
      toast.success("از صف چاپ برداشته شد");
      qc.invalidateQueries({ queryKey: ["print-jobs"] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "لغو ناموفق بود");
    },
  });

  const rows = jobs.data ?? [];

  if (jobs.isLoading) return <LoadingState />;
  if (jobs.isError) return <ErrorState onRetry={() => jobs.refetch()} />;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-12 text-center">
        <h3 className="text-base font-bold text-emerald-600">صف چاپ خالی است</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          بعد از تأیید عملیات کارگر، لیبل‌ها اینجا می‌آیند تا روی همین PC تأیید چاپ کنید.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        این صف فقط با زدن «تأیید و چاپ» روی پرینتر لیبل (شبکه / ویندوز) می‌رود.
        از گوشی هم می‌شود job ساخت؛ چاپ فیزیکی اینجا قطعی می‌شود.
      </p>
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>کالا</TableHead>
              <TableHead>قفسه</TableHead>
              <TableHead className="text-center">تعداد لیبل</TableHead>
              <TableHead>تأییدکننده</TableHead>
              <TableHead>زمان</TableHead>
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((job: ProductLabelPrintJob) => {
              const item = job.items[0];
              const busy =
                (confirm.isPending && confirm.variables === job.id) ||
                (cancel.isPending && cancel.variables === job.id);
              return (
                <TableRow key={job.id}>
                  <TableCell>
                    <div className="max-w-[22rem] truncate font-medium">
                      {item?.product?.name ?? "—"}
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {item?.product ? toFa(item.product.sku) : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {item?.location?.path || item?.location?.code || "—"}
                  </TableCell>
                  <TableCell className="text-center tabular-nums font-semibold">
                    {toFa(item?.copies ?? 1)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {job.createdBy?.fullName || job.createdBy?.username || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {faDate(job.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => confirm.mutate(job.id)}
                      >
                        <Printer className="ms-1 size-4" />
                        تأیید و چاپ
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => cancel.mutate(job.id)}
                      >
                        لغو
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function CoveragePanel() {
  const [warehouseId, setWarehouseId] = React.useState<string>("");
  const [selectedLocationId, setSelectedLocationId] = React.useState<string | null>(
    null,
  );
  const [productSelected, setProductSelected] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [productPrintOpen, setProductPrintOpen] = React.useState(false);
  const [productPrintItems, setProductPrintItems] = React.useState<
    { productId: string; quantity: number }[]
  >([]);
  const [shelfPrintOpen, setShelfPrintOpen] = React.useState(false);

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: getWarehouses,
  });

  const coverage = useQuery({
    queryKey: ["label-coverage", warehouseId || "all"],
    queryFn: () =>
      getLabelCoverage({
        warehouseId: warehouseId || undefined,
        onlyWithStock: true,
      }),
  });

  const detail = useQuery({
    queryKey: ["labels-at", selectedLocationId],
    queryFn: () => getLabelsAtLocation(selectedLocationId!),
    enabled: !!selectedLocationId,
  });

  const products = detail.data?.data ?? [];

  React.useEffect(() => {
    setProductSelected(new Set());
  }, [selectedLocationId]);

  const rows: LabelCoverageRow[] = coverage.data?.data ?? [];
  const totals = rows.reduce(
    (acc, r) => {
      acc.labeled += r.labeled;
      acc.unlabeled += r.unlabeled;
      acc.total += r.total;
      return acc;
    },
    { labeled: 0, unlabeled: 0, total: 0 },
  );

  const allProductsSelected =
    products.length > 0 && products.every((p) => productSelected.has(p.productId));
  const someProductsSelected =
    productSelected.size > 0 && !allProductsSelected;

  const toggleProduct = (id: string) =>
    setProductSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAllProducts = () =>
    setProductSelected(
      allProductsSelected
        ? new Set()
        : new Set(products.map((p) => p.productId)),
    );

  const selectUnlabeled = () =>
    setProductSelected(
      new Set(products.filter((p) => !p.labeled).map((p) => p.productId)),
    );

  const openProductPrint = (mode: "selected" | "all") => {
    const list =
      mode === "all"
        ? products
        : products.filter((p) => productSelected.has(p.productId));
    if (list.length === 0) return;
    setProductPrintItems(
      list.map((p) => ({
        productId: p.productId,
        quantity: Math.max(1, Math.floor(p.quantity) || 1),
      })),
    );
    setProductPrintOpen(true);
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-[14rem]">
          <label className="mb-1 block text-xs font-medium">انبار</label>
          <select
            dir="rtl"
            className="h-9 w-full rounded-md border bg-white px-2 text-sm"
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setSelectedLocationId(null);
            }}
          >
            <option value="">همه انبارها</option>
            {(warehouses.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="text-sm text-muted-foreground">
          جمع:{" "}
          <b className="tabular-nums text-foreground">{toFa(totals.total)}</b> کالا —
          لیبل‌دار{" "}
          <b className="tabular-nums text-emerald-700">{toFa(totals.labeled)}</b> — بدون لیبل{" "}
          <b className="tabular-nums text-amber-700">{toFa(totals.unlabeled)}</b>
        </div>
      </Card>

      {coverage.isLoading ? (
        <LoadingState />
      ) : coverage.isError ? (
        <ErrorState onRetry={() => coverage.refetch()} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          برای این فیلتر موجودی فعالی نیست.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden p-0">
            <div className="max-h-[32rem] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>قفسه</TableHead>
                    <TableHead>انبار</TableHead>
                    <TableHead className="text-center">لیبل‌دار</TableHead>
                    <TableHead className="text-center">بدون لیبل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r.locationId}
                      className={`cursor-pointer ${
                        selectedLocationId === r.locationId
                          ? "bg-primary/5"
                          : ""
                      }`}
                      onClick={() => setSelectedLocationId(r.locationId)}
                    >
                      <TableCell>
                        <div className="font-medium">{r.path || r.code}</div>
                        {r.name ? (
                          <div className="text-xs text-muted-foreground">{r.name}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.warehouseName ?? "—"}
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-emerald-700">
                        {toFa(r.labeled)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-amber-700">
                        {toFa(r.unlabeled)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-4">
            {!selectedLocationId ? (
              <p className="text-sm text-muted-foreground">
                یک قفسه را انتخاب کنید تا لیبل موقعیت یا لیبل کالاهای همان قفسه
                را کامل / انتخابی چاپ کنید.
              </p>
            ) : detail.isLoading ? (
              <LoadingState />
            ) : detail.isError ? (
              <ErrorState onRetry={() => detail.refetch()} />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold">
                      {detail.data?.location.path || detail.data?.location.code}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {detail.data?.location.warehouse?.name}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShelfPrintOpen(true)}
                  >
                    <Printer className="ms-1 size-4" />
                    لیبل موقعیت‌ها
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <Checkbox
                      checked={
                        allProductsSelected
                          ? true
                          : someProductsSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={toggleAllProducts}
                    />
                    همه کالاها
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={selectUnlabeled}
                  >
                    فقط چاپ‌نشده
                  </Button>
                  <Badge variant="secondary" className="tabular-nums">
                    {toFa(productSelected.size)} انتخاب
                  </Badge>
                  <div className="ms-auto flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={productSelected.size === 0}
                      onClick={() => openProductPrint("selected")}
                    >
                      چاپ انتخابی
                    </Button>
                    <Button
                      size="sm"
                      disabled={products.length === 0}
                      onClick={() => openProductPrint("all")}
                    >
                      <Printer className="ms-1 size-4" />
                      چاپ همه ({toFa(products.length)})
                    </Button>
                  </div>
                </div>

                <div className="max-h-[28rem] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>کالا</TableHead>
                        <TableHead className="text-center">موجودی</TableHead>
                        <TableHead className="text-center">وضعیت</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((p) => {
                        const on = productSelected.has(p.productId);
                        return (
                          <TableRow
                            key={p.productId}
                            className={on ? "bg-primary/5" : undefined}
                          >
                            <TableCell>
                              <Checkbox
                                checked={on}
                                onCheckedChange={() =>
                                  toggleProduct(p.productId)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <div className="max-w-[16rem] truncate font-medium">
                                {p.name}
                              </div>
                              <div className="text-xs tabular-nums text-muted-foreground">
                                {toFa(p.sku)}
                              </div>
                            </TableCell>
                            <TableCell className="text-center tabular-nums">
                              {qty(p.quantity)}
                            </TableCell>
                            <TableCell className="text-center">
                              {p.labeled ? (
                                <Badge className="bg-emerald-600">چاپ‌شده</Badge>
                              ) : (
                                <Badge variant="destructive">چاپ‌نشده</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <LabelPrintDialog
        open={productPrintOpen}
        onOpenChange={setProductPrintOpen}
        mode="product"
        ids={productPrintItems.map((i) => i.productId)}
        items={productPrintItems}
      />
      <LocationPrintPicker
        open={shelfPrintOpen}
        onOpenChange={setShelfPrintOpen}
        rootId={selectedLocationId}
      />
    </div>
  );
}

/**
 * هاب لیبل‌ها / بارکدها — صف تأیید چاپ PC، کالاهای بدون لیبل، پوشش قفسه.
 * در کارتابل هم با embedded رندر می‌شود.
 */
export function LabelsPanel({ embedded }: { embedded?: boolean } = {}) {
  const pendingJobs = useQuery({
    queryKey: ["print-jobs", "PRODUCT_LABEL", "PENDING"],
    queryFn: () => getPrintJobs({ type: "PRODUCT_LABEL", status: "PENDING" }),
    refetchInterval: 8_000,
  });
  const jobCount = pendingJobs.data?.length ?? 0;

  return (
    <div className="space-y-4">
      {!embedded ? (
        <PageHeader
          title="لیبل‌ها / بارکدها"
          description="صف تأیید چاپ روی PC، کالاهای بدون لیبل، و پوشش لیبل به تفکیک انبار و قفسه"
          icon={Tags}
        />
      ) : null}

      <Tabs defaultValue="confirm">
        <TabsList>
          <TabsTrigger value="confirm">
            صف تأیید چاپ
            {jobCount > 0 ? (
              <Badge variant="destructive" className="mr-1.5 tabular-nums">
                {toFa(jobCount)}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="unprinted">چاپ‌نشده‌ها</TabsTrigger>
          <TabsTrigger value="coverage">انبار / قفسه</TabsTrigger>
        </TabsList>

        <TabsContent value="confirm" className="mt-4">
          <ConfirmPrintQueuePanel />
        </TabsContent>
        <TabsContent value="unprinted" className="mt-4">
          <UnprintedLabelsPanel embedded />
        </TabsContent>
        <TabsContent value="coverage" className="mt-4">
          <CoveragePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** مسیرِ مستقل — پیوندهای قدیمی و بوکمارک‌ها نباید بشکنند. */
export default function LabelsPage() {
  return <LabelsPanel />;
}
