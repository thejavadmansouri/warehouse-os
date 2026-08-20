"use client";

/**
 * ساخت گروهیِ درختِ موقعیت — «۶ ردیف، هر ردیف ۱۶ باکس، هر باکس ۳ قفسه».
 *
 * چند تصمیم که عمدی‌اند:
 *
 * **فرمِ عدد، نه تحلیلِ جمله.** وسوسه این است که مدیر جمله بنویسد و ما بفهمیم.
 * تایپِ آن جمله از پر کردنِ چند فیلدِ عدد کندتر است، همان ابهامِ عددِ فارسی و
 * نیم‌فاصله را برمی‌گرداند، و یک برداشتِ غلط چند صد قفسه‌ی اشتباه می‌سازد که
 * کدشان روی برچسب چاپ می‌شود.
 *
 * **زیرِ گرهِ انتخاب‌شده، نه از ریشه.** انبارِ واقعی متقارن نیست — طبقه‌ی اول
 * ۶ ردیف دارد و طبقه‌ی دوم ۴ تا. به‌جای یک فرمِ پیچیده که استثناها را بیان
 * کند، همین فرم برای هر شاخه یک بار اجرا می‌شود. `parentId` از جایی که دکمه
 * زده شده می‌آید، پس نامتقارنی بدونِ هیچ UIِ اضافه‌ای حل است.
 *
 * **پیش‌نمایشِ عدد و نمونه‌کد قبل از ساخت.** چند صد ردیفِ اشتباه، برچسبِ چاپ‌شده
 * و چسبیده روی فلز است؛ برگرداندنش یعنی برچسب‌زدنِ دوباره‌ی انبار.
 *
 * سرور کدهای موجود را رد می‌کند، پس اجرای دوباره چیزی خراب نمی‌کند و اجرای
 * دوباره با عددِ بزرگ‌تر فقط تازه‌ها را اضافه می‌کند — به مدیر هم همین گفته
 * می‌شود تا مجبور نباشد روزِ اول عددها را دقیق بداند.
 */

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X, Layers } from "lucide-react";

import { generateLocationTree } from "@/lib/api";
import type { LocationType } from "@/lib/types";
import { ApiException } from "@/lib/api-error-messages";
import { useToast } from "@/hooks/use-toast";
import { toFa } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** سقفِ محافظتی — بالاتر از این تقریباً همیشه یعنی عددی اشتباه وارد شده. */
const MAX_TOTAL = 20_000;
const MAX_COUNT_PER_LEVEL = 500;

interface LevelRow {
  typeId: string;
  count: number;
  naming: "numeric" | "alpha";
}

export function BulkGenerateDialog({
  open,
  onOpenChange,
  warehouseId,
  parentId,
  parentDepth,
  parentCode,
  parentName,
  types,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  warehouseId: string;
  parentId: string | null;
  parentDepth: number | null;
  /** کدِ گرهِ والد (یا کدِ انبار برای ریشه) — فقط برای نمونه‌کدِ پیش‌نمایش. */
  parentCode: string;
  parentName: string;
  types: LocationType[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [levels, setLevels] = React.useState<LevelRow[]>([]);
  const [result, setResult] = React.useState<{
    createdCount: number;
    skippedCount: number;
    leafCount: number;
  } | null>(null);

  const sorted = React.useMemo(
    () => [...types].sort((a, b) => a.depth - b.depth),
    [types],
  );

  /** انواعِ مجاز برای سطر i: عمیق‌تر از والد و از سطرِ قبلی. */
  const availableFor = React.useCallback(
    (i: number, rows: LevelRow[]) => {
      const prevDepth =
        i === 0
          ? parentDepth
          : (sorted.find((t) => t.id === rows[i - 1]?.typeId)?.depth ?? null);

      return sorted.filter((t) => prevDepth === null || t.depth > prevDepth);
    },
    [sorted, parentDepth],
  );

  // با هر بار باز شدن، از یک سطرِ تمیز شروع کن.
  React.useEffect(() => {
    if (!open) return;
    setResult(null);
    const first = availableFor(0, [])[0];
    setLevels(
      first ? [{ typeId: first.id, count: 1, naming: "numeric" }] : [],
    );
  }, [open, availableFor]);

  const setLevel = (i: number, patch: Partial<LevelRow>) =>
    setLevels((prev) => {
      const next = prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l));

      // اگر نوعِ یک سطر عوض شد، سطرهای بعدی ممکن است دیگر عمیق‌تر نباشند.
      // به‌جای خطا دادن، سطرهای نامعتبر حذف می‌شوند.
      return next.filter((l, idx) => {
        if (idx === 0) return true;
        const prevDepth = sorted.find((t) => t.id === next[idx - 1].typeId)?.depth;
        const myDepth = sorted.find((t) => t.id === l.typeId)?.depth;
        return prevDepth != null && myDepth != null && myDepth > prevDepth;
      });
    });

  const addLevel = () => {
    const opts = availableFor(levels.length, levels);
    if (opts.length === 0) return;
    setLevels((prev) => [
      ...prev,
      { typeId: opts[0].id, count: 1, naming: "numeric" },
    ]);
  };

  const removeLevel = (i: number) =>
    setLevels((prev) => prev.slice(0, i));

  /** مجموعِ مکان‌های ساخته‌شده در همه‌ی سطوح، و تعدادِ برگ‌ها. */
  const { total, leaves } = React.useMemo(() => {
    let running = 1;
    let sum = 0;
    for (const l of levels) {
      running *= Math.max(0, l.count);
      sum += running;
    }
    return { total: sum, leaves: running };
  }, [levels]);

  /** نمونه‌کدِ اولین برگ — همان چیزی که روی برچسب چاپ می‌شود. */
  const sampleCode = React.useMemo(
    () =>
      levels.reduce(
        (code, l) => `${code}-${l.naming === "alpha" ? "A" : "01"}`,
        parentCode,
      ),
    [levels, parentCode],
  );

  const tooMany = total > MAX_TOTAL;
  const canSubmit =
    levels.length > 0 &&
    levels.every((l) => l.count >= 1 && l.count <= MAX_COUNT_PER_LEVEL) &&
    !tooMany;

  const mut = useMutation({
    mutationFn: () =>
      generateLocationTree({
        warehouseId,
        parentId: parentId ?? undefined,
        levels: levels.map((l) => ({
          locationTypeId: l.typeId,
          count: l.count,
          naming: l.naming,
        })),
      }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["loc-children"] });
      toast({
        title: `${toFa(r.createdCount)} موقعیت ساخته شد`,
        description:
          r.skippedCount > 0
            ? `${toFa(r.skippedCount)} مورد از قبل وجود داشت و دست‌نخورده ماند`
            : undefined,
      });
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        title: "ساخت گروهی ناموفق بود",
        description:
          e instanceof ApiException ? e.message : "خطای غیرمنتظره",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-4" /> ساخت گروهی زیر «{parentName}»
          </DialogTitle>
          <DialogDescription>
            هر سطر یک سطح است. «۶ ردیف، هر ردیف ۱۶ باکس» یعنی دو سطر.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2 text-sm">
            <div className="rounded-md border bg-muted/40 p-3">
              <div>ساخته شد: <b>{toFa(result.createdCount)}</b> موقعیت</div>
              {result.skippedCount > 0 && (
                <div className="text-muted-foreground">
                  از قبل موجود بود: {toFa(result.skippedCount)} (دست‌نخورده ماند)
                </div>
              )}
              <div className="text-muted-foreground">
                آخرین سطح: {toFa(result.leafCount)} مورد
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              برای چاپ برچسب‌ها، از دکمه‌ی چاپ روی همان گره در درخت استفاده کن.
              اگر تعدادی جا مانده، همین فرم را دوباره با عدد بزرگ‌تر اجرا کن —
              موارد موجود دوباره ساخته نمی‌شوند.
            </p>
          </div>
        ) : (
          <div className="space-y-2 py-1">
            {levels.map((l, i) => {
              const opts = availableFor(i, levels);
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-xs text-muted-foreground">
                    {toFa(i + 1)}.
                  </span>

                  <Select
                    value={l.typeId}
                    onValueChange={(v) => setLevel(i, { typeId: v })}
                  >
                    <SelectTrigger className="h-9 w-32">
                      <SelectValue placeholder="نوع" />
                    </SelectTrigger>
                    <SelectContent>
                      {opts.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    type="number"
                    min={1}
                    max={MAX_COUNT_PER_LEVEL}
                    value={l.count}
                    onChange={(e) =>
                      setLevel(i, { count: Number(e.target.value) || 0 })
                    }
                    className="h-9 w-20"
                    aria-label="تعداد"
                  />

                  <Select
                    value={l.naming}
                    onValueChange={(v) =>
                      setLevel(i, { naming: v as "numeric" | "alpha" })
                    }
                  >
                    <SelectTrigger className="h-9 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="numeric">۰۱، ۰۲</SelectItem>
                      <SelectItem value="alpha">A، B</SelectItem>
                    </SelectContent>
                  </Select>

                  {i === levels.length - 1 && i > 0 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => removeLevel(i)}
                      aria-label="حذف این سطح"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              );
            })}

            {availableFor(levels.length, levels).length > 0 && (
              <button
                onClick={addLevel}
                className="flex items-center gap-1 pt-1 text-sm text-primary hover:underline"
              >
                <Plus className="size-4" /> افزودن سطح
              </button>
            )}

            <div className="mt-3 rounded-md border bg-muted/40 p-3 text-sm">
              {total > 0 ? (
                <>
                  <div>
                    <b>{toFa(total)}</b> موقعیت ساخته می‌شود
                    {leaves !== total && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({toFa(leaves)} تا در آخرین سطح)
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    نمونه کد: {sampleCode}
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground">
                  تعداد هر سطح را وارد کن
                </span>
              )}

              {tooMany && (
                <div className="mt-2 text-xs text-destructive">
                  بیش از {toFa(MAX_TOTAL)} موقعیت — احتمالاً عددی اشتباه وارد
                  شده. اعداد را کم کن یا شاخه‌به‌شاخه بساز.
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>بستن</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                انصراف
              </Button>
              <Button
                disabled={!canSubmit || mut.isPending}
                onClick={() => mut.mutate()}
              >
                {mut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "بساز"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
