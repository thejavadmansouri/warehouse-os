"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Tag, Trash2, RotateCcw, Palette } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCustomerCategory,
  deactivateCustomerCategory,
  getCustomerCategories,
  updateCustomerCategory,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { toFa } from "@/lib/format";
import type { CustomerCategory } from "@/lib/types";

/** رنگ‌های پیشنهادی — انتخاب یک‌کلیکی، بدون نیاز به color picker. */
const PRESET_COLORS = [
  "#16a34a", // سبز
  "#2563eb", // آبی
  "#d97706", // کهربایی
  "#dc2626", // قرمز
  "#7c3aed", // بنفش
  "#0891b2", // فیروزه‌ای
  "#64748b", // خاکستری
];

/**
 * مدیریت دسته‌های مشتری — ساخت، ویرایش نام/رنگ، غیرفعال‌سازی و بازفعال‌سازی.
 *
 * فقط مدیر/مدیرکل: گارد سمت سرور همین را الزام می‌کند. غیرفعال‌سازی مشتری‌های
 * دسته را دست نمی‌زند — فقط از انتخاب‌های جدید حذفشان می‌کند.
 */
export function CustomerCategoriesDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  /** بعد از هر تغییری صدا زده می‌شود تا dropdownهای باز تازه شوند. */
  onChanged?: () => void;
}) {
  const [newName, setNewName] = React.useState("");
  const [newColor, setNewColor] = React.useState(PRESET_COLORS[0]);
  /** دسته‌ای که در حالت ویرایش نام/رنگ است. */
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editColor, setEditColor] = React.useState(PRESET_COLORS[0]);

  const categories = useQuery({
    queryKey: ["customer-categories"],
    queryFn: getCustomerCategories,
    enabled: open,
  });

  // با بازشدن، حالت‌ها از نو ساخته می‌شوند.
  React.useEffect(() => {
    if (open) {
      setNewName("");
      setNewColor(PRESET_COLORS[0]);
      setEditingId(null);
    }
  }, [open]);

  const invalidate = () => {
    categories.refetch();
    onChanged?.();
  };

  const create = useMutation({
    mutationFn: () =>
      createCustomerCategory({
        name: newName.trim(),
        color: newColor,
      }),
    onSuccess: () => {
      toast.success("دسته ساخته شد");
      setNewName("");
      setNewColor(PRESET_COLORS[0]);
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "ساخت دسته ناموفق بود"),
  });

  const saveEdit = useMutation({
    mutationFn: (c: CustomerCategory) =>
      updateCustomerCategory(c.id, {
        name: editName.trim() || c.name,
        color: editColor,
      }),
    onSuccess: () => {
      toast.success("دسته به‌روز شد");
      setEditingId(null);
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "ذخیره ناموفق بود"),
  });

  const toggleActive = useMutation({
    mutationFn: (c: CustomerCategory) =>
      c.isActive
        ? deactivateCustomerCategory(c.id)
        : updateCustomerCategory(c.id, { isActive: true }),
    onSuccess: (_d, c) => {
      toast.success(c.isActive ? "دسته غیرفعال شد" : "دسته فعال شد");
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "تغییر وضعیت ناموفق بود"),
  });

  const list = categories.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Tag className="size-4" /> دسته‌های مشتری
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* افزودن دسته جدید */}
          <div className="rounded-lg border p-3">
            <div className="mb-2 text-sm font-medium">دسته جدید</div>
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="نام دسته — مثل «عمده»"
                className="h-9 flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) create.mutate();
                }}
              />
              <Button
                size="sm"
                className="h-9 gap-1"
                disabled={!newName.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                <Plus className="size-3.5" />
                افزودن
              </Button>
            </div>
            <ColorPicker value={newColor} onChange={setNewColor} />
          </div>

          {/* فهرست دسته‌ها */}
          {categories.isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              در حال بارگذاری…
            </p>
          ) : list.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              هنوز دسته‌ای تعریف نشده — اولی را بسازید.
            </p>
          ) : (
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {list.map((c) => {
                const editing = editingId === c.id;
                return (
                  <div
                    key={c.id}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm ${
                      c.isActive ? "" : "opacity-50"
                    }`}
                  >
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                      aria-hidden
                    />
                    {editing ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 flex-1"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit.mutate(c);
                          }}
                        />
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={saveEdit.isPending}
                          onClick={() => saveEdit.mutate(c)}
                        >
                          ذخیره
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => setEditingId(null)}
                        >
                          لغو
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {c.name}
                        </span>
                        {typeof c._count?.customers === "number" && (
                          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            {toFa(c._count.customers)} مشتری
                          </span>
                        )}
                        {!c.isActive && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            غیرفعال
                          </span>
                        )}
                        <button
                          type="button"
                          title="ویرایش نام و رنگ"
                          onClick={() => {
                            setEditingId(c.id);
                            setEditName(c.name);
                            setEditColor(c.color);
                          }}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Palette className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          title={c.isActive ? "غیرفعال کردن" : "فعال کردن"}
                          onClick={() => toggleActive.mutate(c)}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {c.isActive ? (
                            <Trash2 className="size-3.5 text-destructive" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                        </button>
                      </>
                    )}
                    {editing && (
                      <div className="mt-2 flex w-full flex-wrap gap-1">
                        {PRESET_COLORS.map((col) => (
                          <button
                            key={col}
                            type="button"
                            onClick={() => setEditColor(col)}
                            className={`size-6 rounded-full border-2 ${
                              editColor === col
                                ? "border-primary"
                                : "border-transparent"
                            }`}
                            style={{ backgroundColor: col }}
                            aria-label={`رنگ ${col}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            غیرفعال‌کردن، مشتری‌های دسته را پاک نمی‌کند — فقط از انتخاب‌های جدید
            حذفشان می‌کند.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** انتخاب رنگ با چیپ‌های از پیش تعریف‌شده — سریع‌تر از color picker. */
function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {PRESET_COLORS.map((col) => (
        <button
          key={col}
          type="button"
          onClick={() => onChange(col)}
          className={`size-6 rounded-full border-2 transition-transform ${
            value === col
              ? "scale-110 border-primary"
              : "border-transparent hover:scale-105"
          }`}
          style={{ backgroundColor: col }}
          aria-label={`رنگ ${col}`}
        />
      ))}
    </div>
  );
}
