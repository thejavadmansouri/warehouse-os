"use client";

/**
 * تاریخچه‌ی قیمت یک کالا.
 *
 * `ProductPrice` عمداً تاریخچه‌ای است — قیمت قبلی بازنویسی نمی‌شود، ردیف تازه
 * اضافه می‌شود. تا امروز هیچ‌جا آن تاریخچه دیده نمی‌شد و فقط آخرین ردیف نمایش
 * داده می‌شد، یعنی سرمایه‌ای که ذخیره می‌شد ولی خرج نمی‌شد.
 *
 * چرا دیدنش مهم است: قیمتِ خریدی که یک‌باره ده‌برابر می‌شود همان‌جا خودش را
 * نشان می‌دهد. گاردِ ثبتِ فاکتور خرید جلوی تازه‌ها را می‌گیرد، این ستون برای
 * فهمیدنِ چیزی است که قبلاً اتفاق افتاده.
 *
 * سطرِ خرید وقتی از فروش بیشتر باشد قرمز می‌شود — همان قاعده‌ای که در گزارشِ
 * «قیمت‌های مشکوک» فهرست را می‌سازد، اینجا روی خودِ کالا.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote } from "lucide-react";

import { getProductPrices } from "@/lib/api";
import { formatPrice, formatDateTime } from "@/lib/format";
import { LoadingState, ErrorState, EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ProductPrices({ productId }: { productId: string }) {
  const q = useQuery({
    queryKey: ["product", productId, "prices"],
    queryFn: () => getProductPrices(productId),
  });

  const rows = q.data ?? [];

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="size-4" /> تاریخچه‌ی قیمت
        </CardTitle>
      </CardHeader>

      <CardContent>
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="قیمتی ثبت نشده"
            description="برای این کالا هیچ قیمتی وارد نشده است."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>تاریخ</TableHead>
                  <TableHead className="text-center">خرید</TableHead>
                  <TableHead className="text-center">فروش</TableHead>
                  <TableHead className="text-center">عمده</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const suspicious =
                    r.purchasePrice != null &&
                    r.salePrice != null &&
                    r.salePrice > 0 &&
                    r.purchasePrice > r.salePrice;

                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(r.createdAt)}
                        {/* تازه‌ترین ردیف همان قیمتِ فعلیِ کالاست. */}
                        {i === 0 && (
                          <Badge variant="secondary" className="mr-2 text-[10px]">
                            فعلی
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-center tabular-nums ${
                          suspicious ? "font-bold text-destructive" : ""
                        }`}
                      >
                        {formatPrice(r.purchasePrice)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {formatPrice(r.salePrice)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-muted-foreground">
                        {formatPrice(r.wholesalePrice)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
