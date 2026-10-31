import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/session";

/*
 * گیت صفحه‌ها — فقط هویت و نقش اینجا؛ وضعیت مشتری (PENDING/…) در صفحات
 * از سرور از DB می‌آید تا تأیید ادمین بلافاصله اثر کند.
 */
export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value ?? "");

  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (session?.role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);

      return NextResponse.redirect(url);
    }
  }

  const customerArea =
    pathname.startsWith("/dashboard") ||
    pathname === "/catalog" ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/wallet");

  if (customerArea) {
    if (session?.role !== "customer" && session?.role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);

      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/catalog/:path*",
    "/orders/:path*",
    "/wallet/:path*",
  ],
};
