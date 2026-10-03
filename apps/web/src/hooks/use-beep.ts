"use client";

import { useCallback, useRef } from "react";

// پخش بوق کوتاه موفقیت با Web Audio API — طبق بخش ب سند افزونه (اختیاری)
// بدون نیاز به فایل صوتی؛ مستقیماً با اسیلاتور تولید می‌شود.
export function useBeep() {
  const ctxRef = useRef<AudioContext | null>(null);

  const beep = useCallback(
    (type: "success" | "error" = "success") => {
      if (typeof window === "undefined") return;
      try {
        if (!ctxRef.current) {
          const AC =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          if (!AC) return;
          ctxRef.current = new AC();
        }
        const ctx = ctxRef.current;
        if (ctx.state === "suspended") void ctx.resume();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === "success") {
          // دو نت بالارونده
          osc.frequency.setValueAtTime(660, ctx.currentTime);
          osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
          osc.start();
          osc.stop(ctx.currentTime + 0.26);
        } else {
          // یک نت پایین
          osc.frequency.setValueAtTime(220, ctx.currentTime);
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
          osc.start();
          osc.stop(ctx.currentTime + 0.31);
        }
      } catch {
        /* noop — بوق غیرحیاتی است */
      }
    },
    []
  );

  return beep;
}
