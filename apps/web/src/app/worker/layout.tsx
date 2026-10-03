"use client";

// طبق بخش ب سند افزونه — لایوت وب کارگر انبار (PWA)
// بدون سایدبار؛ max-w-md برای مرکزیت روی دسکتاپ؛ safe area برای موبایل.
import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { LoadingState } from "@/components/states";
import { WorkerSessionProvider } from "./_context/worker-session";

const ALLOWED_ROLES: readonly string[] = ["ADMIN", "MANAGER", "STAFF"];

export default function WorkerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    if (!token) {
      router.replace("/login");
      return;
    }
    if (user && !ALLOWED_ROLES.includes(user.role)) {
      router.replace("/admin");
    }
  }, [hydrated, token, user, router]);

  if (!hydrated || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingState label="در حال بررسی نشست..." />
      </div>
    );
  }

  if (user && !ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center">
          <p className="text-lg font-bold text-destructive">دسترسی غیرمجاز</p>
          <p className="mt-2 text-sm text-muted-foreground">
            شما اجازه‌ی استفاده از پنل کارگر را ندارید.
          </p>
        </div>
      </div>
    );
  }

  return (
    <WorkerSessionProvider>
      <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          {children}
        </div>
      </div>
    </WorkerSessionProvider>
  );
}
