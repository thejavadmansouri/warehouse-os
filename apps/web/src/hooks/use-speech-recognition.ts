"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// انواع مینیمال برای Web Speech API (TypeScript داخلی ندارد)
interface SpeechRecognitionResultLike {
  0: { transcript: string; confidence: number };
  isFinal: boolean;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorLike {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechRecognitionOptions {
  lang?: string;
  onFinal?: (text: string) => void;
}

export interface UseSpeechRecognitionReturn {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

// هوک تشخیص گفتار سمت مرورگر — طبق بخش ب سند افزونه
// تبدیل صدا به متن کامل در مرورگر انجام می‌شود؛ فقط متن نهایی به سرور فرستاده می‌شود.
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const { lang = "fa-IR", onFinal } = options;
  const [supported] = useState<boolean>(() => !!getRecognitionCtor());
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);
  const manualStopRef = useRef(false);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* noop */
      }
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("مرورگر شما از تشخیص گفتار پشتیبانی نمی‌کند.");
      return;
    }
    setError(null);
    setInterim("");

    // نمونه‌ی جدید در هر بار شروع (برای reset تمیز)
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      manualStopRef.current = false;
      setListening(true);
    };

    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let interimText = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          finalText += r[0].transcript;
        } else {
          interimText += r[0].transcript;
        }
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        setInterim("");
        const trimmed = finalText.trim();
        if (trimmed) onFinalRef.current?.(trimmed);
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorLike) => {
      if (e.error === "no-speech") {
        setError("صدایی شنیده نشد. دوباره تلاش کنید.");
      } else if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("دسترسی به میکروفون داده نشد.");
      } else if (e.error === "aborted") {
        // توقف دستی — خطا نیست
      } else {
        setError(e.message || "خطا در تشخیص گفتار.");
      }
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
      setInterim("");
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setError("شروع ضبط ناموفق بود.");
      setListening(false);
    }
  }, [lang]);

  // پاک‌سازی هنگام unmount
  useEffect(() => {
    return () => {
      if (recRef.current) {
        try {
          recRef.current.abort();
        } catch {
          /* noop */
        }
        recRef.current = null;
      }
    };
  }, []);

  return { supported, listening, interim, error, start, stop };
}
