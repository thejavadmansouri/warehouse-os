"use client";

// طبق بخش ب سند افزونه — جریان انبارگردانی (شمارش صوتی)
// state machine محلی: scan → ready → result (با لیست زنده‌ی نتایج این session)
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ScanLine,
  Mic,
  MicOff,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  MapPin,
  Loader2,
  ClipboardList,
  Package,
} from "lucide-react";
import { BarcodeScanner } from "@/components/worker/barcode-scanner";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useBeep } from "@/hooks/use-beep";
import { useToast } from "@/hooks/use-toast";
import {
  resolveLocationByBarcode,
  startCount,
  countVoice,
} from "@/lib/api";
import { ApiException } from "@/lib/api-error-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type {
  Location,
  CountStartResponse,
  CountVoiceResponse,
} from "@/lib/types";

type Step = "scan" | "ready" | "result";

interface CountLogItem {
  id: string;
  name: string | null;
  good: number | null;
  bad: number | null;
  matched: boolean;
  at: number;
}

export default function WorkerCountPage() {
  const router = useRouter();
  const { toast } = useToast();
  const beep = useBeep();
  // نکته: مسیر انبارگردانی از startCount خودش sessionId/countId می‌سازد
  // و به session ادمین (/inventory-session/start) وابسته نیست.

  const [step, setStep] = React.useState<Step>("scan");
  const [location, setLocation] = React.useState<Location | null>(null);
  const [countStart, setCountStart] =
    React.useState<CountStartResponse | null>(null);
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [manualBarcode, setManualBarcode] = React.useState("");

  const [resolving, setResolving] = React.useState(false);
  const [startError, setStartError] = React.useState<string | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const [lastResult, setLastResult] = React.useState<CountVoiceResponse | null>(
    null
  );

  const [fallbackText, setFallbackText] = React.useState("");

  // لیست زنده‌ی نتایج این session
  const [log, setLog] = React.useState<CountLogItem[]>([]);

  const { supported, listening, interim, error: recError, start, stop } =
    useSpeechRecognition({
      lang: "fa-IR",
      onFinal: (text) => void handleCountVoice(text),
    });

  // طبق بخش ب — GET /locations/resolve/:barcode و سپس POST /mobile/count/start
  async function resolveAndStart(barcode: string) {
    const code = barcode.trim();
    if (!code) return;
    setResolving(true);
    setStartError(null);
    try {
      const loc = await resolveLocationByBarcode(code);
      // شروع شمارش
      const cs = await startCount({ locationBarcode: code });
      setLocation(loc);
      setCountStart(cs);
      setStep("ready");
      beep("success");
      toast({
        title: "شمارش شروع شد",
        description: loc.name,
      });
    } catch (e) {
      if (e instanceof ApiException && e.status === 404) {
        setStartError("قفسه با این بارکد پیدا نشد. دوباره اسکن کنید.");
      } else {
        const msg =
          e instanceof ApiException ? e.message : "خطا در شروع شمارش";
        setStartError(msg);
      }
      beep("error");
    } finally {
      setResolving(false);
    }
  }

  function handleDetected(barcode: string) {
    setScannerOpen(false);
    void resolveAndStart(barcode);
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualBarcode.trim()) return;
    void resolveAndStart(manualBarcode.trim());
    setManualBarcode("");
  }

  // طبق بخش ب — POST /mobile/count/:countId/voice
  async function handleCountVoice(text: string) {
    if (!countStart?.countId) {
      toast({
        variant: "destructive",
        title: "شمارش شروع نشده",
        description: "اول بارکد قفسه را اسکن کنید.",
      });
      return;
    }
    setSubmitting(true);
    setVoiceError(null);
    try {
      const r: CountVoiceResponse = await countVoice(countStart.countId, {
        text,
      });
      setLastResult(r);
      if (r.matched) {
        beep("success");
      } else {
        beep("error");
      }
      // افزودن به لیست زنده
      setLog((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: r.matchedProduct?.name ?? null,
          good: r.explanation?.goodQuantity ?? null,
          bad: r.explanation?.badQuantity ?? null,
          matched: r.matched,
          at: Date.now(),
        },
        ...prev,
      ]);
      setStep("result");
    } catch (e) {
      const msg = e instanceof ApiException ? e.message : "خطا در ارسال صوت";
      setVoiceError(msg);
      beep("error");
    } finally {
      setSubmitting(false);
    }
  }

  function nextItem() {
    setLastResult(null);
    setVoiceError(null);
    setFallbackText("");
    setStep("ready");
  }

  function changeShelf() {
    setLastResult(null);
    setLocation(null);
    setCountStart(null);
    setVoiceError(null);
    setFallbackText("");
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
    void handleCountVoice(text);
    setFallbackText("");
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
          <p className="truncate text-base font-bold">انبارگردانی</p>
          <p className="text-xs text-muted-foreground">شمارش صوتی قفسه</p>
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
            startError={startError}
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
            result={lastResult}
            onNext={nextItem}
            onChangeShelf={changeShelf}
          />
        ) : null}

        {/* لیست زنده‌ی نتایج این session */}
        {log.length > 0 ? (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <ClipboardList className="h-4 w-4 text-accent" />
                  شمارش‌های این قفسه
                </p>
                <Badge variant="secondary">{log.length}</Badge>
              </div>
              <ScrollArea className="max-h-64 rounded-md border">
                <ul className="divide-y">
                  {log.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 p-3 text-sm"
                    >
                      {item.matched ? (
                        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {item.name ?? "تطبیق پیدا نشد"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {item.good != null ? (
                            <span className="text-emerald-700">
                              سالم: {item.good}
                            </span>
                          ) : null}
                          {item.bad != null ? (
                            <span className="text-destructive">
                              خراب: {item.bad}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          </>
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
  startError,
  manualBarcode,
  setManualBarcode,
  onManualSubmit,
}: {
  scannerOpen: boolean;
  setScannerOpen: (v: boolean) => void;
  onDetected: (b: string) => void;
  resolving: boolean;
  startError: string | null;
  manualBarcode: string;
  setManualBarcode: (v: string) => void;
  onManualSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      {startError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>خطا</AlertTitle>
          <AlertDescription>{startError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="rounded-full bg-accent/15 p-6">
          <ScanLine className="h-12 w-12 text-accent" />
        </div>
        <div>
          <h2 className="text-xl font-bold">اسکن بارکد قفسه</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            قفسه‌ای که می‌خواهید انبارگردانی کنید را اسکن کنید.
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
            در حال شروع شمارش...
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
          <h2 className="text-xl font-bold">شمارش با گفتار</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            نام قطعه و تعداد سالم/خراب را بگویید.
          </p>
          <p className="mt-1 text-xs text-muted-foreground" dir="rtl">
            مثلاً: «سه تا لاستیک سالم، یکی خراب»
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
              placeholder="مثلاً: سه تا لاستیک سالم، یکی خراب"
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
  onNext,
  onChangeShelf,
}: {
  result: CountVoiceResponse | null;
  onNext: () => void;
  onChangeShelf: () => void;
}) {
  if (!result) return null;
  const matched = result.matched;
  const good = result.explanation?.goodQuantity;
  const bad = result.explanation?.badQuantity;
  const confidence = result.explanation?.confidence;
  const confidencePct =
    typeof confidence === "number"
      ? Math.max(0, Math.min(100, Math.round(confidence * 100)))
      : null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card className="gap-4 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {matched ? (
            <div className="rounded-full bg-emerald-100 p-4 text-emerald-700">
              <Check className="h-12 w-12" />
            </div>
          ) : (
            <div className="rounded-full bg-destructive/15 p-4 text-destructive">
              <AlertCircle className="h-12 w-12" />
            </div>
          )}
          <h2
            className={`text-xl font-bold ${
              matched ? "text-emerald-700" : "text-destructive"
            }`}
          >
            {matched ? "تطبیق پیدا کرد" : "تطبیق پیدا نشد"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {matched
              ? result.matchedProduct?.name ?? "—"
              : "لطفاً واضح‌تر بگویید و دوباره تلاش کنید."}
          </p>
        </div>

        {matched ? (
          <div className="flex flex-col gap-3">
            {result.matchedProduct ? (
              <ResultRow
                icon={<Package className="h-5 w-5 text-accent" />}
                label="کالا"
                value={result.matchedProduct.name}
              />
            ) : null}
            {good != null ? (
              <ResultRow
                icon={<Check className="h-5 w-5 text-emerald-600" />}
                label="تعداد سالم"
                value={String(good)}
              />
            ) : null}
            {bad != null ? (
              <ResultRow
                icon={<AlertCircle className="h-5 w-5 text-destructive" />}
                label="تعداد خراب"
                value={String(bad)}
              />
            ) : null}
            {confidencePct != null ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>اطمینان تطبیق</span>
                  <span className="font-mono" dir="ltr">
                    {confidencePct}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${confidencePct}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className="mt-auto flex flex-col gap-3">
        <Button className="h-16 text-lg" onClick={onNext}>
          <ArrowLeft className="h-5 w-5" />
          شمارش بعدی
        </Button>
        <Button
          variant="outline"
          className="h-14 text-base"
          onClick={onChangeShelf}
        >
          <ScanLine className="h-5 w-5" />
          تغییر قفسه
        </Button>
      </div>
    </div>
  );
}

function ResultRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-base font-bold" dir="rtl">
          {value}
        </p>
      </div>
    </div>
  );
}
