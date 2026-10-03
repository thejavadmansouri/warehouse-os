"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  COMMAND_GROUPS,
  GROUP_COLOR,
  commandsOf,
  type CommandId,
  type CommandSpec,
} from "./commands";

/**
 * یک فرمان چطور به یک صفحه وصل می‌شود.
 *
 * `undefined` یعنی این سند آن فرمان را ندارد — دکمه سر جایش می‌ماند و خاموش
 * می‌شود. این عمدی است: اگر دکمه‌ها با نوع سند جابه‌جا شوند، فروشنده هر بار
 * باید از نو دنبالشان بگردد و کارِ کیبوردی بی‌معنی می‌شود.
 */
export interface CommandBinding {
  run: () => void;
  /** بازنویسیِ برچسب برای همین سند — مثلاً «ثبت اصلاح» به‌جای «ثبت سند». */
  label?: string;
  /** موقتاً غیرفعال (مثلاً سبد خالی)، ولی همچنان متعلق به این سند. */
  disabled?: boolean;
  /** در حال اجرا — دکمه قفل می‌شود. */
  pending?: boolean;
}

export type CommandMap = Partial<Record<CommandId, CommandBinding>>;

export interface DocumentShellProps {
  /** نامِ سند، مثل «فاکتور فروش». روی نوار وضعیت می‌نشیند. */
  title: string;
  /** شماره‌ی سند — خالی برای سندِ ثبت‌نشده. */
  number?: string | null;
  /** وضعیت خوانا: «پیش‌نویس»، «روی فاکتور ۱۰۲۳۹»، … */
  state?: string | null;
  /**
   * سندی که به یک فاکتورِ ثبت‌شده قفل است، همین نوار را کهربایی می‌کند.
   *
   * جای یک کادرِ هشدارِ جداگانه را می‌گیرد: آن کادر سه سطر ارتفاع می‌گرفت و
   * هر بار وسطِ صفحه می‌نشست، در حالی که تنها کاری که باید بکند این است که
   * از گوشه‌ی چشم بگوید «اینجا فروشِ عادی نیست».
   */
  tone?: "normal" | "warning";
  commands: CommandMap;
  /** تکه‌های نوار وضعیت (کاربر، انبار، تاریخ…). */
  status?: React.ReactNode;
  /** نوار پایین — کلیدهای مخصوصِ همین صفحه. */
  keystrip?: React.ReactNode;
  /**
   * وقتی false است، هیچ کلیدی گرفته نمی‌شود.
   *
   * لازم است چون صفحه‌ها پنجره‌های خودشان را دارند و کلیدِ سراسری نباید از
   * پشتِ یک پنجره‌ی باز شلیک کند.
   */
  keysEnabled?: boolean;
  children: React.ReactNode;
}

/**
 * پوسته‌ی مشترکِ همه‌ی سندها.
 *
 * چرا وجود دارد: تا حالا هر صفحه نوار دکمه‌ی خودش را می‌ساخت، با کلیدهای
 * خودش، و «چاپ» در فاکتور یک جا بود و در پیش‌فاکتور جای دیگر. این پوسته
 * جدولِ فرمان‌ها (`commands.ts`) را می‌گیرد و همه‌جا یک نوار می‌سازد؛ صفحه
 * فقط می‌گوید کدام فرمان چه‌کار می‌کند.
 */
export function DocumentShell({
  title,
  number,
  state,
  tone = "normal",
  commands,
  status,
  keystrip,
  keysEnabled = true,
  children,
}: DocumentShellProps) {
  /*
   * فرمان‌ها در یک ref آینه می‌شوند تا شنونده‌ی کلید فقط یک بار بسته شود.
   * بدون این، هر رندرِ صفحه‌ی فروش (که با هر حرفِ تایپ‌شده اتفاق می‌افتد)
   * شنونده را برمی‌داشت و دوباره می‌بست.
   */
  const ref = React.useRef(commands);
  // بعد از هر رندر تازه می‌شود؛ تا وقتی کاربر کلیدی بزند، مقدارِ روز است.
  React.useEffect(() => { ref.current = commands; });

  React.useEffect(() => {
    if (!keysEnabled) return;

    const onKey = (e: KeyboardEvent) => {
      const typing = isTyping(e.target);

      for (const spec of allCommands) {
        if (!spec.match(e)) continue;

        /*
         * کلیدِ تنها (Insert، Delete) وقتی مکان‌نما داخل یک خانه‌ی متنی است
         * نباید فرمانِ سند را بزند — Delete آنجا یعنی پاک‌کردنِ یک حرف، نه
         * حذفِ ردیفِ فاکتور. کلیدهای F و ترکیبی این محدودیت را ندارند: آن‌ها
         * در هیچ خانه‌ای معنای تایپی ندارند.
         */
        if (typing && !isSafeWhileTyping(e)) return;

        const b = ref.current[spec.id];
        /*
         * فرمانی که این سند ندارد، کلیدش هم نباید بگیرد — ولی جلوی مرورگر
         * را هم نمی‌گیریم. Ctrl+P روی صفحه‌ای که «چاپ» ندارد باید همان چاپِ
         * مرورگر باشد، نه هیچ‌کاری.
         */
        if (!b || b.disabled || b.pending) return;

        e.preventDefault();
        b.run();
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysEnabled]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        وضعیتِ سند روی همان سطرِ آیکن‌ها می‌نشیند، نه سطرِ جدا.
        دو نوارِ جدا ۲۲ پیکسل بیشتر می‌گرفتند — روی صفحه‌ی فروش یعنی نیم ردیف
        کالا، و هیچ‌کدام آن‌قدر محتوا نداشتند که سطرِ خودشان را پر کنند.
      */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-3 border-b",
          tone === "warning" && "border-warning/60 bg-warning/15",
        )}
      >
        <CommandBar commands={commands} />

        <div
          className={cn(
            "flex items-center gap-3 overflow-x-auto whitespace-nowrap pe-3 text-xs",
            tone === "warning" ? "text-warning" : "text-muted-foreground",
          )}
        >
          <span className={cn("font-bold", tone === "normal" && "text-foreground")}>
            {title}
          </span>
          {number ? (
            <span>
              شماره:{" "}
              <b className={cn("tabular-nums", tone === "normal" && "text-foreground")}>
                {number}
              </b>
            </span>
          ) : null}
          {state ? <span>{state}</span> : null}
          {status}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>

      {keystrip}
    </div>
  );
}

const allCommands = COMMAND_GROUPS.flatMap(commandsOf);

function CommandBar({ commands }: { commands: CommandMap }) {
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 overflow-x-auto px-2 py-1"
      role="toolbar"
      aria-label="فرمان‌های سند"
    >
      {COMMAND_GROUPS.map((group, i) => (
        <div key={group} role="group" aria-label={group} className="flex items-center gap-0.5">
          {/* فاصله‌ی گروه‌ها فقط یک خطِ نازک است — نه قاب، نه عنوان. */}
          {i > 0 && <span className="mx-1.5 h-5 w-px bg-border" aria-hidden />}
          {commandsOf(group).map((spec) => (
            <CommandButton
              key={spec.id}
              spec={spec}
              binding={commands[spec.id]}
              color={GROUP_COLOR[group]}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function CommandButton({
  spec,
  binding,
  color,
}: {
  spec: CommandSpec;
  binding?: CommandBinding;
  /** رنگِ گروه — چراییِ رنگی‌بودن کنار GROUP_COLOR نوشته شده. */
  color: string;
}) {
  // نبودنِ binding = این سند چنین فرمانی ندارد. دکمه می‌ماند، خاموش.
  const off = !binding || binding.disabled || binding.pending;
  const Icon = spec.icon;

  return (
    <button
      type="button"
      disabled={off}
      onClick={() => binding?.run()}
      title={`${binding?.label ?? spec.label} — ${spec.keyLabel}`}
      aria-label={binding?.label ?? spec.label}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-30",
        spec.primary
          ? "bg-primary text-primary-foreground enabled:hover:brightness-95"
          : cn(color, "enabled:hover:bg-accent/15"),
        // خاموش‌ها بی‌رنگ می‌شوند تا رنگ فقط یعنی «این در دسترس است».
        off && !spec.primary && "text-muted-foreground",
        spec.destructive && !spec.primary && "text-destructive/80 enabled:hover:text-destructive",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

/** مکان‌نما داخل یک خانه‌ی متنی است؟ */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

/** کلیدهایی که داخل خانه‌ی متنی هم بی‌خطرند: F1..F12 و هر ترکیبِ مُدیفایردار. */
function isSafeWhileTyping(e: KeyboardEvent): boolean {
  return /^F\d{1,2}$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey;
}
