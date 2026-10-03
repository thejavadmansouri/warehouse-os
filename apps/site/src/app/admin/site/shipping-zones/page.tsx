"use client";

// مناطق ارسالِ فروشگاه اینترنتی با هزینه‌ی مخصوصِ هرکدام — فقط canManageSite.
import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Truck, Plus, Trash2 } from "lucide-react";

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

import { createShippingZone, deleteShippingZone, listShippingZones, updateShippingZone } from "@/lib/api";
import { money, toFa } from "@/lib/format";
import type { ShippingZone } from "@/lib/types";

const TH = "border-b px-3 py-2 text-start text-xs font-bold whitespace-nowrap";
const TD = "px-3 py-2";

function ZoneDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [fee, setFee] = React.useState("");
  const [freeOver, setFreeOver] = React.useState("");
  const [sortOrder, setSortOrder] = React.useState("");

  const create = useMutation({
    mutationFn: () =>
      createShippingZone({
        name: name.trim(),
        fee: Number(fee) || 0,
        freeOver: freeOver ? Number(freeOver) : undefined,
        sortOrder: sortOrder ? Number(sortOrder) : undefined,
      }),
    onSuccess: () => {
      toast.success("منطقه ساخته شد");
      queryClient.invalidateQueries({ queryKey: ["shipping-zones"] });
      onOpenChange(false);
      setName("");
      setFee("");
      setFreeOver("");
      setSortOrder("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "ساخت ناموفق بود"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>منطقه‌ی ارسال جدید</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>نام منطقه</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً تهران" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>هزینه‌ی ارسال (ریال)</Label>
              <Input type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ارسال رایگان از (ریال)</Label>
              <Input type="number" value={freeOver} onChange={(e) => setFreeOver(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>ترتیب</Label>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim() || !fee}>
            {create.isPending ? "…" : "افزودن"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ShippingZonesPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);

  const list = useQuery({ queryKey: ["shipping-zones"], queryFn: listShippingZones });

  const toggle = useMutation({
    mutationFn: (z: ShippingZone) => updateShippingZone(z.id, { isActive: !z.isActive }),
    onSuccess: () => {
      toast.success("وضعیت تغییر کرد");
      queryClient.invalidateQueries({ queryKey: ["shipping-zones"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تغییر ناموفق بود"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteShippingZone(id),
    onSuccess: () => {
      toast.success("منطقه حذف شد");
      queryClient.invalidateQueries({ queryKey: ["shipping-zones"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "حذف ناموفق بود"),
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="مناطق ارسال"
        description="هزینه‌ی ارسال در هر شهر/استان"
        icon={Truck}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden /> منطقه‌ی جدید
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="space-y-1 p-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !list.data || list.data.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              منطقه‌ای تعریف نشده — سفارش‌ها با نرخ‌ِ ثابتِ تنظیمات فروشگاه ارسال می‌شوند.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/70">
                <tr>
                  <th className={TH}>نام</th>
                  <th className={`${TH} text-end`}>هزینه</th>
                  <th className={`${TH} text-end`}>رایگان از</th>
                  <th className={`${TH} w-16 text-center`}>ترتیب</th>
                  <th className={`${TH} w-24`}>فعال</th>
                  <th className={`${TH} w-16`} />
                </tr>
              </thead>
              <tbody>
                {list.data.map((z) => (
                  <tr key={z.id} className="border-b odd:bg-muted/25">
                    <td className={`${TD} font-medium`}>{z.name}</td>
                    <td className={`${TD} text-end tabular-nums`}>{money(z.fee)}</td>
                    <td className={`${TD} text-end tabular-nums`}>
                      {z.freeOver ? money(z.freeOver) : "—"}
                    </td>
                    <td className={`${TD} text-center tabular-nums`}>{toFa(z.sortOrder)}</td>
                    <td className={TD}>
                      <Switch
                        checked={z.isActive}
                        onCheckedChange={() => toggle.mutate(z)}
                        disabled={toggle.isPending}
                      />
                    </td>
                    <td className={`${TD} text-end`}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive"
                        onClick={() => remove.mutate(z.id)}
                        disabled={remove.isPending}
                        title="حذف"
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

      <ZoneDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}