"use client";

/**
 * انتخاب لیبل‌های موقعیت زیر یک قفسه/ردیف: همه یا انتخابی،
 * بعد دیالوگ چاپ رول (تنظیمات ذخیره‌شده).
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, MapPin } from "lucide-react";

import { getLocationLabelSubtree } from "@/lib/api";
import { toFa } from "@/lib/format";
import { LabelPrintDialog } from "@/components/labels/label-print-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState, ErrorState } from "@/components/states";

export type LocationPrintPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ریشهٔ درخت (قفسه / ردیف / …) */
  rootId: string | null;
};

export function LocationPrintPicker({
  open,
  onOpenChange,
  rootId,
}: LocationPrintPickerProps) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [printOpen, setPrintOpen] = React.useState(false);
  const [printIds, setPrintIds] = React.useState<string[]>([]);

  const subtreeQ = useQuery({
    queryKey: ["location-label-subtree", rootId],
    queryFn: () => getLocationLabelSubtree(rootId!),
    enabled: open && !!rootId,
  });

  const rows = subtreeQ.data ?? [];

  // با باز شدن / عوض شدن ریشه، همه انتخاب می‌شوند.
  React.useEffect(() => {
    if (!open || !subtreeQ.data) return;
    setSelected(new Set(subtreeQ.data.map((r) => r.id)));
  }, [open, rootId, subtreeQ.data]);

  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const selectLeavesOnly = () => {
    // برگ‌ها: کسانی که هیچ ردیف دیگری pathشان را ادامه نمی‌دهد
    const paths = new Set(rows.map((r) => r.path).filter(Boolean) as string[]);
    const leafIds = rows
      .filter((r) => {
        if (!r.path) return rows.length === 1;
        const prefix = `${r.path} > `;
        return ![...paths].some((p) => p.startsWith(prefix));
      })
      .map((r) => r.id);
    setSelected(new Set(leafIds.length ? leafIds : rows.map((r) => r.id)));
  };

  const goPrint = () => {
    const ids = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    setPrintIds(ids);
    setPrintOpen(true);
  };

  const title =
    rows.find((r) => r.isRoot)?.name ??
    rows.find((r) => r.isRoot)?.path ??
    "چاپ لیبل قفسه";

  return (
    <>
      <Dialog
        open={open && !printOpen}
        onOpenChange={(o) => {
          if (!o) onOpenChange(false);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              چاپ لیبل موقعیت‌ها
            </DialogTitle>
            <DialogDescription>
              «{title}» — همه یا فقط انتخاب‌شده‌ها. اندازه از تنظیمات چاپ
              (رول ۱۰۴mm) می‌آید.
            </DialogDescription>
          </DialogHeader>

          {subtreeQ.isLoading ? (
            <LoadingState />
          ) : subtreeQ.isError ? (
            <ErrorState onRetry={() => subtreeQ.refetch()} />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              موقعیتی برای چاپ پیدا نشد.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                  />
                  انتخاب همه ({toFa(rows.length)})
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={selectLeavesOnly}
                >
                  فقط برگ‌ها
                </Button>
                <Badge variant="secondary" className="tabular-nums">
                  {toFa(selected.size)} انتخاب
                </Badge>
              </div>

              <div className="max-h-[20rem] space-y-1 overflow-auto rounded-lg border p-2">
                {rows.map((r) => {
                  const on = selected.has(r.id);
                  return (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                        on ? "bg-primary/5" : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={on}
                        onCheckedChange={() => toggle(r.id)}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {r.name}
                      </span>
                      {r.typeName ? (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {r.typeName}
                        </Badge>
                      ) : null}
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {r.shortNum}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              بستن
            </Button>
            <Button
              onClick={goPrint}
              disabled={selected.size === 0 || subtreeQ.isLoading}
            >
              <Printer className="h-4 w-4" />
              ادامهٔ چاپ ({toFa(selected.size)})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LabelPrintDialog
        open={printOpen}
        onOpenChange={(o) => {
          setPrintOpen(o);
          if (!o) onOpenChange(false);
        }}
        mode="location"
        ids={printIds}
      />
    </>
  );
}
