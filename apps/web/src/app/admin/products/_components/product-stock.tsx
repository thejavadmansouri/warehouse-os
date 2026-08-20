"use client";

/**
 * موجودی یک کالا به تفکیک قفسه.
 *
 * تا امروز این عدد فقط در صندوق فروش دیده می‌شد (همان اندپوینتی که هنگام اسکن
 * بارکد صدا زده می‌شود). صفحه‌ی کالا قیمت را نشان می‌داد ولی نمی‌گفت جنس کجاست
 * و چند تا — یعنی برای جواب‌دادن به «این کالا کجاست؟» باید صندوق را باز
 * می‌کردی یا از انبار می‌پرسیدی.
 *
 * دو حالت که باید دیده شوند و در جدولِ ساده گم می‌شدند:
 *
 * - **بی‌صاحب (`stranded`)**: قفسه‌اش حذف یا غیرفعال شده ولی جنس رویش مانده.
 *   فروختنی هست، ولی کسی نمی‌تواند برود سرِ قفسه و برش دارد.
 * - **مکان سیستمی**: «انبار موقت» و «موجودی ثبت‌نشده» قفسه‌ی واقعی نیستند.
 *   جنسی که آنجاست یا هنوز چیده نشده یا اصلاً ثبت نشده بوده. اگر مثل یک قفسه‌ی
 *   عادی نشان داده شود، کسی دنبالش می‌گردد و پیدایش نمی‌کند.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes, TriangleAlert } from "lucide-react";

import { getProductStock } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { LoadingState, ErrorState, EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** مکان‌های سیستمی با همین پیشوند ساخته می‌شوند (SystemLocationsService). */
const SYSTEM_CODE_PREFIX = "SYS-";

export function ProductStock({ productId }: { productId: string }) {
  const q = useQuery({
    queryKey: ["product", productId, "stock"],
    queryFn: () => getProductStock(productId),
  });

  const rows = q.data ?? [];
  const total = rows.reduce((s, r) => s + r.quantity, 0);

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="size-4" /> موجودی به تفکیک قفسه
        </CardTitle>
        {rows.length > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            جمع: {formatNumber(total)}
          </Badge>
        )}
      </CardHeader>

      <CardContent>
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="موجودی ندارد"
            description="این کالا روی هیچ قفسه‌ای موجودی مثبت ندارد."
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map((r) => {
              const isSystem = r.locationCode.startsWith(SYSTEM_CODE_PREFIX);

              return (
                <div
                  key={r.locationId}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {r.locationName}
                      </span>

                      {isSystem && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          هنوز چیده نشده
                        </Badge>
                      )}

                      {r.stranded && (
                        <Badge
                          variant="destructive"
                          className="shrink-0 gap-1 text-[10px]"
                        >
                          <TriangleAlert className="size-3" />
                          قفسه حذف شده
                        </Badge>
                      )}
                    </div>

                    <div className="truncate text-xs text-muted-foreground">
                      {r.locationPath || r.locationCode}
                    </div>
                  </div>

                  <span className="shrink-0 text-lg font-bold tabular-nums">
                    {formatNumber(r.quantity)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
