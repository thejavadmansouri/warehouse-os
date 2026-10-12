"use client";

/**
 * انتشار صفحهٔ سایت برای کالاهایی که عکس، لیبل چاپ‌شده و موجودی دارند.
 * عکس‌های دوربین اپ اینجا به عکس سایت (WebP + واترمارک) تبدیل می‌شوند.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, ImagePlus, Check } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LoadingState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  apiUrl,
  listSiteReadyProducts,
  promoteInventoryPhotos,
  publishProductSitePage,
  type SiteReadyProduct,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { qty, toFa } from "@/lib/format";

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "default" : "outline"} className="font-normal">
      {label}
    </Badge>
  );
}

function thumbSrc(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const clean = path.replace(/^\/+/, "");
  return `${apiUrl()}/admin/product-images/file/${clean}`;
}

export default function SiteProductsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["site-ready-products"],
    queryFn: () => listSiteReadyProducts(150),
  });

  const promote = useMutation({
    mutationFn: (id: string) => promoteInventoryPhotos(id),
    onSuccess: (res) => {
      toast.success(
        res.promoted > 0
          ? `${toFa(res.promoted)} عکس برای سایت آماده شد`
          : "عکس جدیدی برای تبدیل نبود",
      );
      if (res.published) toast.success("صفحهٔ سایت منتشر شد");
      qc.invalidateQueries({ queryKey: ["site-ready-products"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "تبدیل عکس ناموفق بود"),
  });

  const publish = useMutation({
    mutationFn: (id: string) => publishProductSitePage(id),
    onSuccess: (res) => {
      if (res.published) toast.success("صفحهٔ سایت منتشر شد");
      else toast.message(res.reason ?? "هنوز آماده نیست");
      qc.invalidateQueries({ queryKey: ["site-ready-products"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiException ? e.message : "انتشار ناموفق بود"),
  });

  const rows: SiteReadyProduct[] = list.data?.data ?? [];
  const busyId =
    promote.isPending || publish.isPending
      ? (promote.variables ?? publish.variables)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="صفحهٔ سایت کالاها"
        description="عکس دوربین اپ را برای سایت آماده کنید و وقتی لیبل و موجودی هم هست، صفحه را منتشر کنید"
        icon={Globe}
      />

      {list.isLoading ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : !rows.length ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          کالایی با موجودی برای انتشار پیدا نشد. بعد از ورود کالا و عکس‌برداری از
          اپ، اینجا دیده می‌شود.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">عکس</TableHead>
                <TableHead>کالا</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>موجودی</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead className="text-start">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const src = thumbSrc(p.image);
                const pending = busyId === p.id;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt=""
                          className="size-10 rounded object-cover"
                        />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded bg-muted text-muted-foreground">
                          <ImagePlus className="size-4" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="tabular-nums" dir="ltr">
                      {p.sku}
                    </TableCell>
                    <TableCell className="tabular-nums">{qty(p.stock)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Flag ok={p.hasImage} label="عکس سایت" />
                        <Flag ok={p.hasLabel} label="لیبل" />
                        <Flag ok={p.stock > 0} label="موجودی" />
                        {p.showOnline ? (
                          <Badge className="gap-1 bg-emerald-600">
                            <Check className="size-3" />
                            منتشر
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {!p.hasImage ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => promote.mutate(p.id)}
                          >
                            آماده‌سازی عکس
                          </Button>
                        ) : null}
                        {!p.showOnline ? (
                          <Button
                            size="sm"
                            disabled={pending || !p.ready}
                            onClick={() => publish.mutate(p.id)}
                          >
                            انتشار صفحه
                          </Button>
                        ) : (
                          <span
                            className="text-xs text-muted-foreground"
                            dir="ltr"
                          >
                            {p.sitePath}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
