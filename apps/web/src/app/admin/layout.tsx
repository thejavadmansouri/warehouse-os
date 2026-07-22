"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("wos_token");
    const userData = localStorage.getItem("wos_user");

    if (!token || !userData) {
      router.push("/login");
      return;
    }

    setUser(JSON.parse(userData));
    setLoading(false);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("wos_token");
    localStorage.removeItem("wos_user");
    document.cookie = "wos_token=; path=/; max-age=0";
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm">
        در حال بررسی دسترسی...
      </div>
    );
  }

  const menuItems = [
    { name: "داشبورد مدیریت", href: "/admin", icon: "📊" },
    { name: "مدیریت محصولات", href: "/admin/products", icon: "📦" },
    { name: "موقعیت‌های انبار", href: "/admin/locations", icon: "📍" },
    { name: "موجودی و گردش انبار", href: "/admin/inventory", icon: "🔄" },
    ...(user?.role === "ADMIN" ? [{ name: "پرسنل و دسترسی‌ها", href: "/admin/users", icon: "👥" }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-900 flex" dir="rtl">
      {/* سایدبار استاندارد */}
      <aside className="w-64 bg-slate-950 border-l border-slate-800 flex flex-col justify-between p-6">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-400 rounded-xl flex items-center justify-center font-black text-slate-950 text-lg shadow-lg">
              W
            </div>
            <div>
              <h2 className="text-sm font-black text-white">انبارداری هوشمند</h2>
              <span className="text-[10px] text-amber-400 font-bold bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">
                {user?.role === "ADMIN" ? "مدیر کل سیستم" : user?.role === "MANAGER" ? "مدیر انبار" : "کاربر انبار"}
              </span>
            </div>
          </div>

          <nav className="space-y-2">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? "bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20"
                      : "text-slate-300 hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="pt-6 border-t border-slate-800 space-y-4">
          <div className="text-xs text-slate-200 font-bold truncate">
            👤 {user?.fullName || user?.username}
          </div>
          <button
            onClick={handleLogout}
            className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold py-2.5 rounded-xl transition-all"
          >
            خروج از حساب کاربری
          </button>
        </div>
      </aside>

      {/* محتوای اصلی پنل */}
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
