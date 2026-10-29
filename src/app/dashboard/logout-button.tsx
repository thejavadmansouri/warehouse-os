"use client";

import { useRouter } from "next/navigation";

/** دکمه خروج — کوکی را پاک و به صفحه ورود می‌برد. */
export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
      }}
      className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-muted hover:bg-slate-50 transition active:scale-[0.98]"
    >
      خروج
    </button>
  );
}
