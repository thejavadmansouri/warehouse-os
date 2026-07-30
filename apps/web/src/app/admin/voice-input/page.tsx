"use client";

// طبق بخش ۶.۸ — مانیتور ورودی صوتی
// دو مسیر: ۱) ثبت مستقیم موجودی ۲) شمارش صوتی (انبارگردانی)
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Mic, Activity, Play, Send, Search, Info } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import {
  startVoiceSession,
  submitVoice,
  startCount,
  countVoice,
  searchProducts,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ApiException } from "@/lib/api-error-messages";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/states";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  VoiceResponse,
  VoiceNeedSelectionResponse,
  CountStartResponse,
  CountVoiceResponse,
  Product,
} from "@/lib/types";

// ----- تب اول: ثبت مستقیم موجودی -----

function DirectEntryTab() {
  const { toast } = useToast();
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [locationBarcode, setLocationBarcode] = React.useState("");
  const [text, setText] = React.useState("");
  const [response, setResponse] = React.useState<VoiceResponse | null>(null);

  // برای حالت needSelection: جستجوی محصول
  const [productQuery, setProductQuery] = React.useState("");
  const [productResults, setProductResults] = React.useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = React.useState(false);
  const [selectedProductId, setSelectedProductId] = React.useState<string | null>(
    null
  );

  // طبق بخش ۶.۸ — POST /inventory-session/start
  const startSessionMut = useMutation({
    mutationFn: () => startVoiceSession({}),
    onSuccess: (s) => {
      setSessionId(s.id);
      toast({
        title: "سشن شروع شد",
        description: `شناسه سشن: ${s.id}`,
      });
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiException ? e.message : "خطا در شروع سشن";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  // طبق بخش ۶.۸ — POST /inventory/voice
  const submitMut = useMutation({
    mutationFn: () => submitVoice({ locationBarcode, text, sessionId: sessionId! }),
    onSuccess: (r) => {
      setResponse(r);
      if (r.success) {
        toast({ title: "ثبت موفق", description: "عملیات موجودی با موفقیت ثبت شد." });
        setText("");
      } else {
        // needSelection — بخشی از متن را برای جستجو استفاده می‌کنیم
        const needSel = r as VoiceNeedSelectionResponse;
        toast({
          variant: "destructive",
          title: "نیاز به انتخاب محصول",
          description: needSel.message,
        });
        // شروع جستجوی محصول با اولین کلمه‌ی متن
        const q = text.trim().split(/\s+/)[0] ?? "";
        if (q) {
          setProductQuery(q);
          void runProductSearch(q);
        }
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiException ? e.message : "خطا در ارسال";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  // جستجوی محصول (هنگام needSelection)
  const runProductSearch = React.useCallback(async (q: string) => {
    if (!q.trim()) {
      setProductResults([]);
      return;
    }
    setSearchingProducts(true);
    try {
      const r = await searchProducts(q.trim());
      setProductResults(r);
    } catch {
      setProductResults([]);
    } finally {
      setSearchingProducts(false);
    }
  }, []);

  // debounce جستجو
  React.useEffect(() => {
    if (!response || response.success) return;
    const t = setTimeout(() => {
      if (productQuery.trim()) void runProductSearch(productQuery);
    }, 350);
    return () => clearTimeout(t);
  }, [productQuery, response, runProductSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) {
      toast({ variant: "destructive", title: "ابتدا سشن را شروع کنید" });
      return;
    }
    if (!locationBarcode.trim() || !text.trim()) {
      toast({ variant: "destructive", title: "بارکد موقعیت و متن الزامی است" });
      return;
    }
    submitMut.mutate();
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mic className="h-4 w-4 text-accent" />
            ثبت مستقیم موجودی
          </CardTitle>
          <CardDescription>
            متن گفتار را وارد کنید تا موتور آن را تفسیر و عملیات موجودی را اعمال
            کند.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>سشن فعال</Label>
            <div className="flex items-center gap-2">
              <Input
                value={sessionId ?? "— سشن شروع نشده —"}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="default"
                onClick={() => startSessionMut.mutate()}
                disabled={startSessionMut.isPending}
              >
                {startSessionMut.isPending ? (
                  <LoadingState className="py-0" />
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    {sessionId ? "شروع مجدد" : "شروع سشن"}
                  </>
                )}
              </Button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="loc-barcode">بارکد موقعیت *</Label>
              <Input
                id="loc-barcode"
                value={locationBarcode}
                onChange={(e) => setLocationBarcode(e.target.value)}
                placeholder="مثلاً RACK-01-A"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="voice-text">متن گفتار *</Label>
              <Textarea
                id="voice-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="مثلاً: پنج تا لاستیک پراید وارد انبار کن"
                rows={3}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={
                submitMut.isPending ||
                !sessionId ||
                !locationBarcode.trim() ||
                !text.trim()
              }
            >
              {submitMut.isPending ? (
                <LoadingState className="py-0" />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  ارسال
                </>
              )}
            </Button>
          </form>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>راهنما</AlertTitle>
            <AlertDescription>
              برای مشاهده‌ی امتیاز اطمینان (confidence) از تب «شمارش صوتی» استفاده
              کنید.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            پاسخ موتور تشخیص گفتار
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!response ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              هنوز پاسخی دریافت نشده است.
            </div>
          ) : response.success ? (
            <div className="flex flex-col gap-3">
              <Badge className="w-fit bg-emerald-100 text-emerald-700">
                موفق
              </Badge>
              <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed scroll-thin" dir="ltr">
                {JSON.stringify(response, null, 2)}
              </pre>
            </div>
          ) : (
            <NeedSelectionView
              response={response as VoiceNeedSelectionResponse}
              productQuery={productQuery}
              setProductQuery={setProductQuery}
              productResults={productResults}
              searchingProducts={searchingProducts}
              selectedProductId={selectedProductId}
              setSelectedProductId={setSelectedProductId}
              onSearch={() => void runProductSearch(productQuery)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NeedSelectionView({
  response,
  productQuery,
  setProductQuery,
  productResults,
  searchingProducts,
  selectedProductId,
  setSelectedProductId,
  onSearch,
}: {
  response: VoiceNeedSelectionResponse;
  productQuery: string;
  setProductQuery: (v: string) => void;
  productResults: Product[];
  searchingProducts: boolean;
  selectedProductId: string | null;
  setSelectedProductId: (v: string | null) => void;
  onSearch: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <AlertTitle>نیاز به انتخاب دستی محصول</AlertTitle>
        <AlertDescription>{response.message}</AlertDescription>
      </Alert>

      <div>
        <p className="mb-1 text-xs text-muted-foreground">خروجی تفسیر اولیه:</p>
        <pre
          className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs scroll-thin"
          dir="ltr"
        >
          {JSON.stringify(response.parsed ?? {}, null, 2)}
        </pre>
      </div>

      <div className="flex flex-col gap-2">
        <Label>جستجوی محصول برای انتخاب دستی</Label>
        <div className="flex items-center gap-2">
          <Input
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder="نام یا SKU محصول..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearch();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onSearch}
            disabled={searchingProducts}
            aria-label="جستجو"
          >
            {searchingProducts ? (
              <LoadingState className="py-0" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {productResults.length > 0 ? (
          <Select
            value={selectedProductId ?? undefined}
            onValueChange={setSelectedProductId}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="یک محصول انتخاب کنید" />
            </SelectTrigger>
            <SelectContent>
              {productResults.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {selectedProductId ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              محصول انتخاب شد. برای تأیید نهایی این انتخاب، endpoint جداگانه‌ای در
              سند موجود نیست؛ لطفاً پس از در دسترس قرار گرفتن بک‌اند این مسیر را
              تکمیل کنید.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

// ----- تب دوم: شمارش صوتی -----

type CountLogItem = {
  id: string;
  text: string;
  response: CountVoiceResponse;
  at: string;
};

function CountVoiceTab() {
  const { toast } = useToast();
  const [startLocationBarcode, setStartLocationBarcode] = React.useState("");
  const [countStart, setCountStart] = React.useState<CountStartResponse | null>(
    null
  );
  const [text, setText] = React.useState("");
  const [logs, setLogs] = React.useState<CountLogItem[]>([]);
  const [lastResponse, setLastResponse] = React.useState<CountVoiceResponse | null>(
    null
  );

  // طبق بخش ۶.۸ — POST /mobile/count/start
  const startCountMut = useMutation({
    mutationFn: () => startCount({ locationBarcode: startLocationBarcode }),
    onSuccess: (r) => {
      setCountStart(r);
      toast({
        title: "شمارش شروع شد",
        description: `شناسه شمارش: ${r.countId}`,
      });
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiException ? e.message : "خطا در شروع شمارش";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  // طبق بخش ۶.۸ — POST /mobile/count/:countId/voice
  const countVoiceMut = useMutation({
    mutationFn: () => countVoice(countStart!.countId, { text }),
    onSuccess: (r) => {
      setLastResponse(r);
      setLogs((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          response: r,
          at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setText("");
      if (r.success && r.matched) {
        toast({ title: "تطبیق موفق", description: r.matchedProduct?.name });
      } else if (r.success && !r.matched) {
        toast({
          variant: "destructive",
          title: "بدون تطبیق",
          description: "محصول متناظر یافت نشد.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "خطا در تفسیر",
          description: "متن قابل تفسیر نبود.",
        });
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiException ? e.message : "خطا در ارسال";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  const handleStartCount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startLocationBarcode.trim()) {
      toast({ variant: "destructive", title: "بارکد موقعیت الزامی است" });
      return;
    }
    startCountMut.mutate();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!countStart) {
      toast({ variant: "destructive", title: "ابتدا شمارش را شروع کنید" });
      return;
    }
    if (!text.trim()) {
      toast({ variant: "destructive", title: "متن الزامی است" });
      return;
    }
    countVoiceMut.mutate();
  };

  const confidence = lastResponse?.explanation?.confidence ?? null;
  const confidencePct =
    confidence != null ? Math.round(confidence * 100) : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mic className="h-4 w-4 text-accent" />
            شمارش صوتی (انبارگردانی)
          </CardTitle>
          <CardDescription>
            شمارش صوتی شامل explanation کامل شامل confidence، goodQuantity و
            badQuantity است.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={handleStartCount} className="flex flex-col gap-2">
            <Label htmlFor="count-loc">بارکد موقعیت (شروع شمارش)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="count-loc"
                value={startLocationBarcode}
                onChange={(e) => setStartLocationBarcode(e.target.value)}
                placeholder="مثلاً RACK-01-A"
                disabled={!!countStart}
              />
              <Button
                type="submit"
                disabled={
                  startCountMut.isPending ||
                  !startLocationBarcode.trim() ||
                  !!countStart
                }
              >
                {startCountMut.isPending ? (
                  <LoadingState className="py-0" />
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    شروع شمارش
                  </>
                )}
              </Button>
            </div>
          </form>

          {countStart ? (
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  <span className="text-muted-foreground">countId:</span>{" "}
                  <span className="font-mono">{countStart.countId}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">sessionId:</span>{" "}
                  <span className="font-mono">{countStart.sessionId}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">location:</span>{" "}
                  {String(
                    (countStart.location as { name?: string })?.name ??
                      JSON.stringify(countStart.location)
                  )}
                </span>
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <Label htmlFor="count-text">متن گفتار</Label>
            <Textarea
              id="count-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="مثلاً: سه تا لاستیک سالم و یکی خراب"
              rows={3}
            />
            <Button
              type="submit"
              disabled={
                countVoiceMut.isPending || !countStart || !text.trim()
              }
            >
              {countVoiceMut.isPending ? (
                <LoadingState className="py-0" />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  ارسال
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            آخرین پاسخ
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!lastResponse ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              هنوز پاسخی دریافت نشده است.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={
                    lastResponse.success
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                  }
                >
                  {lastResponse.success ? "موفق" : "ناموفق"}
                </Badge>
                <Badge variant="secondary">
                  {lastResponse.matched ? "تطبیق شد" : "بدون تطبیق"}
                </Badge>
                {lastResponse.matchedProduct ? (
                  <Badge variant="outline">
                    {lastResponse.matchedProduct.name}
                  </Badge>
                ) : null}
              </div>

              {confidencePct != null ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      امتیاز اطمینان (confidence)
                    </span>
                    <span className="font-medium">{confidencePct}%</span>
                  </div>
                  <Progress value={confidencePct} />
                </div>
              ) : null}

              {lastResponse.explanation ? (
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  {lastResponse.explanation.goodQuantity != null ? (
                    <ExplanationStat
                      label="تعداد سالم"
                      value={String(lastResponse.explanation.goodQuantity)}
                      tone="emerald"
                    />
                  ) : null}
                  {lastResponse.explanation.badQuantity != null ? (
                    <ExplanationStat
                      label="تعداد خراب"
                      value={String(lastResponse.explanation.badQuantity)}
                      tone="rose"
                    />
                  ) : null}
                  {confidence != null ? (
                    <ExplanationStat
                      label="Confidence"
                      value={confidence.toFixed(2)}
                      tone="primary"
                    />
                  ) : null}
                </div>
              ) : null}

              <pre
                className="max-h-60 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed scroll-thin"
                dir="ltr"
              >
                {JSON.stringify(lastResponse, null, 2)}
              </pre>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">تاریخچه ارسال‌های این سشن</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              هنوز ارسالی ثبت نشده است.
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              <ul className="flex flex-col gap-2 pe-1">
                {logs.map((l) => {
                  const conf = l.response.explanation?.confidence;
                  return (
                    <li
                      key={l.id}
                      className="flex items-start gap-3 rounded-md border p-3"
                    >
                      <div className="shrink-0">
                        {l.response.matched ? (
                          <Badge className="bg-emerald-100 text-emerald-700">
                            تطبیق
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-100 text-rose-700">
                            بدون تطبیق
                          </Badge>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {l.response.matchedProduct?.name ?? "—"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          «{l.text}»
                        </p>
                        {conf != null ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            confidence: {conf.toFixed(2)} · سالم:{" "}
                            {String(l.response.explanation?.goodQuantity ?? "—")}{" "}
                            · خراب:{" "}
                            {String(l.response.explanation?.badQuantity ?? "—")}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExplanationStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "primary";
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "rose"
      ? "bg-rose-50 text-rose-700"
      : "bg-primary/5 text-primary";
  return (
    <div className={`rounded-md p-2 ${toneClass}`}>
      <p className="text-[10px] opacity-80">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

export default function VoiceInputPage() {
  const user = useAuthStore((s) => s.user);
  if (!user || !["ADMIN", "MANAGER", "STAFF"].includes(user.role)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>دسترسی غیرمجاز</AlertTitle>
          <AlertDescription>
            این صفحه فقط برای نقش‌های ADMIN، MANAGER و STAFF قابل دسترس است.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="مانیتور ورودی صوتی"
        description="مشاهده‌ی زنده‌ی خروجی موتور تشخیص گفتار برای ثبت موجودی و انبارگردانی"
        icon={Mic}
      />

      <Tabs defaultValue="direct" className="w-full">
        <TabsList className="w-fit">
          <TabsTrigger value="direct">
            <Mic className="h-3.5 w-3.5" />
            ثبت مستقیم موجودی
          </TabsTrigger>
          <TabsTrigger value="count">
            <Activity className="h-3.5 w-3.5" />
            شمارش صوتی (انبارگردانی)
          </TabsTrigger>
        </TabsList>
        <TabsContent value="direct">
          <DirectEntryTab />
        </TabsContent>
        <TabsContent value="count">
          <CountVoiceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
