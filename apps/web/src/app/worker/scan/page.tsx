"use client";

// طبق بخش ب سند افزونه — جریان ثبت ورود کالا (اسکن قفسه + گفتار + نتیجه)
// state machine محلی: scan → ready → result (با حالت needSelection در result)
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ScanLine,
  Mic,
  MicOff,
  ArrowRight,
  Check,
  AlertCircle,
  Package,
  MapPin,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { BarcodeScanner } from "@/components/worker/barcode-scanner";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useBeep } from "@/hooks/use-beep";
import { useToast } from "@/hooks/use-toast";
import {
  resolveLocationByBarcode,
  submitVoice,
  confirmVoice,
  searchProducts,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  Location,
  Product,
  VoiceNeedSelectionResponse,
  VoiceSuccessData,
  VoiceConfirmResponse,
  VoiceResponse,
  VoiceSuggestion,
} from "@/lib/types";
import { useWorkerSession } from "../_context/worker-session";

type Step = "scan" | "ready" | "result";

// شکل نرمالایز شده برای نمایش نتیجه (هم برای submit موفق هم confirm)
interface ResultView {
  productName: string | null;
  productSku?: string | null;
  quantity: number | null;
  inventoryQty: number | null;
  locationName: string | null;
}

export default function WorkerScanPage() {
  const router = useRouter();
  const { toast } = useToast();
  const beep = useBeep();
  const { sessionId } = useWorkerSession();

  const [step, setStep] = React.useState<Step>("scan");
  const [location, setLocation] = React.useState<Location | null>(null);
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [manualBarcode, setManualBarcode] = React.useState("");
  const [resolving, setResolving] = React.useState(false);
  const [resolveError, setResolveError] = React.useState<string | null>(null);

  // ارسال صوت
  const [submitting, setSubmitting] = React.useState(false);
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ResultView | null>(null);
  const [needSelection, setNeedSelection] =
    React.useState<VoiceNeedSelectionResponse | null>(null);

  // جستجوی محصول (هنگام needSelection)
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<Product[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // textarea جایگزین وقتی Web Speech API در دسترس نیست
  const [fallbackText, setFallbackText] = React.useState("");

  const { supported, listening, interim, error: recError, start, stop } =
    useSpeechRecognition({
      lang: "fa-IR",
      onFinal: (text) => void handleVoice(text),
    });

  // طبق بخش ب — GET /products/search?q=
  const runSearch = React.useCallback(async (q: string) => {
    const query = q.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await searchProducts(query);
      setSearchResults(r);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // debounce جستجو هنگام needSelection بدون suggestions از سرور
  React.useEffect(() => {
    if (step !== "result" || !needSelection) return;
    if (needSelection.suggestions.length > 0) return; // سرور خودش پیشنهاد داده
    const t = setTimeout(() => {
      if (searchQuery.trim()) void runSearch(searchQuery);
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery, step, needSelection, runSearch]);

  // طبق بخش ب — GET /locations/resolve/:barcode
  async function resolveBarcode(barcode: string) {
    const code = barcode.trim();
    if (!code) return;
    setResolving(true);
    setResolveError(null);
    try {
      const loc = await resolveLocationByBarcode(code);
      setLocation(loc);
      setStep("ready");
      beep("success");
      toast({
        title: "قفسه شناسایی شد",
        description: loc.name,
      });
    } catch (e) {
      if (e instanceof ApiException && e.status === 404) {
        setResolveError("قفسه با این بارکد پیدا نشد. دوباره اسکن کنید.");
      } else {
        const msg =
          e instanceof ApiException ? e.message : "خطا در شناسایی قفسه";
        setResolveError(msg);
      }
      beep("error");
    } finally {
      setResolving(false);
    }
  }

  function handleDetected(barcode: string) {
    setScannerOpen(false);
    void resolveBarcode(barcode);
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualBarcode.trim()) return;
    void resolveBarcode(manualBarcode.trim());
    setManualBarcode("");
  }

  // طبق بخش ب — POST /inventory/voice
  async function handleVoice(text: string) {
    if (!sessionId) {
      toast({
        variant: "destructive",
        title: "سشن فعال نیست",
        description: "ابتدا به صفحه‌ی اصلی برگردید و شیفت را شروع کنید.",
      });
      return;
    }
    if (!location?.barcode) {
      toast({
        variant: "destructive",
        title: "قفسه انتخاب نشده",
        description: "اول بارکد قفسه را اسکن کنید.",
      });
      return;
    }
    setSubmitting(true);
    setVoiceError(null);
    try {
      const r: VoiceResponse = await submitVoice({
        locationBarcode: location.barcode,
        text,
        sessionId,
      });
      if (r.success) {
        const d = r as unknown as VoiceSuccessData;
        beep("success");
        setResult({
          productName: d.product?.name ?? null,
          productSku: d.product?.sku ?? null,
          quantity: typeof d.quantity === "number" ? d.quantity : null,
          inventoryQty: d.inventory?.quantity ?? null,
          locationName: d.location?.name ?? location.name,
        });
        setNeedSelection(null);
        setStep("result");
      } else {
        const need = r as unknown as VoiceNeedSelectionResponse;
        setNeedSelection(need);
        setStep("result");
        // اگر suggestion نبود، اولین کلمه‌ی متن را برای جستجو می‌گذاریم
        const firstWord = text.trim().split(/\s+/)[0] ?? "";
        if (firstWord && need.suggestions.length === 0) {
          setSearchQuery(firstWord);
          void runSearch(firstWord);
        }
      }
    } catch (e) {
      const msg = e instanceof ApiException ? e.message : "خطا در ارسال صوت";
      setVoiceError(msg);
      beep("error");
    } finally {
      setSubmitting(false);
    }
  }

  // طبق بخش ب — POST /inventory/voice/confirm
  async function handleConfirmProduct(productId: string, name: string) {
    if (!sessionId || !location?.barcode) return;
    setConfirming(true);
    try {
      const r: VoiceConfirmResponse = await confirmVoice({
        productId,
        locationBarcode: location.barcode,
        sessionId,
      });
      beep("success");
      setResult({
        productName: name,
        productSku: null,
        quantity: null,
        inventoryQty: r.inventory?.quantity ?? null,
        locationName: r.location?.name ?? location.name,
      });
      setNeedSelection(null);
      toast({ title: "ثبت شد", description: name });
    } catch (e) {
      const msg = e instanceof ApiException ? e.message : "خطا در تأیید محصول";
      toast({ variant: "destructive", title: "خطا", description: msg });
      beep("error");
    } finally {
      setConfirming(false);
    }
  }

  function nextItemSameShelf() {
    setResult(null);
    setNeedSelection(null);
    setVoiceError(null);
    setFallbackText("");
    setStep("ready");
  }

  function changeShelf() {
    setResult(null);
    setNeedSelection(null);
    setLocation(null);
    setVoiceError(null);
    setFallbackText("");
    setSearchQuery("");
    setSearchResults([]);
    setStep("scan");
  }

  function handleMicToggle() {
    if (listening) {
      stop();
    } else {
      setVoiceError(null);
      start();
    }
  }

  function handleFallbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = fallbackText.trim();
    if (!text) return;
    void handleVoice(text);
    setFallbackText("");
  }

  // گارد: اگر سشن نیست، برگرد به /worker
  if (!sessionId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-lg font-bold">شیفت شروع نشده</p>
        <p className="text-sm text-muted-foreground">
          ابتدا یک شیفت جدید شروع کنید.
        </p>
        <Button
          className="h-14 text-lg"
          onClick={() => router.replace("/worker")}
        >
          <ArrowRight className="h-5 w-5" />
          بازگشت
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() => router.replace("/worker")}
          aria-label="بازگشت"
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">ثبت ورود کالا</p>
          <p className="text-xs text-muted-foreground">اسکن قفسه و سپس گفتار</p>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4">
        {location ? (
          <Card className="gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <MapPin className="h-5 w-5 shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="truncate text-base font-bold">{location.name}</p>
                  {location.code ? (
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {location.code}
                    </p>
                  ) : null}
                </div>
              </div>
              {(step === "ready" || step === "result") && !submitting ? (
                <Button
                  variant="outline"
                  className="h-10 shrink-0 text-sm"
                  onClick={changeShelf}
                >
                  تغییر قفسه
                </Button>
              ) : null}
            </div>
          </Card>
        ) : null}

        {step === "scan" ? (
          <ScanStep
            scannerOpen={scannerOpen}
            setScannerOpen={setScannerOpen}
            onDetected={handleDetected}
            resolving={resolving}
            resolveError={resolveError}
            manualBarcode={manualBarcode}
            setManualBarcode={setManualBarcode}
            onManualSubmit={handleManualSubmit}
          />
        ) : null}

        {step === "ready" ? (
          <ReadyStep
            supported={supported}
            listening={listening}
            interim={interim}
            recError={recError}
            submitting={submitting}
            voiceError={voiceError}
            fallbackText={fallbackText}
            setFallbackText={setFallbackText}
            onMicToggle={handleMicToggle}
            onFallbackSubmit={handleFallbackSubmit}
          />
        ) : null}

        {step === "result" ? (
          <ResultStep
            result={result}
            needSelection={needSelection}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchResults={searchResults}
            searching={searching}
            confirming={confirming}
            onConfirm={handleConfirmProduct}
            onNextItem={nextItemSameShelf}
            onChangeShelf={changeShelf}
          />
        ) : null}
      </main>
    </div>
  );
}

// ----- مرحله‌ی اسکن قفسه -----

function ScanStep({
  scannerOpen,
  setScannerOpen,
  onDetected,
  resolving,
  resolveError,
  manualBarcode,
  setManualBarcode,
  onManualSubmit,
}: {
  scannerOpen: boolean;
  setScannerOpen: (v: boolean) => void;
  onDetected: (b: string) => void;
  resolving: boolean;
  resolveError: string | null;
  manualBarcode: string;
  setManualBarcode: (v: string) => void;
  onManualSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      {resolveError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>خطا</AlertTitle>
          <AlertDescription>{resolveError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="rounded-full bg-accent/15 p-6">
          <ScanLine className="h-12 w-12 text-accent" />
        </div>
        <div>
          <h2 className="text-xl font-bold">اسکن بارکد قفسه</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            بارکد قفسه را با دوربین اسکن کنید.
          </p>
        </div>
      </div>

      <Button
        className="h-16 w-full text-lg"
        onClick={() => setScannerOpen(true)}
        disabled={resolving}
      >
        {resolving ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            در حال شناسایی...
          </>
        ) : (
          <>
            <ScanLine className="h-5 w-5" />
            شروع اسکن
          </>
        )}
      </Button>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span>یا</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onManualSubmit} className="flex flex-col gap-2">
        <label className="text-sm font-medium">وارد کردن دستی بارکد</label>
        <div className="flex gap-2">
          <Input
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            placeholder="مثلاً SHELF-01-A"
            className="h-12 text-base"
            dir="ltr"
            autoComplete="off"
          />
          <Button
            type="submit"
            className="h-12 px-4 text-base"
            disabled={!manualBarcode.trim() || resolving}
          >
            <ArrowLeft className="h-5 w-5" />
            تأیید
          </Button>
        </div>
      </form>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={onDetected}
      />
    </div>
  );
}

// ----- مرحله‌ی آماده‌ی گفتار -----

function ReadyStep({
  supported,
  listening,
  interim,
  recError,
  submitting,
  voiceError,
  fallbackText,
  setFallbackText,
  onMicToggle,
  onFallbackSubmit,
}: {
  supported: boolean;
  listening: boolean;
  interim: string;
  recError: string | null;
  submitting: boolean;
  voiceError: string | null;
  fallbackText: string;
  setFallbackText: (v: string) => void;
  onMicToggle: () => void;
  onFallbackSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      {voiceError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>خطا</AlertTitle>
          <AlertDescription>{voiceError}</AlertDescription>
        </Alert>
      ) : null}

      {recError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>خطای میکروفون</AlertTitle>
          <AlertDescription>{recError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div>
          <h2 className="text-xl font-bold">ثبت با گفتار</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            برای ثبت، بگویید: نام قطعه + تعداد
          </p>
          <p className="mt-1 text-xs text-muted-foreground" dir="rtl">
            مثلاً: «پنج تا لاستیک پراید»
          </p>
        </div>

        {supported ? (
          <button
            type="button"
            onClick={onMicToggle}
            disabled={submitting}
            aria-label={listening ? "توقف ضبط" : "شروع ضبط"}
            className={[
              "flex h-32 w-32 items-center justify-center rounded-full border-4 shadow-lg transition-all",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40",
              listening
                ? "border-destructive bg-destructive text-white animate-pulse"
                : "border-accent bg-accent text-accent-foreground hover:bg-accent/90",
              submitting ? "opacity-60" : "",
            ].join(" ")}
          >
            {submitting ? (
              <Loader2 className="h-10 w-10 animate-spin" />
            ) : listening ? (
              <MicOff className="h-10 w-10" />
            ) : (
              <Mic className="h-10 w-10" />
            )}
          </button>
        ) : (
          // fallback: Web Speech API پشتیبانی نمی‌شود
          <form
            onSubmit={onFallbackSubmit}
            className="flex w-full flex-col gap-3"
          >
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>تشخیص گفتار پشتیبانی نمی‌شود</AlertTitle>
              <AlertDescription>
                مرورگر شما از تشخیص خودکار گفتار پشتیبانی نمی‌کند. متن را دستی
                وارد کنید.
              </AlertDescription>
            </Alert>
            <Textarea
              value={fallbackText}
              onChange={(e) => setFallbackText(e.target.value)}
              placeholder="مثلاً: پنج تا لاستیک پراید"
              rows={3}
              className="text-base"
            />
            <Button
              type="submit"
              className="h-14 text-lg"
              disabled={submitting || !fallbackText.trim()}
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Mic className="h-5 w-5" />
                  ارسال متن
                </>
              )}
            </Button>
          </form>
        )}

        {supported ? (
          <div className="min-h-[2.5rem] w-full text-center">
            {listening ? (
              <p className="text-sm text-destructive">در حال شنیدن...</p>
            ) : null}
            {interim ? (
              <p className="mt-1 text-base font-medium" dir="rtl">
                {interim}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ----- مرحله‌ی نمایش نتیجه -----

function ResultStep({
  result,
  needSelection,
  searchQuery,
  setSearchQuery,
  searchResults,
  searching,
  confirming,
  onConfirm,
  onNextItem,
  onChangeShelf,
}: {
  result: ResultView | null;
  needSelection: VoiceNeedSelectionResponse | null;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchResults: Product[];
  searching: boolean;
  confirming: boolean;
  onConfirm: (productId: string, name: string) => void;
  onNextItem: () => void;
  onChangeShelf: () => void;
}) {
  // حالت needSelection: کارگر باید محصول را انتخاب کند
  if (needSelection) {
    const hasServerSuggestions = needSelection.suggestions.length > 0;
    const list: VoiceSuggestion[] = hasServerSuggestions
      ? (needSelection.suggestions as unknown as VoiceSuggestion[])
      : (searchResults as unknown as VoiceSuggestion[]);

    return (
      <div className="flex flex-1 flex-col gap-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>نیازمند انتخاب محصول</AlertTitle>
          <AlertDescription>{needSelection.message}</AlertDescription>
        </Alert>

        {!hasServerSuggestions ? (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">جستجوی محصول</label>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="نام یا SKU محصول..."
              className="h-12 text-base"
              autoComplete="off"
            />
            {searching ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                در حال جستجو...
              </p>
            ) : null}
          </div>
        ) : null}

        {list.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              {hasServerSuggestions ? "پیشنهادها:" : "نتایج جستجو:"}
            </p>
            <ScrollArea className="max-h-72 rounded-md border">
              <ul className="divide-y">
                {list.map((p) => (
                  <li key={p.id} className="p-2">
                    <Button
                      variant="outline"
                      className="h-14 w-full justify-start gap-2 text-base"
                      disabled={confirming}
                      onClick={() => onConfirm(p.id, p.name)}
                    >
                      <Package className="h-5 w-5 shrink-0 text-accent" />
                      <span className="truncate text-start">{p.name}</span>
                      {p.sku ? (
                        <Badge variant="secondary" className="ms-auto">
                          {p.sku}
                        </Badge>
                      ) : null}
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        ) : (
          !searching && (
            <p className="text-sm text-muted-foreground">
              محصولی برای انتخاب یافت نشد. عبارت دیگری را امتحان کنید.
            </p>
          )
        )}

        {confirming ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            در حال تأیید...
          </p>
        ) : null}

        <Button
          variant="ghost"
          className="h-12 text-base"
          onClick={onChangeShelf}
          disabled={confirming}
        >
          <ArrowRight className="h-5 w-5" />
          بازگشت و تغییر قفسه
        </Button>
      </div>
    );
  }

  // حالت موفق: تیک سبز بزرگ + اطلاعات
  if (!result) return null;
  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card className="gap-4 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-emerald-100 p-4 text-emerald-700">
            <Check className="h-12 w-12" />
          </div>
          <h2 className="text-xl font-bold text-emerald-700">ثبت شد</h2>
        </div>

        <div className="flex flex-col gap-3">
          <ResultRow
            icon={<Package className="h-5 w-5 text-accent" />}
            label="کالا"
            value={result.productName ?? "—"}
          />
          {result.productSku ? (
            <ResultRow
              icon={<Badge variant="secondary">SKU</Badge>}
              label=""
              value={result.productSku}
              ltr
            />
          ) : null}
          {result.quantity != null ? (
            <ResultRow
              icon={<Check className="h-5 w-5 text-accent" />}
              label="تعداد ثبت‌شده"
              value={String(result.quantity)}
            />
          ) : null}
          {result.inventoryQty != null ? (
            <ResultRow
              icon={<Package className="h-5 w-5 text-muted-foreground" />}
              label="موجی فعلی قفسه"
              value={String(result.inventoryQty)}
            />
          ) : null}
        </div>
      </Card>

      <div className="mt-auto flex flex-col gap-3">
        <Button className="h-16 text-lg" onClick={onNextItem}>
          <ArrowLeft className="h-5 w-5" />
          کالای بعدی
        </Button>
        <Button
          variant="outline"
          className="h-14 text-base"
          onClick={onChangeShelf}
        >
          <ScanLine className="h-5 w-5" />
          اسکن قفسه‌ی بعدی
        </Button>
      </div>
    </div>
  );
}

function ResultRow({
  icon,
  label,
  value,
  ltr,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        {label ? (
          <p className="text-xs text-muted-foreground">{label}</p>
        ) : null}
        <p
          className={`truncate text-base font-bold ${ltr ? "font-mono" : ""}`}
          dir={ltr ? "ltr" : "rtl"}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
