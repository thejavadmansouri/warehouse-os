"use client";

import { Menu, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

export function Header() {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur px-6 lg:pr-72">
      {/* دکمه منوی موبایل */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">باز کردن منو</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="p-0 w-64">
          <Sidebar />
        </SheetContent>
      </Sheet>

      {/* عنوان صفحه یا وضعیت */}
      <div className="flex-1">
        <span className="text-sm text-muted-foreground font-medium">
          وضعیت انبار: <span className="text-emerald-600 font-semibold">فعال / آنلاین</span>
        </span>
      </div>

      {/* اطلاعات کاربر */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <div className="h-8 w-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center">
            <User className="h-4 w-4" />
          </div>
          <span className="font-medium hidden sm:inline-block">مدیر سیستم</span>
        </div>
      </div>
    </header>
  );
}
