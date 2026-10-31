"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface Announcement {
  id: string;
  title: string;
  message: string;
  level: "INFO" | "SUCCESS" | "WARNING" | "URGENT";
  link?: string | null;
}

export function AnnouncementBanner({ target = "ALL" }: { target?: "ALL" | "CUSTOMER" | "ADMIN" }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`/api/announcements?target=${target}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.items)) {
          setAnnouncements(data.items);
        }
      })
      .catch(() => {});

    try {
      const stored = localStorage.getItem("kardo_dismissed_announcements");
      if (stored) setDismissed(JSON.parse(stored));
    } catch {}
  }, [target]);

  const active = announcements.filter((a) => !dismissed[a.id]);

  if (active.length === 0) return null;

  const current = active[0];

  const handleDismiss = (id: string) => {
    const next = { ...dismissed, [id]: true };
    setDismissed(next);
    try {
      localStorage.setItem("kardo_dismissed_announcements", JSON.stringify(next));
    } catch {}
  };

  const styles: Record<string, { bg: string; border: string; text: string; badge: string; icon: string }> = {
    URGENT: {
      bg: "bg-linear-to-r from-rose-950 via-red-900 to-rose-950",
      border: "border-rose-600/50",
      text: "text-rose-100",
      badge: "bg-rose-500 text-white",
      icon: "🚨",
    },
    WARNING: {
      bg: "bg-linear-to-r from-amber-950 via-orange-950 to-amber-950",
      border: "border-amber-500/40",
      text: "text-amber-100",
      badge: "bg-amber-500 text-slate-950",
      icon: "⚡",
    },
    SUCCESS: {
      bg: "bg-linear-to-r from-emerald-950 via-teal-950 to-emerald-950",
      border: "border-emerald-500/40",
      text: "text-emerald-100",
      badge: "bg-emerald-500 text-slate-950",
      icon: "🎉",
    },
    INFO: {
      bg: "bg-linear-to-r from-slate-900 via-blue-950 to-slate-900",
      border: "border-blue-500/30",
      text: "text-blue-100",
      badge: "bg-blue-600 text-white",
      icon: "📢",
    },
  };

  const s = styles[current.level] || styles.INFO;

  return (
    <aside
      aria-label="اطلاعیه سامانه کاردو"
      className={`w-full border-b ${s.border} ${s.bg} ${s.text} py-2.5 px-4 text-xs font-semibold select-none shadow-sm transition-all z-40`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 overflow-hidden">
          <span className="text-sm shrink-0">{s.icon}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${s.badge}`}>
            {current.title}
          </span>
          <p className="truncate font-medium">{current.message}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {current.link && (
            <Link
              href={current.link}
              className="bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all text-white"
            >
              مشاهده جزئیات
            </Link>
          )}

          <button
            onClick={() => handleDismiss(current.id)}
            className="size-6 grid place-items-center text-white/60 hover:text-white rounded hover:bg-white/10 transition-colors"
            title="بستن اعلان"
          >
            ✕
          </button>
        </div>
      </div>
    </aside>
  );
}
