"use client";

// مدیریتِ کوپن‌های تخفیفِ فروشگاه اینترنتی — فقط برای صاحبانِ canManageSite.
import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ticket, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

import { createCoupon, deleteCoupon, listCoupons, updateCoupon } from "@/lib/api";
import { faDate, money, toFa } from "@/lib/format";
import type { Coupon, CouponType } from "@/lib/types";

const TH = "border-b px-3 py-2 text-start text-xs font-bold whitespace-nowrap";
const TD = "px-3 py-2";

/** ورودیِ datetime-local → ISO برای سرور. خالی → null. */
function toIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function NewCouponDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = React.useState("");
  const [type, setType] = React.useState<CouponType>("FIXED");
  const [value, setValue] = React.useState("");
  const [minSubtotal, setMinSubtotal] = React.useState("");
  const [maxDiscount, setMaxDiscount] = React.useState("");
  const [usageLimit, setUsageLimit] = React.useState("");
  const [perCustomer, setPerCustomer] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");

  const create = useMutation({
    mutationFn: () =>
      createCoupon({
        code: code.trim(),
        type,
        value: Number(value) || 0,
        minSubtotal: minSubtotal ? Number(minSubtotal) : undefined,
        maxDiscount: maxDiscount ? Number(maxDiscount) : undefined,
        usageLimit: usageLimit ? Number(usageLimit) : undefined,
        perCustomer: perCustomer ? Number(perCustomer) : undefined,
        startsAt: toIso(startsAt),
        expiresAt: toIso(expiresAt),
      }),
    onSuccess: () => {
      toast.success("کوپن ساخته شد");
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      onOpenChange(false);
      setCode("");
      setValue("");
      setMinSubtotal("");
      setMaxDiscount("");
      setUsageLimit("");
      setPerCustomer("");
      setStartsAt("");
      setExpiresAt("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "ساخت کوپن ناموفق بود"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>کوپن جدید</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>کد کوپن</Label>
            <Input
              dir="ltr"
              placeholder="SAVE20"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>نوع</Label>
            <Select value={type} onValueChange={(v) => setType(v as CouponType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FIXED">مبلغ ثابت</SelectItem>
                <SelectItem value="PERCENT">درصد</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{type === "PERCENT" ? "درصد تخفیف" : "مقدار (ریال)"}</Label>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>حداقل سبد (ریال)</Label>
            <Input type="number" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>سقف تخفیف (ریال)</Label>
            <Input type="number" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>محدودیت استفاده</Label>
            <Input type="number" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="بی‌نهایت" />
          </div>
          <div className="space-y-1.5">
            <Label>شروع</Label>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>انقضا</Label>
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !code.trim() || !value}>
            {create.isPending ? "…" : "ساخت کوپن"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CouponsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);

  const list = useQuery({ queryKey: ["coupons"], queryFn: listCoupons });

  const toggleActive = useMutation({
    mutationFn: (c: Coupon) => updateCoupon(c.id, { isActive: !c.isActive }),
    onSuccess: () => {
      toast.success("وضعیت کوپن تغییر کرد");
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تغییر ناموفق بود"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCoupon(id),
    onSuccess: () => {
      toast.success("کوپن حذف شد");
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "حذف ناموفق بود"),
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="کوپن‌های تخفیف"
        description="کدهای تخفیفِ فروشگاه اینترنتی"
        icon={Ticket}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden /> کوپن جدید
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
            <p className="py-12 text-center text-sm text-muted-foreground">هنوز کوپنی نیست.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/70">
                <tr>
                  <th className={TH}>کد</th>
                  <th className={TH}>تخفیف</th>
                  <th className={TH}>حداقل سبد</th>
                  <th className={TH}>استفاده</th>
                  <th className={TH}>اعتبار</th>
                  <th className={`${TH} w-24`}>فعال</th>
                  <th className={`${TH} w-16`} />
                </tr>
              </thead>
              <tbody>
                {list.data.map((c) => {
                  const discountText =
                    c.type === "PERCENT" ? `٪${toFa(c.value)}` : money(c.value);
                  const expired =
                    c.expiresAt && new Date(c.expiresAt) < new Date() && c.expiresAt ? true : false;
                  return (
                    <tr key={c.id} className="border-b odd:bg-muted/25">
                      <td className={`${TD} font-mono font-bold`} dir="ltr">{c.code}</td>
                      <td className={TD}>{discountText}</td>
                      <td className={`${TD} tabular-nums`}>{c.minSubtotal ? money(c.minSubtotal) : "—"}</td>
                      <td className={`${TD} tabular-nums`}>
                        {toFa(c.usedCount)}
                        {c.usageLimit ? <span className="text-muted-foreground"> / {toFa(c.usageLimit)}</span> : <span className="text-muted-foreground"> ∞</span>}
                      </td>
                      <td className={`${TD} text-muted-foreground`}>
                        {c.startsAt ? <span>از {faDate(c.startsAt)} · </span> : null}
                        {c.expiresAt ? faDate(c.expiresAt) : "بدون انقضا"}
                        {expired && <Badge className="ms-2 bg-rose-100 text-rose-700">منقضی</Badge>}
                      </td>
                      <td className={TD}>
                        <Switch
                          checked={c.isActive}
                          onCheckedChange={() => toggleActive.mutate(c)}
                          disabled={toggleActive.isPending}
                        />
                      </td>
                      <td className={`${TD} text-end`}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive"
                          onClick={() => remove.mutate(c.id)}
                          disabled={remove.isPending}
                          title="حذف کوپن"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <NewCouponDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}