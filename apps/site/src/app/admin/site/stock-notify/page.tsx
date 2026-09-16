"use client";

// صفِ «موجود شد خبرم کن» — کالاهایی که خریدار منتظر موجود شدنشان است — فقط canManageSite.
import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { listPendingStockNotifies, sendStockNotify } from "@/lib/api";
import { toFa } from "@/lib/format";

export default function StockNotifyPage() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["stock-notify"], queryFn: listPendingStockNotifies });

  const send = useMutation({
    mutationFn: (productId: string) => sendStockNotify(productId),
    onSuccess: (r) => {
      toast.success(`به ${toFa(r.sent)} نفر پیامک شد`);
      queryClient.invalidateQueries({ queryKey: ["stock-notify"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "ارسال ناموفق بود"),
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="اعلان موجودی"
        description="خریدارانی که منتظرِ موجودِشدنِ این کالاها هستند — بعد از شارژ، «خبر بده» را بزنید"
        icon={BellRing}
      />

      {list.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !list.data || list.data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            کسی منتظر موجودیشدن کالایی نیست.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {list.data.map((p) => (
              <div key={p.productId} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs tabular-nums text-muted-foreground" dir="ltr">
                    {p.sku}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm tabular-nums text-muted-foreground">
                    <b className="text-foreground">{toFa(p.waiting)}</b> نفر منتظرند
                  </span>
                  <Button
                    size="sm"
                    onClick={() => send.mutate(p.productId)}
                    disabled={send.isPending}
                  >
                    <BellRing className="size-4" aria-hidden /> خبر بده
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}