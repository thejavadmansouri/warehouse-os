import { clearSessionCookie } from "@/lib/auth-cookie";

/** خروج — کوکی نشست پاک می‌شود. */
export async function POST() {
  return clearSessionCookie();
}
