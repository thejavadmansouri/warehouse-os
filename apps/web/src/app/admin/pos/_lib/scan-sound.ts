/**
 * صدای تأیید اسکن — بیپِ کوتاهِ موفق و دوبیپِ خطا.
 *
 * استانداردِ صندوق‌های ایرانی: هر اسکنِ درست یک بیپِ بلندِ کوتاه، هر خطا
 * دوبیپِ بم. با خودِ مرورگر ساخته می‌شود (AudioContext)، نه فایلِ صوتی — تا
 * نصبِ ویندوزی هم بدون هیچ asset اضافه‌ای کار کند.
 *
 * خاموش‌کردن با `Ctrl+B` در صندوق — انتخاب در localStorage می‌ماند تا بین
 * رفرش‌ها زنده بماند (همان قراردادِ سبدِ crash-safe).
 *
 * قانونِ آهنین: صدا هرگز نباید کار را بند بیاورد — مرورگرِ بدون AudioContext
 * (یا jsdomِ تست) بی‌صدا رد می‌شود، نه خطا.
 */

export type ScanSoundKind = "ok" | "error";

const MUTE_KEY = "pos-scan-sound-muted";

export function isScanSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setScanSoundMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    // localStorage نبود (حالت خصوصی و… ) — انتخاب فقط برای همین جلسه.
  }
}

/** خاموش/روشن می‌کند و حالتِ تازه را برمی‌گرداند. */
export function toggleScanSoundMuted(): boolean {
  const next = !isScanSoundMuted();
  setScanSoundMuted(next);
  return next;
}

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  // سیاستِ autoplay: بعد از اولین کلیدِ کاربر resume می‌شود — اسکن خودش
  // یک حرکتِ کاربر است، پس اینجا همیشه مجاز است.
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

/** یک بیپ با پوشِ حجم — فرکانس/زمان پارامتر تا موفق و خطا شکلِ متفاوت داشته باشند. */
function tone(ac: AudioContext, at: number, freq: number, seconds: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.14, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.start(at);
  osc.stop(at + seconds + 0.01);
}

/** اسکن موفق: یک بیپِ بلندِ کوتاه. خطا: دو بیپِ بم — از دور هم قابل تشخیص‌اند. */
export function playScanSound(kind: ScanSoundKind): void {
  if (isScanSoundMuted()) return;
  const ac = audioCtx();
  if (!ac) return;
  try {
    const t = ac.currentTime;
    if (kind === "ok") {
      tone(ac, t, 880, 0.09);
    } else {
      tone(ac, t, 300, 0.08);
      tone(ac, t + 0.16, 300, 0.08);
    }
  } catch {
    // صدا هرگز نباید کارِ فروش را بند بیاورد.
  }
}
