"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronDown,
  Plus,
  Trash2,
  Printer,
  Warehouse as WarehouseIcon,
  MapPin,
  Pencil,
  Loader2,
  Search,
  Layers,
} from "lucide-react";

import {
  getWarehouses,
  getInactiveWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  reactivateWarehouse,
  getLocationChildren,
  getLocationTypes,
  createLocation,
  deleteLocation,
  bulkDeleteLocations,
  getLocationSubtreeStats,
  resolveLocationByBarcode,
} from "@/lib/api";
import type { Location, Warehouse, LocationType } from "@/lib/types";
import { ApiException } from "@/lib/api-error-messages";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { LabelPrintDialog } from "@/components/labels/label-print-dialog";
import { BulkGenerateDialog } from "./_components/bulk-generate-dialog";

// ---------------------------------------------------------------------------
// Context — انتخاب چندتایی، درخواست حذف، چاپ لیبل (تا در سراسر درخت در دسترس باشد)
// ---------------------------------------------------------------------------
type TreeCtxValue = {
  selected: Set<string>;
  toggle: (id: string) => void;
  requestDelete: (node: Location) => void;
  requestPrint: (id: string) => void;
};
const TreeCtx = React.createContext<TreeCtxValue | null>(null);
const useTree = () => {
  const c = React.useContext(TreeCtx);
  if (!c) throw new Error("TreeCtx missing");
  return c;
};

// کلید کوئریِ فرزندان یک گره (یا ریشه‌ی یک انبار)
const childrenKey = (parentId: string | null, warehouseId?: string) => [
  "loc-children",
  warehouseId ?? "all",
  parentId ?? "root",
];

// ---------------------------------------------------------------------------
// افزودن inline — یک ردیف با انتخاب نوع + نام + دکمه؛ بعد از ساخت، فوکوس می‌ماند
// تا ساخت هم‌نیای بعدی سریع باشد (Row A → Row B → …)
// ---------------------------------------------------------------------------
function InlineAdd({
  warehouseId,
  parentId,
  parentCode,
  parentName,
  parentDepth,
  types,
}: {
  warehouseId: string;
  parentId: string | null;
  parentCode: string;
  parentName: string;
  parentDepth: number | null;
  types: LocationType[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [typeId, setTypeId] = React.useState<string>("");
  const [name, setName] = React.useState("");
  const nameRef = React.useRef<HTMLInputElement>(null);

  // فقط انواعِ عمیق‌تر از این سطح (اجازه‌ی رد شدن از سطوح، ولی نه معکوس)
  const available = React.useMemo(
    () =>
      [...types]
        .filter((t) => parentDepth === null || t.depth > parentDepth)
        .sort((a, b) => a.depth - b.depth),
    [types, parentDepth]
  );

  React.useEffect(() => {
    if (open && !typeId && available.length > 0) setTypeId(available[0].id);
  }, [open, available, typeId]);

  const mut = useMutation({
    mutationFn: () =>
      createLocation({
        name: name.trim(),
        typeId,
        parentId: parentId ?? undefined,
        warehouseId,
      }),
    onSuccess: (loc) => {
      toast({ title: `«${loc.name}» ساخته شد` });
      qc.invalidateQueries({ queryKey: ["loc-children"] });
      setName("");
      // فوکوس بماند تا هم‌نیای بعدی سریع وارد شود
      requestAnimationFrame(() => nameRef.current?.focus());
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof ApiException ? e.message : "ساخت موقعیت ناموفق بود",
      });
    },
  });

  if (available.length === 0) {
    return (
      <div className="py-1 pr-2 text-xs text-muted-foreground">
        نوعی برای این سطح تعریف نشده —{" "}
        <a href="/admin/location-types" className="text-primary hover:underline">
          افزودن نوع موقعیت
        </a>
      </div>
    );
  }

  const bulkDialog = (
    <BulkGenerateDialog
      open={bulkOpen}
      onOpenChange={setBulkOpen}
      warehouseId={warehouseId}
      parentId={parentId}
      parentDepth={parentDepth}
      parentCode={parentCode}
      parentName={parentName}
      types={types}
    />
  );

  if (!open) {
    return (
      <div className="flex items-center gap-3 py-1 pr-2">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <Plus className="size-4" /> افزودن
        </button>
        {/* ساختِ چند صد قفسه یکی‌یکی ممکن نیست — همان‌جایی که «افزودن» هست. */}
        <button
          onClick={() => setBulkOpen(true)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary hover:underline"
        >
          <Layers className="size-4" /> ساخت گروهی
        </button>
        {bulkDialog}
      </div>
    );
  }

  const canSubmit = typeId !== "" && name.trim() !== "" && !mut.isPending;

  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5 pr-2">
      <Select value={typeId} onValueChange={setTypeId}>
        <SelectTrigger className="h-9 w-32">
          <SelectValue placeholder="نوع" />
        </SelectTrigger>
        <SelectContent>
          {available.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        ref={nameRef}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit) mut.mutate();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="نام (مثلاً ردیف ۱)"
        className="h-9 w-44"
      />
      <Button size="sm" disabled={!canSubmit} onClick={() => mut.mutate()}>
        {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : "افزودن"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        بستن
      </Button>
      {bulkDialog}
    </div>
  );
}

// ---------------------------------------------------------------------------
// فهرست فرزندان یک گره (lazy) + ردیف افزودن
// ---------------------------------------------------------------------------
function ChildrenList({
  parentId,
  parentCode,
  parentName,
  warehouseId,
  parentDepth,
  types,
  depth,
}: {
  parentId: string | null;
  /** کد و نامِ والد فقط برای پیش‌نمایشِ ساختِ گروهی لازم‌اند. */
  parentCode: string;
  parentName: string;
  warehouseId: string;
  parentDepth: number | null;
  types: LocationType[];
  depth: number;
}) {
  const q = useQuery({
    queryKey: childrenKey(parentId, parentId ? undefined : warehouseId),
    queryFn: () =>
      parentId
        ? getLocationChildren(parentId)
        : getLocationChildren(undefined, warehouseId),
  });

  return (
    <div style={{ paddingInlineStart: 18 }} className="border-r border-dashed">
      {q.isLoading ? (
        <div className="py-2 pr-2 text-xs text-muted-foreground">
          <Loader2 className="inline size-3 animate-spin" /> در حال بارگذاری…
        </div>
      ) : q.isError ? (
        <div className="py-2 pr-2 text-xs text-destructive">
          خطا در بارگذاری —{" "}
          <button onClick={() => q.refetch()} className="underline">
            تلاش مجدد
          </button>
        </div>
      ) : (
        <>
          {(q.data ?? []).map((node) => (
            <LocationNode
              key={node.id}
              node={node}
              warehouseId={warehouseId}
              types={types}
              depth={depth}
            />
          ))}
          <InlineAdd
            warehouseId={warehouseId}
            parentId={parentId}
            parentCode={parentCode}
            parentName={parentName}
            parentDepth={parentDepth}
            types={types}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// گره‌ی موقعیت
// ---------------------------------------------------------------------------
function LocationNode({
  node,
  warehouseId,
  types,
  depth,
}: {
  node: Location;
  warehouseId: string;
  types: LocationType[];
  depth: number;
}) {
  const { selected, toggle, requestDelete, requestPrint } = useTree();
  const [open, setOpen] = React.useState(false);
  const hasChildren = (node._count?.children ?? 0) > 0;

  return (
    <div>
      <div className="group flex items-center gap-1.5 rounded-md py-1 pr-1 hover:bg-muted/50">
        <Checkbox
          checked={selected.has(node.id)}
          onCheckedChange={() => toggle(node.id)}
          className="ms-1"
        />
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex size-6 items-center justify-center text-muted-foreground"
          aria-label={open ? "بستن" : "باز کردن"}
        >
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronLeft className={hasChildren ? "size-4" : "size-4 opacity-30"} />
          )}
        </button>
        <MapPin className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{node.name}</span>
        {node.type?.name ? (
          <Badge variant="outline" className="text-[10px]">
            {node.type.name}
          </Badge>
        ) : null}
        {node.code ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            {node.code}
          </span>
        ) : null}
        <div className="ms-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            title="چاپ لیبل"
            onClick={() => requestPrint(node.id)}
          >
            <Printer className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-destructive hover:text-destructive"
            title="حذف"
            onClick={() => requestDelete(node)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {open ? (
        <ChildrenList
          parentId={node.id}
          parentCode={node.code ?? ""}
          parentName={node.name}
          warehouseId={warehouseId}
          parentDepth={node.type?.depth ?? null}
          types={types}
          depth={depth + 1}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// گره‌ی انبار (ریشه‌ی درخت)
// ---------------------------------------------------------------------------
function WarehouseNode({
  wh,
  onEdit,
  onDelete,
}: {
  wh: Warehouse;
  onEdit: (wh: Warehouse) => void;
  onDelete: (wh: Warehouse) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const typesQ = useQuery({
    queryKey: ["location-types", wh.id],
    queryFn: () => getLocationTypes(wh.id),
    enabled: open,
  });
  const types = typesQ.data ?? [];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 bg-muted/40 px-2 py-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex size-7 items-center justify-center text-muted-foreground"
        >
          {open ? <ChevronDown className="size-5" /> : <ChevronLeft className="size-5" />}
        </button>
        <WarehouseIcon className="size-5 text-primary" />
        <span className="font-semibold">{wh.name}</span>
        <Badge variant="secondary" className="font-mono text-[10px]">
          {wh.code}
        </Badge>
        <div className="ms-auto flex items-center gap-0.5">
          <Button size="icon" variant="ghost" className="size-7" title="ویرایش نام" onClick={() => onEdit(wh)}>
            <Pencil className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-destructive hover:text-destructive"
            title="حذف انبار"
            onClick={() => onDelete(wh)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {open ? (
        <CardContent className="py-2">
          {typesQ.isLoading ? (
            <div className="py-2 text-xs text-muted-foreground">
              <Loader2 className="inline size-3 animate-spin" /> …
            </div>
          ) : (
            <ChildrenList
              parentId={null}
              parentCode={wh.code}
              parentName={wh.name}
              warehouseId={wh.id}
              parentDepth={null}
              types={types}
              depth={0}
            />
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

// ===========================================================================
// صفحه
// ===========================================================================
export default function LocationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const whQ = useQuery({ queryKey: ["warehouses"], queryFn: () => getWarehouses() });
  const warehouses = whQ.data ?? [];

  // انتخاب چندتایی
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const clearSel = () => setSelected(new Set());

  // چاپ لیبل
  const [printIds, setPrintIds] = React.useState<string[]>([]);
  const [printOpen, setPrintOpen] = React.useState(false);
  const requestPrint = (id: string) => {
    setPrintIds([id]);
    setPrintOpen(true);
  };

  // حذف تکی (با آمار زیردرخت)
  const [delTarget, setDelTarget] = React.useState<Location | null>(null);
  // تصمیمِ موجودی وقتی قفسه جنس دارد: انتقال به قفسه‌ی دیگر یا تصفیه.
  const [stockAction, setStockAction] =
    React.useState<"transfer" | "writeoff">("transfer");
  const [destBarcode, setDestBarcode] = React.useState("");
  const [destLoc, setDestLoc] = React.useState<Location | null>(null);
  const [writeoffReason, setWriteoffReason] = React.useState("");

  // با باز/بسته شدن دیالوگ، انتخاب‌ها از نو.
  React.useEffect(() => {
    setStockAction("transfer");
    setDestBarcode("");
    setDestLoc(null);
    setWriteoffReason("");
  }, [delTarget?.id]);

  const statsQ = useQuery({
    queryKey: ["subtree-stats", delTarget?.id],
    queryFn: () => getLocationSubtreeStats(delTarget!.id),
    enabled: !!delTarget,
  });

  // اسکن/تایپِ بارکدِ قفسه‌ی مقصد → همان‌جا حل می‌شود تا مدیر ببیند کجاست.
  const resolveDest = useMutation({
    mutationFn: (barcode: string) => resolveLocationByBarcode(barcode.trim()),
    onSuccess: (loc) => setDestLoc(loc),
    onError: () => {
      setDestLoc(null);
      toast({ variant: "destructive", title: "قفسه‌ای با این بارکد پیدا نشد" });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => {
      const stockOpts =
        statsQ.data?.hasStock === true
          ? stockAction === "transfer"
            ? { stockAction: "transfer" as const, destinationLocationId: destLoc?.id }
            : { stockAction: "writeoff" as const, reason: writeoffReason.trim() }
          : undefined;
      return deleteLocation(id, stockOpts);
    },
    onSuccess: (r) => {
      toast({ title: r.message });
      qc.invalidateQueries({ queryKey: ["loc-children"] });
      setDelTarget(null);
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof ApiException ? e.message : "حذف ناموفق بود",
      }),
  });

  // وقتی جنس دارد، تا تصمیمِ معتبر گرفته نشود اجازه‌ی حذف نده.
  const delReady =
    !statsQ.data?.hasStock ||
    (stockAction === "transfer" && !!destLoc) ||
    (stockAction === "writeoff" && writeoffReason.trim().length > 0);

  // حذف گروهی
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const bulkMut = useMutation({
    mutationFn: () => bulkDeleteLocations([...selected]),
    onSuccess: (r) => {
      toast({ title: r.message });
      qc.invalidateQueries({ queryKey: ["loc-children"] });
      clearSel();
      setBulkOpen(false);
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof ApiException ? e.message : "حذف گروهی ناموفق بود",
      }),
  });

  // ساخت/ویرایش انبار
  const [whDialog, setWhDialog] = React.useState<
    { mode: "create" } | { mode: "edit"; wh: Warehouse } | null
  >(null);
  const [whName, setWhName] = React.useState("");
  const [whCode, setWhCode] = React.useState("");
  React.useEffect(() => {
    if (whDialog?.mode === "edit") {
      setWhName(whDialog.wh.name);
      setWhCode(whDialog.wh.code);
    } else if (whDialog?.mode === "create") {
      setWhName("");
      setWhCode("");
    }
  }, [whDialog]);
  // کد فقط وقتی قابل ویرایش است که انبار هنوز قفسه‌ای نساخته باشد (لیبلی چاپ نشده).
  const whCodeLocked =
    whDialog?.mode === "edit" && (whDialog.wh.locationCount ?? 0) > 0;
  // پیشنهادِ بازگردانی وقتی کدِ واردشده مالِ یک انبارِ غیرفعال است.
  const [restoreOffer, setRestoreOffer] = React.useState<
    { id: string; name: string } | null
  >(null);

  const whMut = useMutation({
    mutationFn: () =>
      whDialog?.mode === "edit"
        ? updateWarehouse(whDialog.wh.id, {
            name: whName.trim(),
            // کد را همیشه می‌فرستیم؛ اگر عوض نشده باشد سرور no-op می‌کند و اگر
            // انبار قفسه داشته باشد و کد فرق کند، سرور با پیام روشن ردش می‌کند.
            code: whCode.trim().toUpperCase(),
          })
        : createWarehouse({ name: whName.trim(), code: whCode.trim().toUpperCase() }),
    onSuccess: () => {
      toast({ title: whDialog?.mode === "edit" ? "انبار ویرایش شد" : "انبار ساخته شد" });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      setWhDialog(null);
    },
    onError: (e) => {
      // کدِ متعلق به انبارِ غیرفعال → به‌جای بن‌بست، پیشنهادِ بازگردانی.
      if (e instanceof ApiException && e.code === "WAREHOUSE_CODE_INACTIVE") {
        const raw = e.raw as unknown as {
          warehouseId?: string;
          warehouseName?: string;
        };
        if (raw.warehouseId) {
          setWhDialog(null);
          setRestoreOffer({
            id: raw.warehouseId,
            name: raw.warehouseName ?? "",
          });
          return;
        }
      }
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof ApiException ? e.message : "عملیات انبار ناموفق بود",
      });
    },
  });

  // بازگردانیِ انبارِ غیرفعال — هم از پیشنهادِ بالا، هم از بخشِ «انبارهای غیرفعال».
  const inactiveQ = useQuery({
    queryKey: ["warehouses-inactive"],
    queryFn: () => getInactiveWarehouses(),
  });
  const reactivateMut = useMutation({
    mutationFn: (id: string) => reactivateWarehouse(id),
    onSuccess: (r) => {
      toast({ title: r.message });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["warehouses-inactive"] });
      setRestoreOffer(null);
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof ApiException ? e.message : "بازگردانی ناموفق بود",
      }),
  });

  // حذف انبار
  const [whDelTarget, setWhDelTarget] = React.useState<Warehouse | null>(null);
  const whDelMut = useMutation({
    mutationFn: (id: string) => deleteWarehouse(id),
    onSuccess: (r) => {
      toast({ title: r.message });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["warehouses-inactive"] });
      setWhDelTarget(null);
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: "خطا",
        description: e instanceof ApiException ? e.message : "حذف انبار ناموفق بود",
      }),
  });

  // جستجوی بارکد (پرش سریع)
  const [barcode, setBarcode] = React.useState("");
  const [found, setFound] = React.useState<Location | null>(null);
  const [findErr, setFindErr] = React.useState<string | null>(null);
  const lookup = async () => {
    const code = barcode.trim();
    if (!code) return;
    setFindErr(null);
    try {
      setFound(await resolveLocationByBarcode(code));
    } catch {
      setFound(null);
      setFindErr("موقعیتی با این بارکد پیدا نشد");
    }
  };

  const ctx: TreeCtxValue = { selected, toggle, requestDelete: setDelTarget, requestPrint };

  return (
    <TreeCtx.Provider value={ctx}>
      <div className="space-y-5">
        <PageHeader
          title="موقعیت‌ها / قفسه‌ها"
          description="ساختار فیزیکی انبار را به‌صورت درختی بسازید و مدیریت کنید."
          actions={
            <Button onClick={() => setWhDialog({ mode: "create" })}>
              <WarehouseIcon className="size-4" /> انبار جدید
            </Button>
          }
        />

        {/* جستجوی بارکد */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
              placeholder="بارکد موقعیت را وارد یا اسکن کنید…"
              className="pr-9"
            />
          </div>
          <Button variant="outline" onClick={lookup} disabled={!barcode.trim()}>
            یافتن
          </Button>
        </div>
        {findErr && <p className="text-sm text-destructive">{findErr}</p>}
        {found && (
          <Card className="border-primary/40">
            <CardContent className="flex items-center gap-3 py-3">
              <MapPin className="size-5 text-primary" />
              <div className="flex-1">
                <div className="font-medium">{found.name}</div>
                <div className="text-sm text-muted-foreground">{found.path || found.code}</div>
              </div>
              <Badge variant="secondary" className="font-mono">{found.barcode || found.code}</Badge>
              <Button size="sm" variant="outline" onClick={() => requestPrint(found.id)}>
                <Printer className="size-4" /> چاپ
              </Button>
            </CardContent>
          </Card>
        )}

        {/* نوار انتخاب گروهی */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                {selected.size} مورد انتخاب‌شده
              </Badge>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearSel}>
                لغو انتخاب
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => { setPrintIds([...selected]); setPrintOpen(true); }}>
                <Printer className="size-4" /> چاپ لیبل‌ها
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setBulkOpen(true)}>
                <Trash2 className="size-4" /> حذف انتخاب‌شده‌ها
              </Button>
            </div>
          </div>
        )}

        {/* درخت */}
        {whQ.isLoading ? (
          <LoadingState />
        ) : whQ.isError ? (
          <ErrorState onRetry={() => whQ.refetch()} />
        ) : warehouses.length === 0 ? (
          <EmptyState
            title="هیچ انباری ثبت نشده"
            description="برای شروع یک انبار بسازید، بعد داخلش سطوح (طبقه، ردیف، …) را اضافه کنید."
          />
        ) : (
          <div className="space-y-2">
            {warehouses.map((wh) => (
              <WarehouseNode
                key={wh.id}
                wh={wh}
                onEdit={(w) => setWhDialog({ mode: "edit", wh: w })}
                onDelete={setWhDelTarget}
              />
            ))}
          </div>
        )}

        {/*
          انبارهای غیرفعال — این‌ها از فهرست بالا حذف شده‌اند ولی کدشان هنوز
          اشغال است. یک‌جا دیده می‌شوند تا کاربر بداند «حذف‌شده» یعنی چه و با یک
          کلیک برشان گرداند. اگر چیزی غیرفعال نباشد، اصلاً نشان داده نمی‌شود.
        */}
        {(inactiveQ.data?.length ?? 0) > 0 && (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <WarehouseIcon className="size-4" />
              انبارهای غیرفعال ({inactiveQ.data!.length})
            </div>
            <p className="text-xs text-muted-foreground">
              این‌ها حذف نشده‌اند، فقط کنار گذاشته شده‌اند — کد و قفسه‌ها و
              موجودی‌شان محفوظ است. برای استفاده‌ی دوباره، بازشان گردان.
            </p>
            <div className="space-y-1.5">
              {inactiveQ.data!.map((wh) => (
                <div
                  key={wh.id}
                  className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2"
                >
                  <WarehouseIcon className="size-4 text-muted-foreground" />
                  <span className="font-medium">{wh.name}</span>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {wh.code}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {wh.locationCount ? `${wh.locationCount} قفسه` : "خالی"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ms-auto"
                    disabled={reactivateMut.isPending}
                    onClick={() => reactivateMut.mutate(wh.id)}
                  >
                    بازگردانی
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* چاپ لیبل */}
      <LabelPrintDialog open={printOpen} onOpenChange={setPrintOpen} mode="location" ids={printIds} />

      {/* دیالوگ حذف تکی */}
      <Dialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف موقعیت</DialogTitle>
            <DialogDescription>
              {statsQ.isLoading ? (
                "در حال بررسی…"
              ) : statsQ.data ? (
                statsQ.data.descendantCount > 0 ? (
                  <>
                    «{delTarget?.name}» شامل <b>{statsQ.data.descendantCount}</b> زیرمجموعه است.{" "}
                    {statsQ.data.willDeactivate
                      ? "چون سابقه‌ی موجودی دارد، این موقعیت و زیرمجموعه‌هایش فقط غیرفعال می‌شوند."
                      : "این موقعیت و همه‌ی زیرمجموعه‌هایش حذف می‌شوند."}
                  </>
                ) : statsQ.data.willDeactivate ? (
                  "این موقعیت سابقه‌ی موجودی دارد و فقط غیرفعال می‌شود."
                ) : (
                  "این موقعیت حذف می‌شود."
                )
              ) : (
                "«" + (delTarget?.name ?? "") + "» حذف شود؟"
              )}
            </DialogDescription>
          </DialogHeader>

          {/*
            جنسِ روی قفسه‌ی حذف‌شده «بی‌صاحب» و غیرقابل‌فروش می‌شود. پس اگر
            موجودیِ زنده دارد، اول تکلیفش را می‌گیریم: انتقال به قفسه‌ی دیگر،
            یا تصفیه (صفر کردن) با دلیل.
          */}
          {statsQ.data?.hasStock && (
            <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
                ⚠️ روی این شاخه <b>{statsQ.data.stockUnits}</b> عدد موجودی
                (روی {statsQ.data.stockLocations} قفسه) هست. قبل از حذف، تکلیفش را روشن کن:
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStockAction("transfer")}
                  className={`rounded-md border p-2 text-sm font-medium transition-colors ${
                    stockAction === "transfer"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:border-primary"
                  }`}
                >
                  انتقال به قفسه‌ی دیگر
                </button>
                <button
                  type="button"
                  onClick={() => setStockAction("writeoff")}
                  className={`rounded-md border p-2 text-sm font-medium transition-colors ${
                    stockAction === "writeoff"
                      ? "border-destructive bg-destructive text-white"
                      : "hover:border-destructive"
                  }`}
                >
                  تصفیه (صفر کردن)
                </button>
              </div>

              {stockAction === "transfer" ? (
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-muted-foreground">
                    بارکد قفسه‌ی مقصد را اسکن یا تایپ کن، بعد Enter
                  </span>
                  <div className="flex gap-2">
                    <Input
                      value={destBarcode}
                      onChange={(e) => {
                        setDestBarcode(e.target.value);
                        setDestLoc(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && destBarcode.trim()) {
                          e.preventDefault();
                          resolveDest.mutate(destBarcode);
                        }
                      }}
                      placeholder="بارکد قفسه‌ی مقصد"
                      className="h-10"
                    />
                    <Button
                      variant="outline"
                      disabled={!destBarcode.trim() || resolveDest.isPending}
                      onClick={() => resolveDest.mutate(destBarcode)}
                    >
                      {resolveDest.isPending ? <Loader2 className="size-4 animate-spin" /> : "یافتن"}
                    </Button>
                  </div>
                  {destLoc && (
                    <p className="text-sm text-emerald-700 dark:text-emerald-400">
                      ✓ مقصد: <b>{destLoc.path ?? destLoc.name}</b>
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    دلیلِ تصفیه (اجباری) — مثلاً «مغایرت انبارگردانی» یا «ضایعات»
                  </span>
                  <Input
                    value={writeoffReason}
                    onChange={(e) => setWriteoffReason(e.target.value)}
                    placeholder="دلیل تصفیه"
                    className="h-10"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDelTarget(null)} disabled={delMut.isPending}>
              انصراف
            </Button>
            <Button
              variant="destructive"
              disabled={delMut.isPending || !delReady}
              onClick={() => delTarget && delMut.mutate(delTarget.id)}
            >
              {delMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ حذف گروهی */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف گروهی</DialogTitle>
            <DialogDescription>
              {selected.size} موقعیت انتخاب شده. موارد خالی و بی‌سابقه حذف و موارد دارای
              موجودی فقط غیرفعال می‌شوند. زیرمجموعه‌ها هم شامل می‌شوند. ادامه؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkMut.isPending}>
              انصراف
            </Button>
            <Button variant="destructive" disabled={bulkMut.isPending} onClick={() => bulkMut.mutate()}>
              {bulkMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "حذف انتخاب‌شده‌ها"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ ساخت/ویرایش انبار */}
      <Dialog open={!!whDialog} onOpenChange={(o) => !o && setWhDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{whDialog?.mode === "edit" ? "ویرایش انبار" : "انبار جدید"}</DialogTitle>
            <DialogDescription>
              {whDialog?.mode === "edit"
                ? whCodeLocked
                  ? "نام را آزادانه عوض کن. کد قفل است چون این انبار قفسه دارد و کدش روی لیبل‌ها چاپ شده."
                  : "این انبار هنوز قفسه‌ای ندارد، پس کد هم قابل ویرایش است."
                : "نام و یک کد کوتاه (حروف بزرگ/عدد) برای انبار وارد کنید."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">نام انبار</label>
              <Input value={whName} onChange={(e) => setWhName(e.target.value)} placeholder="مثلاً انبار مرکزی" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">کد انبار</label>
              <Input
                value={whCode}
                onChange={(e) => setWhCode(e.target.value.toUpperCase())}
                placeholder="مثلاً WH01"
                disabled={whCodeLocked}
                className="font-mono"
              />
              {whCodeLocked && (
                <p className="text-xs text-muted-foreground">
                  کد روی لیبل‌های چاپ‌شده نشسته و قابل تغییر نیست.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhDialog(null)} disabled={whMut.isPending}>
              انصراف
            </Button>
            <Button
              disabled={
                whMut.isPending ||
                whName.trim() === "" ||
                (whDialog?.mode === "create" && whCode.trim() === "")
              }
              onClick={() => whMut.mutate()}
            >
              {whMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "ذخیره"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ حذف انبار */}
      <Dialog open={!!whDelTarget} onOpenChange={(o) => !o && setWhDelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف انبار «{whDelTarget?.name}»</DialogTitle>
            <DialogDescription asChild>
              {(whDelTarget?.locationCount ?? 0) > 0 ? (
                <div className="space-y-2 text-sm">
                  <p>
                    این انبار <b>{whDelTarget?.locationCount}</b> قفسه دارد، پس
                    واقعاً حذف نمی‌شود — فقط <b>غیرفعال</b> می‌شود: از فهرست
                    برداشته می‌شود ولی کد و قفسه‌ها و موجودی و سابقه‌اش می‌مانند و
                    کدش هم اشغال می‌ماند. هر وقت بخواهی از بخشِ «انبارهای غیرفعال»
                    برش می‌گردانی.
                  </p>
                  <p className="text-muted-foreground">
                    فقط می‌خواهی اسم را عوض کنی؟ به‌جای حذف، از دکمه‌ی ویرایش (مداد)
                    استفاده کن.
                  </p>
                </div>
              ) : (
                <span>
                  این انبار خالی است و کاملاً حذف می‌شود. مطمئنی؟
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhDelTarget(null)} disabled={whDelMut.isPending}>
              انصراف
            </Button>
            <Button
              variant="destructive"
              disabled={whDelMut.isPending}
              onClick={() => whDelTarget && whDelMut.mutate(whDelTarget.id)}
            >
              {whDelMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (whDelTarget?.locationCount ?? 0) > 0 ? (
                "غیرفعال کن"
              ) : (
                "حذف"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* پیشنهادِ بازگردانی — وقتی کدِ واردشده مالِ انبارِ غیرفعال است */}
      <Dialog open={!!restoreOffer} onOpenChange={(o) => !o && setRestoreOffer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>این کد مالِ یک انبارِ غیرفعال است</DialogTitle>
            <DialogDescription>
              کدی که زدی متعلق به انبار «{restoreOffer?.name}» است که قبلاً غیرفعال
              شده. می‌خواهی همان انبار را با همه‌ی قفسه‌ها و موجودی‌اش برگردانی؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRestoreOffer(null)}
              disabled={reactivateMut.isPending}
            >
              نه، کدِ دیگری می‌زنم
            </Button>
            <Button
              disabled={reactivateMut.isPending}
              onClick={() => restoreOffer && reactivateMut.mutate(restoreOffer.id)}
            >
              {reactivateMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "بله، بازگردان"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TreeCtx.Provider>
  );
}
