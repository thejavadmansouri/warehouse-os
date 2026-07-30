"use client";

// طبق بخش ۶.۱۲ — کاتالوگ قطعات
// نقش: فقط لاگین کافی است.
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ListTree,
  Plus,
  Pencil,
  Trash2,
  Search,
  AlertTriangle,
} from "lucide-react";
import {
  getPartCatalog,
  searchPartCatalog,
  createPartCatalog,
  updatePartCatalog,
  deletePartCatalog,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ApiException } from "@/lib/api-error-messages";
import { PageHeader } from "@/components/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/states";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PartCatalog, CreatePartCatalogDto } from "@/lib/types";

type FormState = {
  name: string;
  aliasesRaw: string; // کاما جدا
  unit: string;
};

const emptyForm: FormState = { name: "", aliasesRaw: "", unit: "" };

function toDto(f: FormState): CreatePartCatalogDto {
  return {
    name: f.name.trim(),
    aliases: f.aliasesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    unit: f.unit.trim() || undefined,
  };
}

export default function PartCatalogPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  // debounce جستجو
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // لیست/جستجو — کلید ["part-catalog"]
  const listQ = useQuery({
    queryKey: ["part-catalog", debounced],
    queryFn: () =>
      debounced ? searchPartCatalog(debounced) : getPartCatalog(),
  });

  // دیالوگ ساخت/ویرایش
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PartCatalog | null>(null);
  const [form, setForm] = React.useState<FormState>(emptyForm);

  // دیالوگ حذف
  const [deleteTarget, setDeleteTarget] = React.useState<PartCatalog | null>(
    null
  );

  // ----- mutations -----

  // طبق بخش ۶.۱۲ — POST /part-catalog
  const createMut = useMutation({
    mutationFn: () => createPartCatalog(toDto(form)),
    onSuccess: () => {
      toast({ title: "قطعه ساخته شد" });
      qc.invalidateQueries({ queryKey: ["part-catalog"] });
      setFormOpen(false);
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiException ? e.message : "خطا در ساخت قطعه";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  // طبق بخش ۶.۱۲ — PATCH /part-catalog/:id
  const updateMut = useMutation({
    mutationFn: () => updatePartCatalog(editing!.id, toDto(form)),
    onSuccess: () => {
      toast({ title: "قطعه به‌روزرسانی شد" });
      qc.invalidateQueries({ queryKey: ["part-catalog"] });
      setFormOpen(false);
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiException ? e.message : "خطا در ویرایش قطعه";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  // طبق بخش ۶.۱۲ — DELETE /part-catalog/:id
  const deleteMut = useMutation({
    mutationFn: () => deletePartCatalog(deleteTarget!.id),
    onSuccess: () => {
      toast({ title: "قطعه حذف شد" });
      qc.invalidateQueries({ queryKey: ["part-catalog"] });
      setDeleteTarget(null);
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiException ? e.message : "خطا در حذف قطعه";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (p: PartCatalog) => {
    setEditing(p);
    setForm({
      name: p.name,
      aliasesRaw: Array.isArray(p.aliases) ? p.aliases.join(", ") : "",
      unit: p.unit ?? "",
    });
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "نام قطعه الزامی است" });
      return;
    }
    if (editing) updateMut.mutate();
    else createMut.mutate();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="کاتالوگ قطعات"
        description="مدیریت قطعاتی که موتور تشخیص گفتار آن‌ها را شناسایی می‌کند"
        icon={ListTree}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            قطعه جدید
          </Button>
        }
      />

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>مهم</AlertTitle>
        <AlertDescription>
          هر قطعه‌ای که در این کاتالوگ نباشد، موتور تشخیص گفتار آن را شناسایی
          نمی‌کند. برای دقت بالاتر، همه‌ی قطعات رایج را اضافه کنید.
        </AlertDescription>
      </Alert>

      <Card className="shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جستجوی نام یا نام مستعار قطعه..."
                className="pr-8"
              />
            </div>
            <Button
              variant="outline"
              onClick={openCreate}
              className="shrink-0"
            >
              <Plus className="h-4 w-4" />
              قطعه جدید
            </Button>
          </div>

          {listQ.isLoading ? (
            <LoadingState />
          ) : listQ.isError ? (
            <ErrorState
              message="بارگذاری کاتالوگ ناموفق بود"
              onRetry={() => listQ.refetch()}
            />
          ) : !listQ.data?.length ? (
            <EmptyState
              title="قطعه‌ای یافت نشد"
              description={
                debounced
                  ? "نتیجه‌ای برای جستجوی شما وجود ندارد."
                  : "هنوز قطعه‌ای ثبت نشده است."
              }
              action={
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  افزودن اولین قطعه
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead>نام‌های مستعار</TableHead>
                  <TableHead>واحد</TableHead>
                  <TableHead className="text-end">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      {Array.isArray(p.aliases) && p.aliases.length > 0 ? (
                        <div className="flex max-w-md flex-wrap gap-1">
                          {p.aliases.map((a, i) => (
                            <Badge key={`${a}-${i}`} variant="secondary">
                              {a}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.unit ?? "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(p)}
                          aria-label="ویرایش"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(p)}
                          aria-label="حذف"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* دیالوگ ساخت/ویرایش */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش قطعه" : "قطعه جدید"}</DialogTitle>
            <DialogDescription>
              {editing
                ? `ویرایش «${editing.name}»`
                : "اطلاعات قطعه را وارد کنید."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="part-name">نام *</Label>
              <Input
                id="part-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="مثلاً لاستیک پراید"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="part-aliases">نام‌های مستعار</Label>
              <Input
                id="part-aliases"
                value={form.aliasesRaw}
                onChange={(e) =>
                  setForm((f) => ({ ...f, aliasesRaw: e.target.value }))
                }
                placeholder="با کاما جدا کنید: تایر، لاستیک جلو، ..."
              />
              <p className="text-xs text-muted-foreground">
                موتور گفتار از این نام‌ها نیز برای تطبیق استفاده می‌کند.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="part-unit">واحد</Label>
              <Input
                id="part-unit"
                value={form.unit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, unit: e.target.value }))
                }
                placeholder="مثلاً عدد / جفت / بسته"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={createMut.isPending || updateMut.isPending}
            >
              انصراف
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                createMut.isPending ||
                updateMut.isPending ||
                !form.name.trim()
              }
            >
              {createMut.isPending || updateMut.isPending
                ? "در حال ذخیره..."
                : editing
                ? "ذخیره تغییرات"
                : "افزودن قطعه"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ تایید حذف */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="حذف قطعه"
        description={
          <>
            آیا از حذف قطعه «<b>{deleteTarget?.name}</b>» مطمئن هستید؟ این
            عملیات قابل بازگشت نیست.
          </>
        }
        confirmText="حذف"
        destructive
        loading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
      />
    </div>
  );
}
