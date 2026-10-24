"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

/**
 * `sticky`: هدر هنگام اسکرول می‌ماند. روی th اعمال می‌شود (نه thead) تا در
 * همه مرورگرها کار کند. ظرفِ خودِ Table (overflow-x-auto) ظرفِ اسکرول است،
 * پس اسکرولِ عمودی هم باید همان‌جا باشد: `containerClassName` با ارتفاعِ
 * محدود (مثلاً `max-h-[70vh]` یا `min-h-0 flex-1`) — اسکرولِ والد هدر را نگه نمی‌دارد.
 */
function TableHeader({
  className,
  sticky = false,
  ...props
}: React.ComponentProps<"thead"> & { sticky?: boolean }) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_tr]:border-b",
        sticky &&
          "[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background/95 [&_th]:backdrop-blur [&_th]:shadow-[inset_0_-1px_0_var(--border)]",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-muted/60 data-[state=selected]:bg-primary/5 border-border/60 border-b transition-colors",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        /* text-start (نه text-left): در RTL یعنی راست — هدر باید با مقادیرِ
           ارث‌برده از dir=rtl هم‌تراز باشد؛ text-left هدر را چپ می‌نشاند و
           مقدارِ راست‌چین هیچ‌وقت زیر هدرش نمی‌نشست. */
        "text-muted-foreground h-11 px-3 text-start align-middle text-xs font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2.5 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
