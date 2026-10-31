import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive" | "amber" | "emerald";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", loading = false, disabled, children, ...props }, ref) => {
    const base = "inline-flex items-center justify-center font-bold tracking-tight rounded-xl transition-all select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/40";

    const variants: Record<string, string> = {
      primary: "bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-md shadow-orange-500/20 border border-amber-400/40",
      amber: "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm",
      secondary: "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700/80 shadow-xs",
      outline: "border border-slate-700/80 hover:bg-slate-850 text-slate-200 hover:text-white",
      ghost: "hover:bg-slate-800 text-slate-300 hover:text-white",
      destructive: "bg-rose-600 hover:bg-rose-500 text-white shadow-sm",
      emerald: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm",
    };

    const sizes: Record<string, string> = {
      sm: "h-8 px-3 text-xs gap-1.5",
      md: "h-10 px-4 text-sm gap-2",
      lg: "h-12 px-6 text-base gap-2.5",
      icon: "size-10 p-0 text-sm",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${base} ${variants[variant] ?? variants.primary} ${sizes[size] ?? sizes.md} ${className}`}
        {...props}
      >
        {loading && (
          <svg className="animate-spin size-4 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
