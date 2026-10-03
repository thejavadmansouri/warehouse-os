"use client";

// صفِ تأیید/ردِ نظرهای خریداران سایت — فقط canManageSite.
import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquareText, Check, X } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Stars } from "@/app/shop/_components/stars";

import { approveReview, listPendingReviews, rejectReview } from "@/lib/api";
import { faDateTime } from "@/lib/format";

export default function ReviewsPage() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["review-pending"], queryFn: listPendingReviews });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      action === "approve" ? approveReview(id) : rejectReview(id),
    onSuccess: (_d, v) => {
      toast.success(v.action === "approve" ? "نظر نمایش داده شد" : "نظر رد شد");
      queryClient.invalidateQueries({ queryKey: ["review-pending"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "عملیات ناموفق بود"),
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="نظرات در انتظار تأیید"
        description="نظرهای خریدارِ غیرواقعی که برای نمایش در سایت باید تأیید شوند"
        icon={MessageSquareText}
      />

      {list.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : !list.data || list.data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            نظری در انتظار تأیید نیست.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.data.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Stars value={r.rating} />
                      <span className="text-sm font-semibold">{r.title || "بدون عنوان"}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {r.product.name}
                      {r.siteCustomer ? (
                        <span className="ms-2 text-xs">
                          · {r.siteCustomer.firstName} {r.siteCustomer.lastName}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {faDateTime(r.createdAt)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{r.body}</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => act.mutate({ id: r.id, action: "approve" })}
                    disabled={act.isPending}
                  >
                    <Check className="size-4" aria-hidden /> تأیید
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => act.mutate({ id: r.id, action: "reject" })}
                    disabled={act.isPending}
                  >
                    <X className="size-4" aria-hidden /> رد
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}