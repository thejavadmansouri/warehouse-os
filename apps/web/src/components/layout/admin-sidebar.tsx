"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import {
  NAV_SECTIONS,
  filterNavByRole,
  type NavItem,
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
      href={item.href}
      title={collapsed ? item.title : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-2",
        isActive
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed ? <span className="truncate">{item.title}</span> : null}
    </Link>
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
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-sm">
          <Wrench className="h-5 w-5" />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-sidebar-foreground">
              انبار یدکی
            </p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">
              پنل مدیریت
            </p>
          </div>
        ) : null}
      </div>

      {/* ناوبری */}
      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="flex flex-col gap-5">
          {sections.map((section) => (
            <div key={section.title} className="flex flex-col gap-1">
              {!collapsed ? (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {section.title}
                </p>
              ) : (
                <div className="mx-auto my-1 h-px w-6 bg-sidebar-border" />
              )}
              {section.items.map((item) => (
                <div key={item.href} onClick={onNavigate}>
                  <NavLink
                    item={item}
                    collapsed={collapsed}
                    isActive={isActive(item.href)}
                  />
                </div>
              ))}
            </div>
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
