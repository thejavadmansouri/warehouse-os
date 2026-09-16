"use client";

// صفحه‌ی کالا: گالری، قیمت/موجودی، افزودن به سبد، اطلاع از موجودی، نظرها، مرتبط.
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Bell, Minus, Plus, ShieldCheck, ShoppingCart, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

import { Price } from "../../_components/price";
import { Stars } from "../../_components/stars";
import { ProductCard } from "../../_components/product-card";
import { FavoriteButton } from "../../_components/favorites";
import { useShopLogin } from "@/lib/shop-login-ui";
import {
  assetUrl,
  getShopProduct,
  getShopRelated,
  getShopReviews,
  notifyStock,
  writeReview,
} from "@/lib/shop-api";
import { useShopAuth } from "@/lib/shop-auth";
import { useShopCart } from "@/lib/shop-cart";
import { faDateTime, faToEn, toFa } from "@/lib/format";
import { STOCK_LABELS } from "@/lib/shop-format";
import type { ShopReviews } from "@/lib/shop-types";

export function ProductView({ id }: { id: string }) {
  const add = useShopCart((s) => s.add);
  const token = useShopAuth((s) => s.token);

  const [qty, setQty] = React.useState(1);
  const [activeImg, setActiveImg] = React.useState(0);

  const detailQuery = useQuery({ queryKey: ["shop", "product", id], queryFn: () => getShopProduct(id) });
  const reviewsQuery = useQuery<ShopReviews>({
    queryKey: ["shop", "product", id, "reviews"],
    queryFn: () => getShopReviews(id),
  });
  const relatedQuery = useQuery({ queryKey: ["shop", "product", id, "related"], queryFn: () => getShopRelated(id) });

  const p = detailQuery.data;
  const stock = p ? STOCK_LABELS[p.stock] ?? STOCK_LABELS.OUT : null;
  const images = p?.images ?? [];
  const image = images[activeImg] ?? images[0] ?? null;

  if (detailQuery.isLoading) return <DetailSkeleton />;
  if (detailQuery.isError || !p) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-lg font-medium">این کالا در فروشگاه موجود نیست</p>
        <Link href="/shop" className="mt-3 inline-block text-primary underline">
          بازگشت به فروشگاه
        </Link>
      </div>
    );
  }

  const addToCart = () => {
    add(p.id, qty);
    toast.success(`${toFa(qty)} عدد «${p.name}» به سبد اضافه شد`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/shop" className="hover:text-foreground">فروشگاه</Link>
        {p.category && (
          <>
            <span>/</span>
            <span>{p.category}</span>
          </>
        )}
      </nav>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* گالری */}
        <div>
          <div className="overflow-hidden rounded-xl border bg-white">
            {image ? (
              <img src={assetUrl(image)} alt={p.name} className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center text-muted-foreground/30">
                <ShoppingCart className="size-16" aria-hidden />
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {images.map((im, i) => (
                <button
                  key={im}
                  type="button"
                  onClick={() => setActiveImg(i)}
                  aria-label={`تصویر ${toFa(i + 1)}`}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${i === activeImg ? "border-primary" : "border-border"}`}
                >
                    <img src={assetUrl(im)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* مشخصات و خرید */}
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-bold leading-snug">{p.name}</h1>
            <FavoriteButton productId={p.id} size="sm" />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            {p.brand && <Badge variant="secondary">{p.brand}</Badge>}
            {p.sku && <span className="text-xs text-muted-foreground" dir="ltr">{p.sku}</span>}
            {stock && <Badge className={stock.cls}>{stock.label}</Badge>}
          </div>

          {p.vehicles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {p.vehicles.map((v) => (
                <Badge key={v} variant="outline" className="text-xs">{v}</Badge>
              ))}
            </div>
          )}

          <div className="mt-2 rounded-xl border bg-muted/20 p-4">
            <Price price={p.price} compareAt={p.compareAt} size="lg" />
          </div>

          {p.description && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {p.description}
            </p>
          )}

          {/* افزودن به سبد / اطلاع از موجودی */}
          {p.price != null && p.stock !== "OUT" ? (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center rounded-lg border">
                <button
                  type="button"
                  aria-label="کم کردن تعداد"
                  className="p-2 disabled:opacity-40"
                  disabled={qty <= 1}
                  onClick={() => setQty((n) => Math.max(1, n - 1))}
                >
                  <Minus className="size-4" aria-hidden />
                </button>
                <Input
                  aria-label="تعداد"
                  inputMode="numeric"
                  className="h-10 w-16 border-0 text-center text-lg font-semibold shadow-none tabular-nums focus-visible:ring-0"
                  value={toFa(qty)}
                  onChange={(e) => {
                    const n = parseInt(faToEn(e.target.value).replace(/[^\d]/g, "") || "1", 10);
                    setQty(Math.max(1, Math.min(999, n)));
                  }}
                />
                <button type="button" aria-label="زیاد کردن تعداد" className="p-2" onClick={() => setQty((n) => n + 1)}>
                  <Plus className="size-4" aria-hidden />
                </button>
              </div>
              <Button size="lg" className="flex-1" onClick={addToCart}>
                <ShoppingCart className="size-5" aria-hidden /> افزودن به سبد
              </Button>
            </div>
          ) : (
            <StockNotifyBox productId={p.id} />
          )}

          {/* ویژگی‌ها */}
          <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <Feature icon={ShieldCheck} text="ضمانت اصالت کالا" />
            <Feature icon={Truck} text="ارسال سریع" />
            <Feature icon={BadgeCheck} text="پرداخت در محل / کارت‌به‌کارت" />
          </div>
        </div>
      </div>

      {/* نظرها */}
      <ReviewsSection productId={p.id} query={reviewsQuery.data} loading={reviewsQuery.isLoading} token={!!token} />

      {/* مرتبط */}
      {relatedQuery.data && relatedQuery.data.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold">کالاهای مرتبط</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {relatedQuery.data.map((rp) => (
              <ProductCard key={rp.id} product={rp} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Feature({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <span className="flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-primary" aria-hidden /> {text}
    </span>
  );
}

function StockNotifyBox({ productId }: { productId: string }) {
  const [phone, setPhone] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await notifyStock(productId, faToEn(phone).trim());
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ثبت نشد");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
        ثبت شد — به‌محض موجود شدن پیامک می‌دهیم.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border bg-muted/20 p-4">
      <Label className="flex items-center gap-2">
        <Bell className="size-4 text-primary" aria-hidden /> موجود شد خبرم کن
      </Label>
      <div className="mt-2 flex gap-2">
        <Input
          dir="ltr"
          className="text-right"
          inputMode="tel"
          placeholder="۰۹۱۲۳۴۵۶۷۸۹"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-label="شماره موبایل"
        />
        <Button type="submit" disabled={busy || faToEn(phone).trim().length < 10}>
          {busy ? "…" : "ثبت"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </form>
  );
}

function ReviewsSection({
  productId,
  query,
  loading,
  token,
}: {
  productId: string;
  query: ShopReviews | undefined;
  loading: boolean;
  token: boolean;
}) {
  return (
    <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <ReviewSummary query={query} loading={loading} />
      <ReviewList productId={productId} query={query} loading={loading} token={token} />
    </section>
  );
}

function ReviewSummary({ query, loading }: { query: ShopReviews | undefined; loading: boolean }) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!query || query.count === 0)
    return <p className="text-sm text-muted-foreground">هنوز نظری ثبت نشده است.</p>;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-end gap-3">
          <span className="text-5xl font-black tabular-nums">{toFa(query.average)}</span>
          <div>
            <Stars value={query.average} size={16} />
            <p className="mt-1 text-sm text-muted-foreground">بر اساس {toFa(query.count)} نظر</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewList({
  productId,
  query,
  loading,
  token,
}: {
  productId: string;
  query: ShopReviews | undefined;
  loading: boolean;
  token: boolean;
}) {
  const queryClient = useQueryClient();
  const requestLogin = useShopLogin((s) => s.request);
  const [openForm, setOpenForm] = React.useState(false);
  const [rating, setRating] = React.useState(5);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");

  const submitReview = useMutation({
    mutationFn: () => writeReview(productId, { rating, title: title.trim() || undefined, review: body.trim() }),
    onSuccess: (res) => {
      toast.success(res.message);
      setOpenForm(false);
      setTitle("");
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["shop", "product", productId, "reviews"] });
    },
    onError: () => toast.error("ثبت نظر ناموفق بود"),
  });

  if (loading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">دیدگاه‌ها</h3>
        <Button variant="outline" size="sm" onClick={() => (token ? setOpenForm(true) : requestLogin())}>
          ثبت دیدگاه
        </Button>
      </div>

      {openForm && (
        <form
          className="space-y-3 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitReview.mutate();
          }}
        >
          <div>
            <Label>امتیاز شما</Label>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((r) => (
                <button key={r} type="button" aria-label={`${r} از ۵`} onClick={() => setRating(r)}>
                  <span className={r <= rating ? "text-amber-500" : "text-muted-foreground/30"}>★</span>
                </button>
              ))}
            </div>
          </div>
          <Input placeholder="عنوان (اختیاری)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            required
            rows={3}
            placeholder="دیدگاه شما درباره‌ی این کالا…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button type="submit" disabled={submitReview.isPending || body.trim().length < 3}>
            {submitReview.isPending ? "در حال ثبت…" : "ثبت دیدگاه"}
          </Button>
        </form>
      )}

      {!query || query.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">هنوز دیدگاهی ثبت نشده است.</p>
      ) : (
        <ul className="space-y-3">
          {query.items.map((r) => (
            <li key={r.id} className="rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <Stars value={r.rating} />
                {r.verified && (
                  <Badge className="gap-1 bg-emerald-100 text-emerald-700">
                    <BadgeCheck className="size-3.5" aria-hidden /> خرید تاییدشده
                  </Badge>
                )}
              </div>
              {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{r.author}</span>
                <span>{faDateTime(r.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full" />
        <div className="space-y-3">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full max-w-xs" />
        </div>
      </div>
    </div>
  );
}