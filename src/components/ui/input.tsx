import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error, label, id, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5 text-right">
        {label && (
          <label htmlFor={id} className="block text-xs font-bold text-slate-300">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`w-full h-11 px-3.5 rounded-xl border bg-slate-900/90 text-white placeholder:text-slate-500 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 disabled:opacity-50 disabled:bg-slate-950 ${
            error ? "border-rose-500 ring-1 ring-rose-500/40" : "border-slate-800 hover:border-slate-700"
          } ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-rose-400 font-semibold">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
