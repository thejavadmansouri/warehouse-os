"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("wos_token");
    if (token) {
      router.push("/admin");
    } else {
      router.push("/login");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm">
      در حال انتقال به سامانه انبارداری...
    </div>
  );
}
