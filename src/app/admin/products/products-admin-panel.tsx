"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatToman, toFaDigits } from "@/lib/digits";

/*
 * پنل محصولات ادمین — افزودن قطعه با پله‌های تخفیف، و ویرایش سریع قیمت/موجودی.
 * قیمت همیشه تومان و صحیح؛ نمایش با ارقام فارسی.
 */
export type AdminProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  model: string | null;
  category: string;
  unit: string;
  packSize: number;
  minQty: number;
  price: number;
  priceLabel: string;
  stockQty: number;
  isActive: boolean;
  volumePrices: { qtyFrom: number; discountPercent: number }[];
};

type Step = { qtyFrom: string; discountPercent: string };

export function ProductsAdminPanel({ products }: { products: AdminProduct[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    sku: "",
    oemCode: "",
    name: "",
    brand: "",
    model: "",
    category: "",
    unit: "عدد",
    packSize: "1",
    minQty: "1",
    price: "",
    stockQty: "",
  });
  const [steps, setSteps] = useState<Step[]>([
    { qtyFrom: "10", discountPercent: "5" },
    { qtyFrom: "50", discountPercent: "9" },
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;

    return products.filter((p) =>
      [p.sku, p.name, p.brand, p.model ?? "", p.category]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [products, query]);

  async function create() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: form.sku,
          oemCode: form.oemCode || undefined,
          name: form.name,
          brand: form.brand,
          model: form.model || undefined,
          category: form.category,
          unit: form.unit,
          packSize: Number(form.packSize.replace(/\D/g, "")) || 1,
          minQty: Number(form.minQty.replace(/\D/g, "")) || 1,
          price: Number(form.price.replace(/\D/g, "")) || 0,
          stockQty: Number(form.stockQty.replace(/\D/g, "")) || 0,
          volumePrices: steps
            .map((s) => ({
              qtyFrom: Number(s.qtyFrom.replace(/\D/g, "")) || 0,
              discountPercent: Number(s.discountPercent.replace(/\D/g, "")) || 0,
            }))
            .filter((s) => s.qtyFrom >= 2 && s.discountPercent > 0),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "ثبت محصول ناموفق بود");
        return;
      }

      setForm({
        sku: "",
        oemCode: "",
        name: "",
        brand: "",
        model: "",
        category: "",
        unit: "عدد",
        packSize: "1",
        minQty: "1",
        price: "",
        stockQty: "",
      });

      router.refresh();
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_22rem]">
      {/* لیست محصولات */}
      <div className="order-2 lg:order-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جست‌وجو در کد، نام، خودرو…"
          className="input mb-3"
        />

        <div className="card overflow-hidden">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink-soft">محصولی نیست.</p>
          ) : (
            <ul>
              {filtered.map((p) => (
                <ProductRow key={p.id} product={p} onError={setError} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* فرم افزودن */}
      <div className="order-1 lg:order-2">
        <div className="card p-4 lg:sticky lg:top-20">
          <h2 className="font-bold text-sm">افزودن قطعه</h2>

          {error && (
            <p className="mt-2 rounded-[2px] border border-alarm/40 bg-alarm-soft px-2.5 py-1.5 text-[11px] text-alarm">
              {error}
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <Field label="کد فنی *" value={form.sku} onChange={(v) => setForm((f) => ({ ...f, sku: v }))} dir="ltr" />
            <Field label="کد OEM" value={form.oemCode} onChange={(v) => setForm((f) => ({ ...f, oemCode: v }))} dir="ltr" />
            <div className="col-span-2">
              <Field label="نام قطعه *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            </div>
            <Field label="خودرو *" value={form.brand} onChange={(v) => setForm((f) => ({ ...f, brand: v }))} placeholder="پراید" />
            <Field label="مدل" value={form.model} onChange={(v) => setForm((f) => ({ ...f, model: v }))} />
            <Field label="دسته *" value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} placeholder="ترمز" />
            <Field label="واحد" value={form.unit} onChange={(v) => setForm((f) => ({ ...f, unit: v }))} />
            <Field label="گام بسته" value={form.packSize} onChange={(v) => setForm((f) => ({ ...f, packSize: v }))} dir="ltr" />
            <Field label="حداقل" value={form.minQty} onChange={(v) => setForm((f) => ({ ...f, minQty: v }))} dir="ltr" />
            <Field label="قیمت (تومان) *" value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} dir="ltr" />
            <Field label="موجودی" value={form.stockQty} onChange={(v) => setForm((f) => ({ ...f, stockQty: v }))} dir="ltr" />
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="label">پله‌های تخفیف</span>
              <button
                onClick={() => setSteps((s) => [...s, { qtyFrom: "", discountPercent: "" }])}
                className="text-[11px] text-brass"
              >
                + پله
              </button>
            </div>

            <div className="mt-1.5 flex flex-col gap-1.5">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    value={s.qtyFrom}
                    onChange={(e) =>
                      setSteps((all) =>
                        all.map((x, j) =>
                          j === i ? { ...x, qtyFrom: e.target.value.replace(/\D/g, "") } : x,
                        ),
                      )
                    }
                    placeholder="از تعداد"
                    className="input py-1.5 text-center nums"
                  />
                  <span className="text-ink-soft text-xs">٪</span>
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    value={s.discountPercent}
                    onChange={(e) =>
                      setSteps((all) =>
                        all.map((x, j) =>
                          j === i
                            ? { ...x, discountPercent: e.target.value.replace(/\D/g, "") }
                            : x,
                        ),
                      )
                    }
                    placeholder="تخفیف"
                    className="input py-1.5 text-center nums"
                  />
                  <button
                    onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}
                    className="btn btn-quiet px-1"
                    aria-label="حذف پله"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={create}
            disabled={busy || !form.sku || !form.name || !form.brand || !form.category || !form.price}
            className="btn btn-primary w-full mt-3 py-2.5 text-sm"
          >
            {busy ? "در حال ثبت…" : "ثبت محصول"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductRow(props: { product: AdminProduct; onError: (m: string) => void }) {
  const router = useRouter();
  const { product } = props;
  const [price, setPrice] = useState(String(product.price));
  const [stock, setStock] = useState(String(product.stockQty));
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function save() {
    setBusy(true);

    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price: Number(price.replace(/\D/g, "")) || undefined,
          stockQty: Number(stock.replace(/\D/g, "")) || 0,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        props.onError(data.message ?? "ذخیره نشد");
        return;
      }

      router.refresh();
    } catch {
      props.onError("ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setBusy(true);

    try {
      await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !product.isActive }),
      });

      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="border-b border-rule/60 last:border-0 px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 text-start">
          <div className="flex items-center gap-2">
            <span className="nums text-[10px] text-ink-soft border border-rule rounded-[2px] px-1.5 py-0.5">
              {product.sku}
            </span>
            {!product.isActive && (
              <span className="text-[10px] text-alarm border border-alarm/40 rounded-[2px] px-1.5">
                غیرفعال
              </span>
            )}
          </div>
          <p className="text-sm font-medium mt-1 truncate">{product.name}</p>
          <p className="text-[11px] text-ink-soft">
            {product.brand}
            {product.model ? ` · ${product.model}` : ""} · {product.category} · موجودی{" "}
            {toFaDigits(product.stockQty)}
          </p>
        </button>

        <div className="text-end shrink-0">
          <p className="nums font-bold text-sm">{product.priceLabel}</p>
          <p className="text-[10px] text-ink-soft">
            {product.volumePrices.length > 0
              ? `${toFaDigits(product.volumePrices.length)} پله`
              : "بدون پله"}
          </p>
        </div>
      </div>

      {open && (
        <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-rule/60 pt-2">
          <label className="block">
            <span className="label block mb-0.5">قیمت</span>
            <input
              dir="ltr"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
              className="input py-1.5 w-28 text-center nums text-xs"
            />
          </label>
          <label className="block">
            <span className="label block mb-0.5">موجودی</span>
            <input
              dir="ltr"
              value={stock}
              onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
              className="input py-1.5 w-20 text-center nums text-xs"
            />
          </label>
          <button onClick={save} disabled={busy} className="btn btn-brass px-3 py-1.5 text-xs">
            ذخیره
          </button>
          <button onClick={toggleActive} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs">
            {product.isActive ? "غیرفعال کن" : "فعال کن"}
          </button>
          <a
            href={`/catalog/${product.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost px-3 py-1.5 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-bold"
          >
            <span>مشاهده صفحه و ویرایش عکس</span>
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          <span className="text-[10px] text-ink-soft ms-auto">
            {formatToman(product.price)} تومان
          </span>
        </div>
      )}
    </li>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dir?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label block mb-0.5">{props.label}</span>
      <input
        dir={props.dir}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        className="input py-1.5 text-xs"
      />
    </label>
  );
}
