"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getNetworkInfo, apiUrl } from "@/lib/api";

/**
 * صفحه‌ی «اتصال گوشی» — آدرسی که گوشی با آن به همین اپ وصل می‌شود + QR.
 *
 * آی‌پی از خودِ سرور پرسیده می‌شود (`GET /network`)، نه از مرورگر: مرورگر فقط
 * آدرسِ خودش را می‌داند، ولی گوشی باید به ماشینی وصل شود که API روی آن اجراست.
 * QR همان آدرسِ وب است (همان هاست، پورتِ صفحه‌ی فعلی) تا دوربینِ گوشی مستقیم
 * بازش کند.
 */
export function ConnectionInfoDialog() {
  const [open, setOpen] = React.useState(false);
  const network = useQuery({
    queryKey: ["network-info"],
    queryFn: getNetworkInfo,
    enabled: open,
    staleTime: 60_000,
  });

  // آدرس صفحه‌ی فعلی — QR به همین اشاره می‌کند.
  const webUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Smartphone className="ms-2 h-4 w-4" />
        اتصال گوشی
      </DropdownMenuItem>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Smartphone className="size-4 text-primary" />
              اتصال گوشی به اپ
            </DialogTitle>
            <DialogDescription>
              گوشی باید به همان شبکه‌ی وای‌فایِ این رایانه وصل باشد؛ بعد QR را
              با دوربین گوشی بخوانید یا آدرس را دستی وارد کنید.
            </DialogDescription>
          </DialogHeader>

          {network.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              در حال خواندن آدرس شبکه…
            </p>
          ) : network.isError || !network.data ? (
            <p className="py-6 text-center text-sm text-destructive">
              خواندن آدرس شبکه ناموفق بود.
            </p>
          ) : network.data.addresses.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              هیچ آدرس شبکه‌ی محلی پیدا نشد — رایانه به شبکه وصل است؟
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col items-center gap-2">
                {/* QR سبکِ بدون کتابخانه: رندر با سرویسِ داخلی ممنوع؛ از
                    data-URL سمت سرور هم صرف‌نظر کردیم — همین canvas ساده
                    کافی است چون کل این آدرس داخل شبکه است. */}
                <img
                  src={`${apiUrl()}/qr?data=${encodeURIComponent(webUrl)}`}
                  alt="QR اتصال گوشی"
                  className="size-40 rounded-lg border bg-white p-2"
                />
                <code className="rounded bg-muted px-2 py-1 text-sm" dir="ltr">
                  {webUrl}
                </code>
              </div>
              <div className="rounded-lg border p-2 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">
                  سرور API روی:
                </p>
                <ul className="space-y-0.5" dir="ltr">
                  {network.data.addresses.map((a) => (
                    <li key={a} className="tabular-nums">
                      {a} (پورت {new URL(apiUrl()).port})
                    </li>
                  ))}
                </ul>
                <p className="mt-1">نام رایانه: {network.data.hostname}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
