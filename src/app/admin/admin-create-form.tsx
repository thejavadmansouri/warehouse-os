"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
 * ساخت دستی مشتری توسط ادمین (مشتری تلفنی یا حضوری) با امکان درج مشخصات کامل و اعتبار.
 */
export function AdminCreateForm({
  tiers = [],
}: {
  tiers?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    phone: "",
    username: "",
    password: "",
    nationalId: "",
    address: "",
    tierId: "",
    discountPercent: 0,
    creditLimitOverride: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);

    let data: { ok?: boolean; tempPassword?: string; message?: string } = {};

    try {
      const payload: any = {
        companyName: form.companyName.trim(),
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        username: form.username.trim() || undefined,
        nationalId: form.nationalId.trim() || undefined,
        address: form.address.trim() || undefined,
        tierId: form.tierId || undefined,
        discountPercent: Number(form.discountPercent) || 0,
        creditLimitOverride:
          form.creditLimitOverride.trim() !== ""
            ? Number(form.creditLimitOverride)
            : undefined,
      };

      if (form.password.trim().length >= 6) {
        payload.password = form.password.trim();
      }

      const res = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "خطای غیرمنتظره");
        return;
      }

      setMsg(
        `مشتری با موفقیت ثبت شد${
          data.tempPassword ? ` — رمز موقت اولیه: ${data.tempPassword}` : ""
        }`
      );
      setForm({
        companyName: "",
        contactName: "",
        phone: "",
        username: "",
        password: "",
        nationalId: "",
        address: "",
        tierId: "",
        discountPercent: 0,
        creditLimitOverride: "",
      });
      router.refresh();
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-stone-950 shadow-sm transition hover:bg-amber-400 active:scale-95"
      >
        <span>+</span>
        <span>ثبت مشتری جدید</span>
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-stone-200 bg-white p-5 shadow-md flex flex-col gap-3">
      <div className="flex items-center justify-between border-b pb-2">
        <h3 className="text-sm font-bold text-stone-900">
          فرم ثبت مشتری و همکار جدید
        </h3>
        <button
          onClick={() => {
            setOpen(false);
            setMsg(null);
            setError(null);
          }}
          className="text-stone-400 hover:text-stone-700 text-sm"
        >
          ✕
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}
      {msg && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 font-mono">
          {msg}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="نام فروشگاه / شرکت *"
          value={form.companyName}
          onChange={(v) => setForm((f) => ({ ...f, companyName: v }))}
          placeholder="لوازم یدکی رضایی"
        />
        <Input
          label="نام مسئول یا نماینده *"
          value={form.contactName}
          onChange={(v) => setForm((f) => ({ ...f, contactName: v }))}
          placeholder="علی رضایی"
        />
        <Input
          label="موبایل (جهت ورود و پیامک) *"
          dir="ltr"
          value={form.phone}
          onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
          placeholder="09131234567"
        />
        <Input
          label="نام کاربری انگلیسی (اختیاری)"
          dir="ltr"
          value={form.username}
          onChange={(v) => setForm((f) => ({ ...f, username: v }))}
          placeholder="rezaei_parts"
        />
      </div>

      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs font-semibold text-amber-700 hover:underline inline-flex items-center gap-1"
        >
          <span>{showAdvanced ? "▼ پنهان کردن فیلدهای پیشرفته" : "▶ تنظیمات پیشرفته (کد ملی، نشانی، رمز و سقف اعتبار)"}</span>
        </button>
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-stone-50 p-3 border border-stone-100">
          <Input
            label="کد ملی / شناسه ملی"
            value={form.nationalId}
            onChange={(v) => setForm((f) => ({ ...f, nationalId: v }))}
            placeholder="3130000000"
          />
          <Input
            label="رمز عبور دلخواه (حداقل ۶ نویسه)"
            type="password"
            value={form.password}
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
            placeholder="خالی بگذارید تا خودکار ایجاد شود"
          />
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              سطح قیمتی (Tier)
            </label>
            <select
              value={form.tierId}
              onChange={(e) => setForm((f) => ({ ...f, tierId: e.target.value }))}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
            >
              <option value="">پیش‌فرض سیستم</option>
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="تخفیف سفارشی همکار (درصد ۰ تا ۱۰۰)"
            type="number"
            value={String(form.discountPercent)}
            onChange={(v) =>
              setForm((f) => ({ ...f, discountPercent: Number(v) || 0 }))
            }
          />
          <Input
            label="سقف اعتبار اختصاصی (تومان)"
            type="number"
            value={form.creditLimitOverride}
            onChange={(v) => setForm((f) => ({ ...f, creditLimitOverride: v }))}
            placeholder="مثلا 100000000"
          />
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-stone-700 mb-1">
              نشانی دقیق جهت باربری و ارسال قطعات
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="کرمان، خیابان شهید بهشتی..."
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t">
        <button
          onClick={create}
          disabled={busy || !form.companyName || !form.contactName || !form.phone}
          className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-stone-950 transition hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? "در حال ثبت..." : "ثبت مشتری"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setMsg(null);
            setError(null);
          }}
          className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
        >
          انصراف
        </button>
      </div>
    </div>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dir?: "ltr" | "rtl";
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-stone-700 mb-1">
        {props.label}
      </label>
      <input
        type={props.type || "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        dir={props.dir}
        placeholder={props.placeholder}
        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
      />
    </div>
  );
}
