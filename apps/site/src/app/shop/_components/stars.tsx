"use client";

// نمایش امتیاز با ستاره — عددِ شناور تا نیم‌ستاره‌ی کامل.
import { Star, StarHalf } from "lucide-react";

export function Stars({
  value,
  size = 14,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const full = Math.floor(value);
  const half = value - full >= 0.25 && value - full < 0.75;
  const arr = Array.from({ length: 5 }, (_, i) => i + 1);

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-amber-500 ${className ?? ""}`}
      role="img"
      aria-label={`${value} از ۵`}
    >
      {arr.map((i) => {
        if (i <= full) return <Star key={i} size={size} className="fill-current" aria-hidden />;
        if (half && i === full + 1)
          return <StarHalf key={i} size={size} className="fill-current" aria-hidden />;
        return <Star key={i} size={size} className="text-muted-foreground/30" aria-hidden />;
      })}
    </span>
  );
}