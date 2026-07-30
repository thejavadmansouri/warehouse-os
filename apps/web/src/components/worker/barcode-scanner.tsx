"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
import { X, Loader2, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";

// کامپوننت اسکنر بارکد/QR تمام‌صفحه با دوربین — طبق بخش ب سند افزونه
// از @zxing/browser استفاده می‌کند (framework-agnostic، کنترل دقیق روی دوربین).
export function BarcodeScanner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [status, setStatus] = useState<"starting" | "ready" | "error">(
    "starting"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const onDetectedRef = useRef(onDetected);
  const closedRef = useRef(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;
    closedRef.current = false;
    let reader: BrowserMultiFormatReader | null = null;

    async function startScan() {
      if (!videoRef.current) return;
      setStatus("starting");
      setErrorMsg(null);

      reader = new BrowserMultiFormatReader();
      // hints: تلاش روی همه‌ی فرمت‌ها، با اولویت QR و 1D رایج
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.ITF,
        BarcodeFormat.CODABAR,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      reader.hints = hints;

      try {
        const controls = await reader.decodeFromVideoDevice(
          undefined, // دوربین پیش‌فرض (environment در موبایل)
          videoRef.current,
          (result, _err, controlsInstance) => {
            if (result && !closedRef.current) {
              const text = result.getText();
              if (text) {
                controlsInstance.stop();
                onDetectedRef.current(text);
              }
            }
          }
        );
        controlsRef.current = controls;
        setStatus("ready");
      } catch (e) {
        setStatus("error");
        const msg =
          e instanceof Error ? e.message : "دسترسی به دوربین ناموفق بود.";
        if (/permission|notallowed/i.test(msg)) {
          setErrorMsg("دسترسی به دوربین داده نشد. تنظیمات مرورگر را بررسی کنید.");
        } else if (/notfound|no camera|noinput/i.test(msg)) {
          setErrorMsg("دوربینی روی دستگاه پیدا نشد.");
        } else {
          setErrorMsg("خطا در راه‌اندازی دوربین. دوباره تلاش کنید.");
        }
      }
    }

    startScan();

    return () => {
      closedRef.current = true;
      try {
        controlsRef.current?.stop();
      } catch {
        /* noop */
      }
      controlsRef.current = null;
    };
  }, [open, retryKey]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* نوار بالای اسکنر */}
      <div className="flex items-center justify-between bg-black/80 px-4 py-3 text-white print:hidden">
        <span className="text-sm font-medium">اسکن بارکد قفسه</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-white hover:bg-white/10"
          onClick={onClose}
          aria-label="بستن اسکنر"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* ویدیو دوربین */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
        />
        {/* قاب راهنمای وسط */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-72 rounded-xl border-2 border-accent/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>

        {status === "starting" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">در حال راه‌اندازی دوربین...</p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
            <CameraOff className="h-10 w-10 text-rose-400" />
            <p className="text-sm">{errorMsg}</p>
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRetryKey((k) => k + 1)}
              >
                تلاش مجدد
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose} className="text-white">
                بستن
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* راهنمای پایین */}
      <div className="bg-black/80 px-4 py-3 text-center text-xs text-white/70 print:hidden">
        بارکد را داخل قاب نارنجی قرار دهید
      </div>
    </div>
  );
}
