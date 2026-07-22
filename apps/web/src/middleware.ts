import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('wos_token')?.value;
  const { pathname } = request.url ? new URL(request.url) : { pathname: '' };

  // اگر کاربر به صفحات ادمین یا محصولات می‌رود و توکن ندارد، بفرست به لاگین
  if ((pathname.startsWith('/admin') || pathname.startsWith('/products')) && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/products/:path*'],
};
