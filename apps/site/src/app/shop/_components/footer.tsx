"use client";

// پاورقی سایت — مشخصاتِ تماس و یادداشتِ مدیر از تنظیماتِ مغازه.
import { MapPin, Phone, Store } from "lucide-react";
import { useShopSettings } from "./settings";

export function ShopFooter() {
  const { settings } = useShopSettings();
  if (!settings) return <FooterShell />;

  return (
    <FooterShell>
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {settings.address && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {settings.address}
          </span>
        )}
        {settings.phone && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="size-4 shrink-0" aria-hidden />
            <span dir="ltr">{settings.phone}</span>
          </span>
        )}
        {settings.cardNumber && settings.cardHolder && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Store className="size-4 shrink-0" aria-hidden />
            کارت‌به‌کارت: <span dir="ltr">{settings.cardNumber}</span> — {settings.cardHolder}
          </span>
        )}
      </div>
      {settings.footer && (
        <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{settings.footer}</p>
      )}
    </FooterShell>
  );
}

function FooterShell({ children }: { children?: React.ReactNode }) {
  return (
    <footer className="mt-12 border-t bg-muted/20">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {children ?? <p className="text-sm text-muted-foreground">فروشگاه اینترنتی</p>}
      </div>
    </footer>
  );
}