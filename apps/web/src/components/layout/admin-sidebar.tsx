"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronDown } from "lucide-react";
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

function NavLink({
  item,
  collapsed,
  isActive,
}: {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href ?? "#"}
      title={collapsed ? item.title : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-2",
        isActive
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed ? <span className="truncate">{item.title}</span> : null}
    </Link>
  );
}

/**
 * هابِ جمع‌شونده (فقط در حالتِ بازِ سایدبار). اگر یکی از فرزندان فعال باشد،
 * خودش را باز نگه می‌دارد تا کاربر همیشه بداند کجاست.
 */
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
  const [open, setOpen] = React.useState(anyActive);

  React.useEffect(() => {
    if (anyActive) setOpen(true);
  }, [anyActive]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          anyActive
            ? "text-sidebar-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="flex-1 truncate text-start">{item.title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        ) : (
          <ChevronLeft className="h-4 w-4 shrink-0 opacity-60" />
        )}
      </button>

      {open ? (
        <div className="mt-1 flex flex-col gap-1 border-s-2 border-sidebar-border ms-4 ps-2">
          {children.map((c) => (
            <div key={c.href ?? c.title} onClick={onNavigate}>
              <NavLink item={c} collapsed={false} isActive={c.href ? isActive(c.href) : false} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * یک آیتمِ ناوبری — برگ یا هاب. در حالتِ جمع‌شده‌ی سایدبار، هاب‌ها صاف می‌شوند
 * (فرزندان به‌صورت آیکنِ تنها) تا هیچ صفحه‌ای پشتِ یک هابِ بازنشدنی گم نشود.
 */
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
            <NavLink item={c} collapsed isActive={c.href ? isActive(c.href) : false} />
          </div>
        ))}
      </>
    );
  }

  return <NavGroup item={item} isActive={isActive} onNavigate={onNavigate} />;
}

/**
 * یک بخشِ سایدبار — سرتیترش جمع‌شونده است تا سایدبار به‌جای یک فهرستِ بلندِ
 * همیشه‌باز، چند سرتیترِ کوتاه باشد. پیش‌فرض فقط بخشی باز است که صفحه‌ی فعال
 * در آن است؛ رفتن به هر صفحه، بخشش را خودش باز می‌کند.
 */
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
      (it.children?.some((c) => (c.href ? isActive(c.href) : false)) ?? false)
  );
  const [open, setOpen] = React.useState(containsActive);

  React.useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);

  /*
   * بخشِ سنجاق‌شده سرتیتر ندارد و جمع نمی‌شود.
   *
   * کارهای هرروزه نباید پشتِ یک سرتیترِ دیگر باشند؛ سرتیتر برای چیزی است که
   * ماهی یک بار باز می‌شود. ردیف‌هایش هم بدونِ تورفتگی می‌آیند تا واقعاً «بالای»
   * منو دیده شوند، نه زیرمجموعه‌ی چیزی.
   */
  if (section.pinned) {
    return (
      <div className="flex flex-col gap-1">
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
      <div className="flex flex-col gap-1">
        <div className="mx-auto my-1 h-px w-6 bg-sidebar-border" />
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

  const SectionIcon = section.icon;

  return (
    <div className="flex flex-col gap-1">
      {/* سرتیترِ بخش هم‌زبانِ بقیه‌ی ردیف‌هاست: آیکن + متنِ ۱۴px + فلش — نه یک
          برچسبِ ریزِ متفاوت. تنها فرقش رنگِ کم‌رنگ‌ترِ متن است تا «گروه» بودنش
          خوانده شود. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <SectionIcon className="h-5 w-5 shrink-0" />
        <span className="flex-1 truncate text-start">{section.title}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 opacity-60 transition-transform", !open && "-rotate-90")}
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-1 border-s-2 border-sidebar-border ms-4 ps-2">
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
  const sections = filterNavByRole(NAV_SECTIONS, user?.role);

  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* لوگو / برند */}
      <div
        className={cn(
          "flex h-16 items-center gap-3 border-b border-sidebar-border px-4",
          collapsed && "justify-center px-2"
        )}
      >
        <img
          src="/logo.png"
          alt="کاردو"
          className="h-10 w-10 shrink-0 rounded-xl shadow-sm"
        />
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-sidebar-foreground">
              کاردو
            </p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">
              پنل مدیریت
            </p>
          </div>
        ) : null}
      </div>

      {/* ناوبری */}
      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="flex flex-col gap-3">
          {sections.map((section) => (
            <SidebarSection
              key={section.title}
              section={section}
              collapsed={collapsed}
              isActive={isActive}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </ScrollArea>

      {/* اطلاعات کاربر پایین */}
      {!collapsed && user ? (
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-md bg-sidebar-accent/50 p-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
              {user.fullName?.charAt(0) ?? user.username.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-sidebar-foreground">
                {user.fullName}
              </p>
              <p className="truncate text-[11px] text-sidebar-foreground/60">
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
      className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-muted"
      title={collapsed ? "باز کردن منو" : "جمع کردن منو"}
    >
      <ChevronLeft
        className={cn(
          "h-4 w-4 transition-transform",
          collapsed && "rotate-180"
        )}
      />
    </Button>
  );
}
