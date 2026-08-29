/** محاسبه‌ی آمارِ تأخیر برای تست‌های Performance. */
export function percentiles(xs: number[]): { n: number; avg: number; p50: number; p95: number; p99: number; max: number } {
  if (!xs.length) return { n: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
  return {
    n: xs.length,
    avg: Math.round(xs.reduce((s, x) => s + x, 0) / xs.length),
    p50: q(50),
    p95: q(95),
    p99: q(99),
    max: sorted[sorted.length - 1],
  };
}