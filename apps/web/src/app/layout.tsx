import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { ServiceWorkerRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  title: "کاردو — پنل مدیریت فروشگاه",
  description: "سامانه فروش، حساب مشتریان و انبارداری کاردو",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/logo.png" },
      { url: "/icons/worker-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/worker-icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "کاردو",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f1729",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body
        className="font-sans antialiased bg-background text-foreground"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}
            <Toaster />
            <ServiceWorkerRegister />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
