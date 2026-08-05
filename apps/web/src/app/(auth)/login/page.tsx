"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Wrench, Loader2 } from "lucide-react";
import { login } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { landingPathForRole } from "@/lib/nav";
import { ApiException } from "@/lib/api-error-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

const schema = z.object({
  username: z.string().min(1, "نام کاربری الزامی است"),
  password: z.string().min(1, "رمز عبور الزامی است"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  /*
    از query string خوانده می‌شود نه از state، چون apiFetch با یک ریدایرکتِ کاملِ
    مرورگر به اینجا می‌آید و هیچ state ای زنده نمی‌ماند.
  */
  const [sessionReplaced, setSessionReplaced] = React.useState(false);
  React.useEffect(() => {
    setSessionReplaced(
      new URLSearchParams(window.location.search).get("reason") === "session"
    );
  }, []);

  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [hydrated, setHydrated] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  React.useEffect(() => setHydrated(true), []);

  React.useEffect(() => {
    if (hydrated && token) router.replace(landingPathForRole(user?.role));
  }, [hydrated, token, user, router]);

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const res = await login(values.username, values.password);
      setAuth(res.access_token, res.user);
      // نقشِ همین پاسخ، نه state — setAuth هنوز در همین tick ننشسته است.
      router.replace(landingPathForRole(res.user?.role));
    } catch (e) {
      if (e instanceof ApiException) {
        setError(e.message);
      } else {
        setError("ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
      }
    }
  };

  if (!hydrated) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Wrench className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold">پنل مدیریت انبار</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              سیستم مدیریت موجودی لوازم یدکی خودرو
            </p>
          </div>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">ورود به حساب</CardTitle>
            <CardDescription>
              نام کاربری و رمز عبور خود را وارد کنید
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              {/*
                بیرون‌افتادن به‌خاطر ورود از دستگاه دیگر، خرابی نیست. بدون این
                توضیح، کاربر فکر می‌کند سیستم قطع شده و دوباره تلاش می‌کند.
              */}
              {sessionReplaced ? (
                <Alert>
                  <AlertDescription>
                    این حساب روی دستگاه دیگری وارد شد، برای همین از اینجا خارج شدید.
                    هر حساب هم‌زمان فقط روی یک دستگاه کار می‌کند.
                  </AlertDescription>
                </Alert>
              ) : null}

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-2">
                <label htmlFor="username" className="text-sm font-medium">
                  نام کاربری
                </label>
                <Input
                  id="username"
                  autoComplete="username"
                  placeholder="نام کاربری"
                  {...register("username")}
                />
                {errors.username ? (
                  <p className="text-xs text-destructive">
                    {errors.username.message}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="password" className="text-sm font-medium">
                  رمز عبور
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register("password")}
                />
                {errors.password ? (
                  <p className="text-xs text-destructive">
                    {errors.password.message}
                  </p>
                ) : null}
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 w-full"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                    در حال ورود...
                  </>
                ) : (
                  "ورود"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} — تمامی حقوق محفوظ است
        </p>
      </div>
    </div>
  );
}
