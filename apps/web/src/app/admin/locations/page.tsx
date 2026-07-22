"use client";

import { useEffect, useState } from "react";

export default function LocationsPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchLocations = async () => {
    try {
      const token = localStorage.getItem("wos_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const res = await fetch(`${apiUrl}/locations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setLocations(data);
    } catch (err) {
      setError("خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-white">موقعیت‌های انبار و قفسه‌بندی</h1>
        <p className="text-xs text-slate-400 mt-1">مدیریت راهروها، قفسه‌ها و طبقات انبار</p>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-black text-white border-b border-slate-800 pb-3">لیست موقعیت‌های ثبت‌شده</h2>
        {loading ? (
          <div className="text-xs text-slate-400 py-4">در حال بارگذاری...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {locations.map((loc) => (
              <div key={loc.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
                <div className="font-bold text-white text-sm">{loc.name}</div>
                <div className="text-[11px] font-mono text-amber-400">بارکد: {loc.barcode}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
