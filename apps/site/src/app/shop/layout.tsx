import * as React from "react";
import { ShopSettingsProvider } from "./_components/settings";
import { ShopNavbar } from "./_components/navbar";
import { TrustStrip } from "./_components/trust-strip";
import { ShopFooter } from "./_components/footer";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopSettingsProvider>
      <div className="flex min-h-screen flex-col">
        <ShopNavbar />
        <main className="flex-1">{children}</main>
        <TrustStrip />
        <ShopFooter />
      </div>
    </ShopSettingsProvider>
  );
}