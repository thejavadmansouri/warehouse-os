"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Image,
  Search,
  Check,
  X,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Loader2,
  AlertTriangle,
  ExternalLink,
  ZoomIn,
  ImageOff,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Ban,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getImageCandidates,
  getImageStats,
  approveCandidate,
  rejectCandidate,
  startImageSearch,
  bulkApproveImages,
  bulkRejectImages,
  searchAgain,
  apiUrl,
  type ImageCandidate,
  type CandidateFilter,
  type ImageStats,
} from "@/lib/api";
import { toFa, formatNumber } from "@/lib/format";

// ═══════════════════════════════════════════════════════════════
// Filter definitions
// ═══════════════════════════════════════════════════════════════

const STATUS_FILTERS: { value: CandidateFilter; label: string; color?: string }[] = [
  { value: "ALL", label: "همه" },
  { value: "PENDING", label: "در انتظار", color: "bg-yellow-100 text-yellow-800" },
  { value: "HIGH_CONFIDENCE", label: "اعتماد بالا", color: "bg-green-100 text-green-800" },
  { value: "MEDIUM_CONFIDENCE", label: "اعتماد متوسط", color: "bg-blue-100 text-blue-800" },
  { value: "LOW_CONFIDENCE", label: "اعتماد پایین", color: "bg-orange-100 text-orange-800" },
  { value: "APPROVED", label: "تأیید شده", color: "bg-emerald-100 text-emerald-800" },
  { value: "REJECTED", label: "رد شده", color: "bg-red-100 text-red-800" },
  { value: "FAILED", label: "خطا", color: "bg-gray-100 text-gray-800" },
];

// ═══════════════════════════════════════════════════════════════
// Stats Card
// ═══════════════════════════════════════════════════════════════

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  color?: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-xl p-2.5 ${color ?? "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          {loading ? (
            <div className="mt-1 h-6 w-16 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-lg font-bold tabular-nums">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Confidence Badge
// ═══════════════════════════════════════════════════════════════

function ConfidenceBadge({ score, level }: { score: number; level: string }) {
  const config = {
    HIGH: { icon: ShieldCheck, color: "bg-green-100 text-green-800", label: "بالا" },
    MEDIUM: { icon: ShieldQuestion, color: "bg-blue-100 text-blue-800", label: "متوسط" },
    LOW: { icon: ShieldAlert, color: "bg-orange-100 text-orange-800", label: "پایین" },
    NONE: { icon: Ban, color: "bg-red-100 text-red-800", label: "نامعتبر" },
  }[level] ?? { icon: Ban, color: "bg-gray-100", label: level };

  const Icon = config.icon;
  return (
    <Badge variant="secondary" className={`gap-1 ${config.color}`}>
      <Icon className="h-3 w-3" />
      {score}% — {config.label}
    </Badge>
  );
}

// ═══════════════════════════════════════════════════════════════
// Status Badge
// ═══════════════════════════════════════════════════════════════

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    PENDING: { label: "در انتظار", color: "bg-yellow-100 text-yellow-800" },
    PROCESSING: { label: "پردازش", color: "bg-blue-100 text-blue-800" },
    APPROVED: { label: "تأیید شده", color: "bg-emerald-100 text-emerald-800" },
    REJECTED: { label: "رد شده", color: "bg-red-100 text-red-800" },
    FAILED: { label: "خطا", color: "bg-gray-100 text-gray-800" },
  };
  const c = config[status] ?? { label: status, color: "bg-gray-100" };
  return <Badge variant="secondary" className={c.color}>{c.label}</Badge>;
}

// ═══════════════════════════════════════════════════════════════
// Image URL helper
// ═══════════════════════════════════════════════════════════════

function imageUrl(path: string | null): string | null {
  if (!path) return null;
  // If it's a staging path (relative), serve through authenticated endpoint
  if (path.startsWith("storage/")) {
    return `${apiUrl()}/admin/product-images/file/${path}`;
  }
  // If it starts with /storage/, it's a public static file
  if (path.startsWith("/storage/")) {
    return `${apiUrl()}${path}`;
  }
  return path;
}

// ═══════════════════════════════════════════════════════════════
// Candidate Card
// ═══════════════════════════════════════════════════════════════

function CandidateCard({
  candidate,
  selected,
  onToggle,
  onApprove,
  onReject,
  onSearchAgain,
  onViewDetail,
  approving,
  rejecting,
}: {
  candidate: ImageCandidate;
  selected: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSearchAgain: () => void;
  onViewDetail: () => void;
  approving: boolean;
  rejecting: boolean;
}) {
  const originalUrl = imageUrl(candidate.localPath);
  const processedUrl = imageUrl(candidate.processedPath);
  const isPending = candidate.status === "PENDING";

  return (
    <Card className={`overflow-hidden shadow-sm transition-all ${selected ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-start gap-3 p-4">
        <Checkbox checked={selected} onCheckedChange={onToggle} />

        <div className="flex-1 min-w-0">
          {/* Product info */}
          <div className="mb-2">
            <h3 className="font-medium truncate">{candidate.product.name}</h3>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-1">
              {candidate.product.brand && <span>برند: {candidate.product.brand}</span>}
              {candidate.product.partNumber && <span>شماره فنی: {candidate.product.partNumber}</span>}
              <span>SKU: {toFa(candidate.product.sku)}</span>
            </div>
          </div>

          {/* Images */}
          <div className="flex gap-3 mb-3">
            {originalUrl && (
              <div className="relative group">
                <img
                  src={originalUrl}
                  alt="Original"
                  className="h-28 w-28 object-contain rounded-lg border bg-white"
                  loading="lazy"
                />
                <span className="absolute bottom-1 right-1 text-[10px] bg-black/60 text-white px-1 rounded">
                  اصلی
                </span>
              </div>
            )}
            {processedUrl && (
              <div className="relative group">
                <img
                  src={processedUrl}
                  alt="Processed"
                  className="h-28 w-28 object-contain rounded-lg border bg-white"
                  loading="lazy"
                />
                <span className="absolute bottom-1 right-1 text-[10px] bg-black/60 text-white px-1 rounded">
                  پردازش‌شده
                </span>
              </div>
            )}
            {!originalUrl && !processedUrl && (
              <div className="h-28 w-28 flex items-center justify-center rounded-lg border border-dashed bg-muted/50">
                <ImageOff className="h-8 w-8 text-muted-foreground/40" />
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <ConfidenceBadge score={candidate.confidenceScore} level={candidate.confidenceLevel} />
            <StatusBadge status={candidate.status} />
            {candidate.sourceDomain && (
              <Badge variant="outline" className="gap-1">
                <ExternalLink className="h-2.5 w-2.5" />
                {candidate.sourceDomain}
              </Badge>
            )}
          </div>

          {candidate.matchReason && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
              {candidate.matchReason}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      {isPending && (
        <div className="flex items-center gap-2 border-t px-4 py-2.5 bg-muted/30">
          <Button
            size="sm"
            className="gap-1 bg-green-600 hover:bg-green-700"
            onClick={onApprove}
            disabled={approving || rejecting}
          >
            {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            تأیید
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="gap-1"
            onClick={onReject}
            disabled={approving || rejecting}
          >
            {rejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            رد
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={onSearchAgain}>
            <RefreshCw className="h-3.5 w-3.5" />
            جستجوی دوباره
          </Button>
          <Button size="sm" variant="ghost" className="gap-1 ms-auto" onClick={onViewDetail}>
            <Eye className="h-3.5 w-3.5" />
            جزئیات
          </Button>
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Detail Dialog
// ═══════════════════════════════════════════════════════════════

function DetailDialog({
  candidate,
  open,
  onClose,
  onApprove,
  onReject,
  approving,
  rejecting,
}: {
  candidate: ImageCandidate | null;
  open: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
  rejecting: boolean;
}) {
  const [zoomSrc, setZoomSrc] = React.useState<string | null>(null);
  if (!candidate) return null;

  const originalUrl = imageUrl(candidate.localPath);
  const processedUrl = imageUrl(candidate.processedPath);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{candidate.product.name}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Product Info */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground">مشخصات محصول</h4>
              <div className="space-y-1.5 text-sm">
                <div><span className="text-muted-foreground">نام:</span> {candidate.product.name}</div>
                <div><span className="text-muted-foreground">برند:</span> {candidate.product.brand ?? "—"}</div>
                <div><span className="text-muted-foreground">شماره فنی:</span> {candidate.product.partNumber ?? "—"}</div>
                <div><span className="text-muted-foreground">SKU:</span> {toFa(candidate.product.sku)}</div>
                {candidate.product.vehicleModel && (
                  <div><span className="text-muted-foreground">خودرو:</span> {candidate.product.vehicleModel}</div>
                )}
              </div>

              <h4 className="font-medium text-sm text-muted-foreground mt-4">اطلاعات تصویر</h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">اعتماد:</span>
                  <ConfidenceBadge score={candidate.confidenceScore} level={candidate.confidenceLevel} />
                </div>
                <div><span className="text-muted-foreground">منبع:</span> {candidate.sourceDomain ?? "—"}</div>
                <div><span className="text-muted-foreground">عبارت جستجو:</span> {candidate.searchQuery ?? "—"}</div>
                <div><span className="text-muted-foreground">ابعاد اصلی:</span> {candidate.originalWidth}×{candidate.originalHeight}</div>
                <div><span className="text-muted-foreground">حجم اصلی:</span> {candidate.originalSize ? `${Math.round(candidate.originalSize / 1024)} KB` : "—"}</div>
                {candidate.processedWidth && (
                  <div><span className="text-muted-foreground">ابعاد پردازش:</span> {candidate.processedWidth}×{candidate.processedHeight}</div>
                )}
                <div><span className="text-muted-foreground">بدون پس‌زمینه:</span> {candidate.backgroundRemoved ? "✅" : "❌"}</div>
                {candidate.matchReason && (
                  <div className="text-xs bg-muted p-2 rounded mt-2">{candidate.matchReason}</div>
                )}
              </div>
            </div>

            {/* Images */}
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">تصویر اصلی</h4>
                {originalUrl ? (
                  <img
                    src={originalUrl}
                    alt="Original"
                    className="w-full rounded-lg border bg-white cursor-zoom-in"
                    onClick={() => setZoomSrc(originalUrl!)}
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center rounded-lg border border-dashed bg-muted/50">
                    <ImageOff className="h-12 w-12 text-muted-foreground/30" />
                  </div>
                )}
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">تصویر پردازش‌شده</h4>
                {processedUrl ? (
                  <img
                    src={processedUrl}
                    alt="Processed"
                    className="w-full rounded-lg border bg-white cursor-zoom-in"
                    onClick={() => setZoomSrc(processedUrl!)}
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center rounded-lg border border-dashed bg-muted/50">
                    <ImageOff className="h-12 w-12 text-muted-foreground/30" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 mt-4">
            {candidate.status === "PENDING" && (
              <>
                <Button
                  className="gap-1 bg-green-600 hover:bg-green-700"
                  onClick={onApprove}
                  disabled={approving || rejecting}
                >
                  {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  تأیید و انتشار
                </Button>
                <Button
                  variant="destructive"
                  className="gap-1"
                  onClick={onReject}
                  disabled={approving || rejecting}
                >
                  {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  رد کردن
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zoom Dialog */}
      {zoomSrc && (
        <Dialog open onOpenChange={(v) => !v && setZoomSrc(null)}>
          <DialogContent className="max-w-[90vw] max-h-[90vh] p-2">
            <img src={zoomSrc} alt="Zoomed" className="w-full h-full object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════

export default function ProductImagesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = React.useState<CandidateFilter>("ALL");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [detailCandidate, setDetailCandidate] = React.useState<ImageCandidate | null>(null);
  const [showStats, setShowStats] = React.useState(false);

  const LIMIT = 20;

  // Stats — polled faster while the background search queue still has work, so
  // the queue banner and the new candidates appear as the worker drains it.
  const stats = useQuery({
    queryKey: ["image-stats"],
    queryFn: getImageStats,
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && (d.searchQueued > 0 || d.searchRunning > 0) ? 5000 : 30000;
    },
  });

  const queueActive = !!stats.data && (stats.data.searchQueued > 0 || stats.data.searchRunning > 0);

  // Candidates list
  const candidates = useQuery({
    queryKey: ["image-candidates", filter, search, page],
    queryFn: () =>
      getImageCandidates({
        page,
        limit: LIMIT,
        filter: filter !== "ALL" ? filter : undefined,
        search: search || undefined,
      }),
    refetchInterval: queueActive ? 10000 : false,
  });

  // Mutations
  const approveMut = useMutation({
    mutationFn: approveCandidate,
    onSuccess: () => {
      toast.success("تصویر تأیید و منتشر شد");
      qc.invalidateQueries({ queryKey: ["image-candidates"] });
      qc.invalidateQueries({ queryKey: ["image-stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در تأیید"),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => rejectCandidate(id, reason),
    onSuccess: () => {
      toast.success("تصویر رد شد");
      qc.invalidateQueries({ queryKey: ["image-candidates"] });
      qc.invalidateQueries({ queryKey: ["image-stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در رد"),
  });

  const searchMut = useMutation({
    mutationFn: startImageSearch,
    onSuccess: (r) => {
      // The search now runs in the background; the queue counters in the stats
      // header update as the worker drains it.
      if (r.queued === 0 && r.alreadyQueued > 0) {
        toast.info(`${r.alreadyQueued} محصول از قبل در صف جستجو هستند`);
      } else if (r.queued === 0) {
        toast.info("محصولی برای جستجو پیدا نشد");
      } else {
        toast.success(
          `${r.queued} محصول به صف جستجو اضافه شد — نتایج به‌تدریج نمایش داده می‌شوند`,
        );
      }
      qc.invalidateQueries({ queryKey: ["image-candidates"] });
      qc.invalidateQueries({ queryKey: ["image-stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در جستجو"),
  });

  const bulkApproveMut = useMutation({
    mutationFn: (ids: string[]) => bulkApproveImages(ids),
    onSuccess: (r) => {
      toast.success(`${r.approved} تصویر تأیید شد`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["image-candidates"] });
      qc.invalidateQueries({ queryKey: ["image-stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در تأیید گروهی"),
  });

  const bulkRejectMut = useMutation({
    mutationFn: (ids: string[]) => bulkRejectImages(ids),
    onSuccess: (r) => {
      toast.success(`${r.rejected} تصویر رد شد`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["image-candidates"] });
      qc.invalidateQueries({ queryKey: ["image-stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در رد گروهی"),
  });

  const searchAgainMut = useMutation({
    mutationFn: searchAgain,
    onSuccess: (r) => {
      toast.success(
        r.queued > 0
          ? "به صف جستجو اضافه شد — نتیجه به‌زودی نمایش داده می‌شود"
          : "این محصول از قبل در صف جستجو است",
      );
      qc.invalidateQueries({ queryKey: ["image-candidates"] });
      qc.invalidateQueries({ queryKey: ["image-stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  const data = candidates.data;
  const s = stats.data;
  const totalPages = data?.meta.lastPage ?? 1;

  const allSelected =
    data?.data && data.data.length > 0 && data.data.every((c) => selected.has(c.id));
  const highConfSelected =
    data?.data
      .filter((c) => selected.has(c.id))
      .filter((c) => c.confidenceLevel === "HIGH").length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="تصاویر محصولات"
        description="جستجو، بررسی و تأیید تصاویر خودکار برای محصولات"
        icon={Image}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <StatCard
          title="کل محصولات"
          value={s ? toFa(s.totalProducts) : "…"}
          icon={BarChart3}
          loading={stats.isLoading}
        />
        <StatCard
          title="بدون تصویر"
          value={s ? toFa(s.productsWithoutImages) : "…"}
          icon={ImageOff}
          loading={stats.isLoading}
          color="bg-orange-100 text-orange-700"
        />
        <StatCard
          title="در انتظار بررسی"
          value={s ? toFa(s.candidatesPending) : "…"}
          icon={Eye}
          loading={stats.isLoading}
          color="bg-yellow-100 text-yellow-700"
        />
        <StatCard
          title="اعتماد بالا"
          value={s ? toFa(s.highConfidence) : "…"}
          icon={ShieldCheck}
          loading={stats.isLoading}
          color="bg-green-100 text-green-700"
        />
        <StatCard
          title="تأیید شده"
          value={s ? toFa(s.candidatesApproved) : "…"}
          icon={Check}
          loading={stats.isLoading}
          color="bg-emerald-100 text-emerald-700"
        />
        <StatCard
          title="پیشرفت"
          value={s ? `%${toFa(s.progress)}` : "…"}
          icon={BarChart3}
          loading={stats.isLoading}
          color="bg-blue-100 text-blue-700"
        />
      </div>

      {/* Background queue progress — visible only while the worker has work */}
      {s && (s.searchQueued > 0 || s.searchRunning > 0) && (
        <Card className="border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/30">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <span className="font-medium text-blue-900 dark:text-blue-200">
              جستجوی تصویر در حال اجرا در پس‌زمینه
            </span>
            <span className="text-blue-700 dark:text-blue-300">
              {toFa(s.searchQueued)} در صف
              {s.searchRunning > 0 ? ` • ${toFa(s.searchRunning)} در حال پردازش` : ""}
              {s.searchFailed > 0 ? ` • ${toFa(s.searchFailed)} ناموفق` : ""}
            </span>
          </div>
        </Card>
      )}

      {/* Search bar & Actions */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="جستجو بر اساس نام، شماره فنی، SKU..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-10"
            />
          </div>
          <Button
            className="gap-1"
            onClick={() => searchMut.mutate({ limit: 20 })}
            disabled={searchMut.isPending}
          >
            {searchMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            جستجوی خودکار (۲۰ محصول)
          </Button>
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? "default" : "outline"}
            onClick={() => { setFilter(f.value); setPage(1); }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <Card className="p-3 bg-primary/5 border-primary/20">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">
              {toFa(selected.size)} انتخاب شده
              {highConfSelected > 0 && (
                <span className="text-green-600 ms-2">
                  ({toFa(highConfSelected)} با اعتماد بالا)
                </span>
              )}
            </span>
            <Button
              size="sm"
              className="gap-1 bg-green-600 hover:bg-green-700"
              disabled={highConfSelected === 0 || bulkApproveMut.isPending}
              onClick={() => {
                const ids = Array.from(selected).filter((id) => {
                  const c = data?.data.find((x) => x.id === id);
                  return c?.confidenceLevel === "HIGH";
                });
                bulkApproveMut.mutate(ids);
              }}
            >
              <Check className="h-3.5 w-3.5" />
              تأیید گروهی (فقط اعتماد بالا)
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1"
              disabled={bulkRejectMut.isPending}
              onClick={() => bulkRejectMut.mutate(Array.from(selected))}
            >
              <X className="h-3.5 w-3.5" />
              رد گروهی
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="ms-auto"
              onClick={() => setSelected(new Set())}
            >
              لغو انتخاب
            </Button>
          </div>
        </Card>
      )}

      {/* Candidates list */}
      {candidates.isLoading ? (
        <LoadingState />
      ) : candidates.isError ? (
        <ErrorState onRetry={() => candidates.refetch()} />
      ) : !data?.data.length ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <ImageOff className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-base font-bold text-muted-foreground">
            تصویری یافت نشد
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            با فیلتر «جستجوی خودکار» شروع کنید تا برای محصولات بدون تصویر کاندیدا جمع‌آوری شود.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {toFa(data.meta.total)} نتیجه — صفحه {toFa(page)} از {toFa(totalPages)}
            </span>
            <div className="flex items-center gap-1">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() => {
                  if (allSelected) {
                    setSelected(new Set());
                  } else {
                    setSelected(new Set(data.data.map((c) => c.id)));
                  }
                }}
              />
              <span className="text-xs">انتخاب همه</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.data.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                selected={selected.has(c.id)}
                onToggle={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                    return next;
                  });
                }}
                onApprove={() => approveMut.mutate(c.id)}
                onReject={() => rejectMut.mutate({ id: c.id })}
                onSearchAgain={() => searchAgainMut.mutate(c.id)}
                onViewDetail={() => setDetailCandidate(c)}
                approving={approveMut.isPending}
                rejecting={rejectMut.isPending}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-sm tabular-nums">
                {toFa(page)} / {toFa(totalPages)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Detail dialog */}
      <DetailDialog
        candidate={detailCandidate}
        open={!!detailCandidate}
        onClose={() => setDetailCandidate(null)}
        onApprove={() => {
          if (detailCandidate) {
            approveMut.mutate(detailCandidate.id);
            setDetailCandidate(null);
          }
        }}
        onReject={() => {
          if (detailCandidate) {
            rejectMut.mutate({ id: detailCandidate.id });
            setDetailCandidate(null);
          }
        }}
        approving={approveMut.isPending}
        rejecting={rejectMut.isPending}
      />
    </div>
  );
}
