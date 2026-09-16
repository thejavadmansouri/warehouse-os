"use client";

// بنرهای صفحه‌ی فروشگاه اینترنتی — فقط canManageSite.
import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Megaphone, Plus, Trash2, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

import { assetUrl, createBanner, deleteBanner, listBanners, updateBanner } from "@/lib/api";
import { toFa } from "@/lib/format";
import type { Banner } from "@/lib/types";

const TH = "border-b px-3 py-2 text-start text-xs font-bold whitespace-nowrap";
const TD = "px-3 py-2";

function NewBannerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState("");
  const [linkUrl, setLinkUrl] = React.useState("");
  const [sortOrder, setSortOrder] = React.useState("");

  const create = useMutation({
    mutationFn: () =>
      createBanner(file!, {
        title: title || undefined,
        linkUrl: linkUrl || undefined,
        sortOrder: sortOrder ? Number(sortOrder) : undefined,
      }),
    onSuccess: () => {
      toast.success("بنر ساخته شد");
      queryClient.invalidateQueries({ queryKey: ["banners"] });
      onOpenChange(false);
      setFile(null);
      setTitle("");
      setLinkUrl("");
      setSortOrder("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "ساخت ناموفق بود"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>بنر جدید</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>عکس</Label>
            <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1.5">
            <Label>عنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>پیوند</Label>
            <Input dir="ltr" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="/?product=…" />
          </div>
          <div className="space-y-1.5">
            <Label>ترتیب</Label>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !file}>
            {create.isPending ? "…" : "ساخت بنر"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BannersPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);

  const list = useQuery({ queryKey: ["banners"], queryFn: listBanners });

  const toggle = useMutation({
    mutationFn: (b: Banner) => updateBanner(b.id, { isActive: !b.isActive }),
    onSuccess: () => {
      toast.success("وضعیت بنر تغییر کرد");
      queryClient.invalidateQueries({ queryKey: ["banners"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تغییر ناموفق بود"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteBanner(id),
    onSuccess: () => {
      toast.success("بنر حذف شد");
      queryClient.invalidateQueries({ queryKey: ["banners"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "حذف ناموفق بود"),
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="بنرها"
        description="بنرهای صفحه‌ی اول فروشگاه"
        icon={Megaphone}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden /> بنر جدید
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="space-y-1 p-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !list.data || list.data.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">هنوز بنری نیست.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/70">
                <tr>
                  <th className={`${TH} w-24`}>تصویر</th>
                  <th className={TH}>عنوان</th>
                  <th className={TH}>پیوند</th>
                  <th className={`${TH} w-16 text-center`}>ترتیب</th>
                  <th className={`${TH} w-24`}>فعال</th>
                  <th className={`${TH} w-16`} />
                </tr>
              </thead>
              <tbody>
                {list.data.map((b) => (
                  <tr key={b.id} className="border-b odd:bg-muted/25">
                    <td className={TD}>
                      <img
                        src={assetUrl(b.thumbnailUrl ?? b.imageUrl)}
                        alt={b.title ?? "بنر"}
                        className="h-10 w-20 rounded object-cover"
                      />
                    </td>
                    <td className={`${TD} font-medium`}>{b.title || "—"}</td>
                    <td className={TD}>
                      {b.linkUrl ? (
                        <a
                          href={b.linkUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {b.linkUrl}<ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`${TD} text-center tabular-nums`}>{toFa(b.sortOrder)}</td>
                    <td className={TD}>
                      <Switch
                        checked={b.isActive}
                        onCheckedChange={() => toggle.mutate(b)}
                        disabled={toggle.isPending}
                      />
                    </td>
                    <td className={`${TD} text-end`}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive"
                        onClick={() => remove.mutate(b.id)}
                        disabled={remove.isPending}
                        title="حذف بنر"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <NewBannerDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}