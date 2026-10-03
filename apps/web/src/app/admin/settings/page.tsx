"use client";

/**
 * تنظیمات — کاربران، مشخصات مغازه، ورود اکسل، پشتیبان‌گیری، مانیتور صوتی و قالب‌های پیامک.
 *
 * شش صفحه که هیچ‌کدام «جایی که کار روزمره در آن انجام می‌شود» نیستند. مثل هر
 * برنامه‌ی دیگری، جایشان یک صفحه‌ی تنظیمات با چند تب است، نه پنج ردیف در منو.
 *
 * ⚠️ نقش‌ها حالا روی **تب** می‌نشینند نه روی آیتمِ منو. تبی که کاربر اجازه‌اش
 * را ندارد اصلاً رندر نمی‌شود — نه اینکه رندر شود و خالی بماند، چون آن حالت
 * شبیهِ خرابیِ برنامه به نظر می‌رسد.
 */

import * as React from "react";
import { Settings } from "lucide-react";

import { useAuthStore } from "@/lib/auth-store";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { UsersPanel } from "../users/page";
import { ShopSettingsPanel } from "../shop-settings/page";
import { ImportsPanel } from "../imports/page";
import { BackupsPanel } from "../backups/page";
import { VoiceInputPanel } from "../voice-input/page";
import { SmsTemplatesPanel } from "../sms-templates/page";

export default function SettingsPage() {
  const hasRole = useAuthStore((s) => s.hasRole);
  const isAdmin = hasRole("ADMIN");
  const isManager = hasRole("ADMIN", "MANAGER");

  // اولین تبی که این کاربر حق دیدنش را دارد — وگرنه صفحه با تبِ خالی باز می‌شود.
  const first = isAdmin ? "users" : isManager ? "imports" : "voice";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="تنظیمات"
        description="کاربران، مشخصات مغازه، ورود اطلاعات، پشتیبان‌گیری و پیامک"
        icon={Settings}
      />

      <Tabs defaultValue={first}>
        <TabsList>
          {isAdmin && <TabsTrigger value="users">کاربران</TabsTrigger>}
          {isAdmin && <TabsTrigger value="shop">مشخصات مغازه</TabsTrigger>}
          {isManager && <TabsTrigger value="imports">ورود اکسل</TabsTrigger>}
          {isAdmin && <TabsTrigger value="backups">پشتیبان‌گیری</TabsTrigger>}
          {isManager && <TabsTrigger value="voice">مانیتور صوتی</TabsTrigger>}
          {isManager && <TabsTrigger value="sms">قالب‌های پیامک</TabsTrigger>}
        </TabsList>

        {isAdmin && (
          <TabsContent value="users" className="mt-4">
            <UsersPanel embedded />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="shop" className="mt-4">
            <ShopSettingsPanel embedded />
          </TabsContent>
        )}
        {isManager && (
          <TabsContent value="imports" className="mt-4">
            <ImportsPanel embedded />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="backups" className="mt-4">
            <BackupsPanel embedded />
          </TabsContent>
        )}
        {isManager && (
          <TabsContent value="voice" className="mt-4">
            <VoiceInputPanel embedded />
          </TabsContent>
        )}
        {isManager && (
          <TabsContent value="sms" className="mt-4">
            <SmsTemplatesPanel embedded />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
