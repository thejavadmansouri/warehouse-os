import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

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
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "کاردو B2B",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f2f4f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${vazirmatn.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
