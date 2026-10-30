"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toFaDigits } from "@/lib/digits";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // نادیده گرفتن خطای شبکه در بک‌گراند
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // پولینگ ۳۰ ثانیه‌ای
    return () => clearInterval(interval);
  }, []);

  // بستن منو با کلیک بیرون
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      //
    }
  };

  const markSingleRead = async (id: string) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      //
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="size-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center relative transition-all active:scale-95 shadow-2xs"
        aria-label="اعلان‌ها"
      >
        <svg
          className="size-4.5 text-slate-700"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 size-4.5 rounded-full bg-rose-600 text-white font-black text-[10px] grid place-items-center nums shadow-xs animate-pulse">
            {toFaDigits(unreadCount > 9 ? "+9" : unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200/90 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in duration-150">
          <div className="p-3.5 bg-slate-50 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-black text-xs sm:text-sm text-slate-900">اعلان‌های سامانه کاردو</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold nums">
                  {toFaDigits(unreadCount)} جدید
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] text-blue-600 hover:underline font-bold"
              >
                خواندن همه
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                هیچ اعلانی یافت نشد.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.read && markSingleRead(n.id)}
                  className={`p-3 text-xs transition-colors ${
                    n.read ? "bg-white hover:bg-slate-50" : "bg-blue-50/40 hover:bg-blue-50/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-black text-slate-900 leading-snug">
                      {n.title}
                    </span>
                    {!n.read && (
                      <span className="size-2 rounded-full bg-blue-600 shrink-0 mt-1" />
                    )}
                  </div>
                  <p className="text-slate-600 mt-1 leading-relaxed whitespace-pre-line text-[11px]">
                    {n.message}
                  </p>
                  {n.link && (
                    <Link
                      href={n.link}
                      onClick={() => setOpen(false)}
                      className="inline-block mt-1.5 text-blue-700 font-bold hover:underline text-[11px]"
                    >
                      مشاهده جزئیات ←
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
