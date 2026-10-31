import * as React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "kardo" | "success" | "warning" | "danger" | "info" | "neutral" | "outline";
}

export function Badge({ className = "", variant = "kardo", children, ...props }: BadgeProps) {
  const base = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold tracking-tight select-none border";

  const variants: Record<string, string> = {
    kardo: "bg-orange-950/80 text-orange-300 border-orange-500/40 shadow-xs",
    success: "bg-emerald-950/70 text-emerald-300 border-emerald-500/30",
    warning: "bg-amber-950/70 text-amber-300 border-amber-500/30",
    danger: "bg-rose-950/70 text-rose-300 border-rose-500/30",
    info: "bg-blue-950/70 text-blue-300 border-blue-500/30",
    neutral: "bg-slate-800 text-slate-300 border-slate-700",
    outline: "border-slate-600 text-slate-300 bg-transparent",
  };

  return (
    <span className={`${base} ${variants[variant] ?? variants.kardo} ${className}`} {...props}>
      {children}
    </span>
  );
}
