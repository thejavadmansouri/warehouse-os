"use client";

// طبق بخش ۶.۱۱ — ورود اکسل محصولات
// مراحل: upload → preview → confirm
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { FileSpreadsheet, Upload, CheckCircle2, Info } from "lucide-react";
import { uploadImport, confirmImport } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ApiException } from "@/lib/api-error-messages";
import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ImportUploadResponse, ImportPreviewRow } from "@/lib/types";

const REQUIRED_COLUMNS: { key: string; label: string }[] = [
  { key: "productName", label: "نام قطعه" },
  { key: "brand", label: "برند" },
  { key: "vehicleModel", label: "خودرو" },
  { key: "partNumber", label: "شماره فنی" },
  { key: "unit", label: "واحد" },
  { key: "purchasePrice", label: "قیمت خرید" },
];

/** داخلِ صفحه‌ی میزبان سرتیترِ خودش را نشان نمی‌دهد. */
export function ImportsPanel({ embedded }: { embedded?: boolean } = {}) {
  const { toast } = useToast();

  const [file, setFile] = React.useState<File | null>(null);
  const [uploadResult, setUploadResult] =
    React.useState<ImportUploadResponse | null>(null);
  const [createMissing, setCreateMissing] = React.useState(true);
  const [done, setDone] = React.useState(false);

  // طبق بخش ۶.۱۱ — POST /imports/upload
  const uploadMut = useMutation({
    mutationFn: () => uploadImport(file!),
    onSuccess: (r) => {
      setUploadResult(r);
      setDone(false);
      toast({
        title: "فایل بارگذاری شد",
        description: `پیش‌نمایش ${r.preview?.length ?? 0} ردیف آماده است.`,
      });
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiException ? e.message : "خطا در بارگذاری فایل";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  // طبق بخش ۶.۱۱ — POST /imports/:id/confirm
  const confirmMut = useMutation({
    mutationFn: () => confirmImport(uploadResult!.id, { createMissingEntities: createMissing }),
    onSuccess: () => {
      toast({ title: "وارد کردن تکمیل شد" });
      setDone(true);
      setUploadResult(null);
      setFile(null);
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiException ? e.message : "خطا در وارد کردن";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f ?? null);
    setUploadResult(null);
    setDone(false);
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast({ variant: "destructive", title: "هیچ فایلی انتخاب نشده" });
      return;
    }
    uploadMut.mutate();
  };

  // استخراج کلیدهای ستون‌ها از اولین ردیف
  const previewRows: ImportPreviewRow[] = uploadResult?.preview ?? [];
  const columns = React.useMemo(() => {
    if (previewRows.length === 0) return [];
    return Object.keys(previewRows[0]);
  }, [previewRows]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact={embedded}
        title="ورود اکسل"
        description="بارگذاری فایل اکسل محصولات و وارد کردن دسته‌ای"
        icon={FileSpreadsheet}
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>ستون‌های موردنیاز فایل اکسل</AlertTitle>
        <AlertDescription>
          <span>
            ستون‌های زیر باید در فایل اکسل وجود داشته باشند (نام فارسی یا انگلیسی
            هر دو پشتیبانی می‌شود):
          </span>
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {REQUIRED_COLUMNS.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="font-mono">
                  {c.key}
                </Badge>
                <span className="text-muted-foreground">{c.label}</span>
              </li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4 text-accent" />
            بارگذاری فایل
          </CardTitle>
          <CardDescription>
            فایل با پسوند <code className="font-mono">.xlsx</code> یا{" "}
            <code className="font-mono">.xls</code> انتخاب کنید.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="import-file">فایل اکسل</Label>
              <Input
                id="import-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={uploadMut.isPending || !file}
              >
                {uploadMut.isPending ? (
                  <LoadingState className="py-0" />
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    بارگذاری
                  </>
                )}
              </Button>
              {file ? (
                <span className="text-xs text-muted-foreground">
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {uploadMut.isError ? (
        <ErrorState
          message={
            uploadMut.error instanceof ApiException
              ? uploadMut.error.message
              : "بارگذاری ناموفق بود"
          }
          onRetry={() => uploadMut.mutate()}
        />
      ) : null}

      {uploadResult ? (
        <Card className="shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">پیش‌نمایش ردیف‌ها</CardTitle>
              <CardDescription>
                شناسه ایمپورت:{" "}
                <code className="font-mono text-xs">{uploadResult.id}</code> ·{" "}
                {previewRows.length} ردیف
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {previewRows.length === 0 ? (
              <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                هیچ ردیفی برای پیش‌نمایش وجود ندارد.
              </div>
            ) : (
              <ScrollArea className="max-h-[28rem] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-end">#</TableHead>
                      {columns.map((c) => (
                        <TableHead key={c} className="font-mono text-xs">
                          {c}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-end text-xs text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        {columns.map((c) => (
                          <TableCell
                            key={c}
                            className="max-w-[12rem] truncate text-xs"
                            title={String(row[c] ?? "")}
                          >
                            {String(row[c] ?? "")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}

            <div className="flex flex-col gap-4 rounded-md border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="create-missing"
                  checked={createMissing}
                  onCheckedChange={(v) => setCreateMissing(!!v)}
                />
                <Label htmlFor="create-missing" className="text-sm">
                  ایجاد موجودیت‌های مفقودی (برندها، مدل‌های خودرو و ...)
                </Label>
              </div>
              <Button
                onClick={() => confirmMut.mutate()}
                disabled={confirmMut.isPending || previewRows.length === 0}
              >
                {confirmMut.isPending ? (
                  <LoadingState className="py-0" />
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    تایید و وارد کردن
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {done ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle>عملیات موفق</AlertTitle>
          <AlertDescription>
            داده‌ها با موفقیت وارد سیستم شدند.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}


/** مسیرِ مستقل — پیوندهای قدیمی نباید بشکنند. */
export default function ImportsPage() {
  return <ImportsPanel />;
}
