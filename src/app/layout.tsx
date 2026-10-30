import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "کاردو B2B | عمده‌فروشی لوازم یدکی کرمان",
    template: "%s | کاردو B2B",
  },
  description:
    "پورتال B2B عمده‌فروشی لوازم یدکی خودرو در کرمان — کاتالوگ، استعلام قیمت و پیش‌فاکتور برای مشتریان عمده.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "کاردو B2B",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${vazirmatn.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
