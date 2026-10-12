"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import {
  NAV_SECTIONS,
  filterNavByRole,
  type NavItem,
  type NavSection,
} from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ROLE_LABELS } from "@/lib/format";

/**
 * راست‌چینِ واقعیِ منوی راست (استاندارد رایج پنل فارسی):
 *
 * ردیف با `dir=ltr` + `justify-end` تا ترتیب «لوگو/آیکن ← متن» حفظ شود
 * و کل ردیف به لبه‌ی راست بچسبد — متن راست‌ترین عنصر است، لوگو دقیقاً قبلش.
 * نه اینکه با `dir=rtl` متن برود سمت چپِ آیکن.
 */

function NavLink({
  item,
  collapsed,
  isActive,
  nested,
}: {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
  nested?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href ?? "#"}
      title={collapsed ? item.title : undefined}
      dir="ltr"
      className={cn(
        "relative flex w-full items-center justify-end gap-2.5 rounded-lg text-sm font-medium transition-colors",
        collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
        nested && !collapsed && "py-1.5 text-[13px]",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
      )}
    >
      {/* نوار فعال روی لبه‌ی راست فیزیکی منو */}
      {isActive ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-1.5 right-0 w-[3px] rounded-full bg-sidebar-primary",
            collapsed && "inset-y-2",
          )}
        />
      ) : null}

      {/* dir=ltr + justify-end → [آیکن][متن] چسبیده به راست؛ متن راست‌ترین است */}
      <Icon
        className={cn(
          "size-[1.125rem] shrink-0",
          nested && "size-4 opacity-80",
          isActive && "text-sidebar-primary",
        )}
      />
      {!collapsed ? (
        <span
          className={cn(
            "min-w-0 truncate text-right",
            isActive && "font-semibold",
          )}
        >
          {item.title}
        </span>
      ) : null}
    </Link>
  );
}

function NavGroup({
  item,
  isActive,
  onNavigate,
}: {
  item: NavItem;
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const children = item.children ?? [];
  const anyActive = children.some((c) => c.href && isActive(c.href));
  const [open, setOpen] = React.useState(() => anyActive);

  React.useEffect(() => {
    if (anyActive) setOpen(true);
  }, [anyActive]);

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        dir="ltr"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-end gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          anyActive
            ? "bg-sidebar-accent/70 text-sidebar-accent-foreground"
            : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        {/* فلش سمت چپ ردیف؛ آیکن + عنوان چسبیده به راست */}
        <ChevronDown
          className={cn(
            "me-auto size-4 shrink-0 text-sidebar-foreground/45 transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
        <Icon className="size-[1.125rem] shrink-0" />
        <span className="min-w-0 truncate text-right">{item.title}</span>
      </button>

      {open ? (
        <div
          className="me-3 flex flex-col gap-0.5 border-r-2 border-sidebar-border pe-2"
          role="group"
          aria-label={item.title}
        >
          {children.map((c) => (
            <div key={c.href ?? c.title} onClick={onNavigate}>
              <NavLink
                item={c}
                collapsed={false}
                nested
                isActive={c.href ? isActive(c.href) : false}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NavTree({
  item,
  collapsed,
  isActive,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  if (!item.children) {
    return (
      <div onClick={onNavigate}>
        <NavLink
          item={item}
          collapsed={collapsed}
          isActive={item.href ? isActive(item.href) : false}
        />
      </div>
    );
  }

  if (collapsed) {
    return (
      <>
        {item.children.map((c) => (
          <div key={c.href ?? c.title} onClick={onNavigate}>
            <NavLink
              item={c}
              collapsed
              isActive={c.href ? isActive(c.href) : false}
            />
          </div>
        ))}
      </>
    );
  }

  return <NavGroup item={item} isActive={isActive} onNavigate={onNavigate} />;
}

function SidebarSection({
  section,
  collapsed,
  isActive,
  onNavigate,
}: {
  section: NavSection;
  collapsed: boolean;
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  const containsActive = section.items.some(
    (it) =>
      (it.href ? isActive(it.href) : false) ||
      (it.children?.some((c) => (c.href ? isActive(c.href) : false)) ?? false),
  );
  const [open, setOpen] = React.useState(true);

  React.useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);

  if (section.pinned) {
    return (
      <div className="flex flex-col gap-0.5">
        {section.items.map((item) => (
          <NavTree
            key={item.href ?? item.title}
            item={item}
            collapsed={collapsed}
            isActive={isActive}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="mx-auto my-1.5 h-px w-8 bg-sidebar-border" />
        {section.items.map((item) => (
          <NavTree
            key={item.href ?? item.title}
            item={item}
            collapsed
            isActive={isActive}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        dir="ltr"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-end gap-2 px-3 pb-1 pt-2"
      >
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-sidebar-foreground/35 transition-transform duration-200 me-auto",
            !open && "-rotate-90",
          )}
        />
        <span className="text-[11px] font-semibold tracking-wide text-sidebar-foreground/45">
          {section.title}
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-0.5">
          {section.items.map((item) => (
            <NavTree
              key={item.href ?? item.title}
              item={item}
              collapsed={false}
              isActive={isActive}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminSidebar({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const sections = filterNavByRole(NAV_SECTIONS, user?.role, user?.canManageSite);

  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/*
        برند: متن راست‌ترین، لوگو دقیقاً قبلش (چپِ متن).
        dir=ltr + justify-end → [لوگو][کاردو] چسبیده به راست.
      */}
      <div
        dir="ltr"
        className={cn(
          "flex h-14 shrink-0 items-center justify-end gap-3 border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <img
          src="/logo.png"
          alt="کاردو"
          className="size-9 shrink-0 rounded-lg shadow-sm"
        />
        {!collapsed ? (
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-bold leading-tight text-sidebar-foreground">
              کاردو
            </p>
            <p className="truncate text-[11px] text-sidebar-foreground/55">
              پنل مدیریت
            </p>
          </div>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-3 px-2.5 py-3" aria-label="منوی اصلی">
          {sections.map((section, index) => (
            <SidebarSection
              key={`${section.title || "pinned"}-${index}`}
              section={section}
              collapsed={collapsed}
              isActive={isActive}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </ScrollArea>

      {!collapsed && user ? (
        <div className="shrink-0 border-t border-sidebar-border p-2.5">
          <div
            dir="ltr"
            className="flex items-center justify-end gap-2.5 rounded-lg bg-sidebar-accent/60 px-2.5 py-2"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
              {(user.fullName ?? user.username).charAt(0)}
            </div>
            <div className="min-w-0 text-right">
              <p className="truncate text-xs font-semibold text-sidebar-foreground">
                {user.fullName}
              </p>
              <p className="truncate text-[11px] text-sidebar-foreground/55">
                {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SidebarCollapseToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className="size-8 shrink-0 rounded-md text-muted-foreground hover:bg-muted"
      title={collapsed ? "باز کردن منو" : "جمع کردن منو"}
    >
      {collapsed ? (
        <ChevronLeft className="size-4" />
      ) : (
        <ChevronRight className="size-4" />
      )}
    </Button>
  );
}
