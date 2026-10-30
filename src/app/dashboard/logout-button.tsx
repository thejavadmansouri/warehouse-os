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
      className="rounded-[2px] border border-rule px-3 py-1.5 text-xs text-ink-soft hover:bg-brass-soft/40 hover:text-ink transition-colors"
    >
      خروج
    </button>
  );
}
