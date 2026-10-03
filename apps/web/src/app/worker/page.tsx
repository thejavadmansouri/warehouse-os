"use client";

// طبق بخش ب سند افزونه — صفحه‌ی اصلی پنل کارگر
// شروع شیفت (سشن صوتی) + دو دکمه‌ی بزرگ: ثبت ورود کالا / انبارگردانی
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  ClipboardList,
  LogOut,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { startVoiceSession } from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useWorkerSession } from "./_context/worker-session";

export default function WorkerHomePage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { toast } = useToast();
  const { sessionId, setSessionId } = useWorkerSession();
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // طبق بخش ب — POST /inventory-session/start
  async function handleStartShift() {
    setError(null);
    setStarting(true);
    try {
      const s = await startVoiceSession({});
      setSessionId(s.id);
      toast({
        title: "شیفت شروع شد",
        description: "آماده‌ی ثبت ورود کالا یا انبارگردانی",
      });
    } catch (e) {
      const msg = e instanceof ApiException ? e.message : "خطا در شروع شیفت";
      setError(msg);
      toast({ variant: "destructive", title: "خطا", description: msg });
    } finally {
      setStarting(false);
    }
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const shortId = sessionId ? sessionId.slice(0, 8) : null;

  return (
    <div className="flex flex-1 flex-col">
      {/* هدر ساده */}
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">
            {user?.fullName ?? user?.username ?? "کاربر"}
          </p>
          <p className="text-xs text-muted-foreground">پنل کارگر انبار</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={handleLogout}
          aria-label="خروج"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>خطا</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!sessionId ? (
          <Card className="mt-6 gap-4 p-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-accent/15 p-4">
                <Package className="h-8 w-8 text-accent" />
              </div>
              <h2 className="text-2xl font-bold">شروع شیفت</h2>
              <p className="text-sm text-muted-foreground">
                برای ثبت ورود کالا یا انبارگردانی، ابتدا یک شیفت جدید شروع کنید.
              </p>
            </div>
            <Button
              className="h-16 w-full text-lg"
              onClick={handleStartShift}
              disabled={starting}
            >
              {starting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  در حال شروع...
                </>
              ) : (
                "شروع شیفت"
              )}
            </Button>
          </Card>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-3">
              <Button
                className="h-24 text-lg"
                onClick={() => router.push("/worker/scan")}
              >
                <Package className="h-7 w-7" />
                ثبت ورود کالا
              </Button>
              <Button
                variant="secondary"
                className="h-24 text-lg"
                onClick={() => router.push("/worker/count")}
              >
                <ClipboardList className="h-7 w-7" />
                انبارگردانی
              </Button>
            </div>

            <div className="mt-auto flex flex-col items-center gap-3 pb-2 pt-4 text-center">
              <p className="text-xs text-muted-foreground">
                شناسه‌ی شیفت:{" "}
                <span className="font-mono" dir="ltr">
                  {shortId}
                </span>
              </p>
              <Button
                variant="ghost"
                className="h-12 text-sm"
                onClick={handleStartShift}
                disabled={starting}
              >
                {starting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                شروع شیفت جدید
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
