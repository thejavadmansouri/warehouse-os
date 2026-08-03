"use client";

// طبق بخش ۶.۱۰ — مدیریت کاربران (فقط ADMIN)
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users as UsersIcon, UserPlus, KeyRound, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import {
  getUsers,
  createUser,
  updateUserRole,
  updateUserPassword,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ApiException } from "@/lib/api-error-messages";
import { PageHeader } from "@/components/page-header";
import { LoadingState, EmptyState, ErrorState } from "@/components/states";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS } from "@/lib/format";
import type { User, Role, CreateUserDto } from "@/lib/types";

const ROLE_OPTIONS: Role[] = ["ADMIN", "MANAGER", "STAFF", "SALES"];

const ROLE_BADGE_CLASS: Record<Role, string> = {
  ADMIN: "bg-rose-100 text-rose-700",
  MANAGER: "bg-amber-100 text-amber-700",
  STAFF: "bg-emerald-100 text-emerald-700",
  SALES: "bg-sky-100 text-sky-700",
};

export default function UsersPage() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const qc = useQueryClient();

  // طبق بخش ۶.۱۰ — GET /users
  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: () => getUsers(),
  });

  // ----- state دیالوگ‌ها -----
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState<CreateUserDto>({
    username: "",
    password: "",
    fullName: "",
    role: "STAFF",
  });

  // دیالوگ تغییر نقش
  const [roleTarget, setRoleTarget] = React.useState<User | null>(null);
  const [roleValue, setRoleValue] = React.useState<Role>("STAFF");

  // دیالوگ بازنشانی رمز
  const [pwdTarget, setPwdTarget] = React.useState<User | null>(null);
  const [pwdValue, setPwdValue] = React.useState("");

  // ----- mutations -----

  // طبق بخش ۶.۱۰ — POST /users
  const createMut = useMutation({
    mutationFn: () => createUser(createForm),
    onSuccess: () => {
      toast({ title: "کاربر ساخته شد" });
      qc.invalidateQueries({ queryKey: ["users"] });
      setCreateOpen(false);
      setCreateForm({ username: "", password: "", fullName: "", role: "STAFF" });
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiException ? e.message : "خطا در ساخت کاربر";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  // طبق بخش ۶.۱۰ — PATCH /users/:id/role
  const roleMut = useMutation({
    mutationFn: () => updateUserRole(roleTarget!.id, { role: roleValue }),
    onSuccess: () => {
      toast({ title: "نقش به‌روزرسانی شد" });
      qc.invalidateQueries({ queryKey: ["users"] });
      setRoleTarget(null);
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiException ? e.message : "خطا در تغییر نقش";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  // طبق بخش ۶.۱۰ — PATCH /users/:id/password
  const pwdMut = useMutation({
    mutationFn: () => updateUserPassword(pwdTarget!.id, { password: pwdValue }),
    onSuccess: () => {
      toast({ title: "رمز عبور بازنشانی شد" });
      setPwdTarget(null);
      setPwdValue("");
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiException ? e.message : "خطا در بازنشانی رمز";
      toast({ variant: "destructive", title: "خطا", description: msg });
    },
  });

  // محافظت نقش — فقط ADMIN (پس از تمام hookها)
  if (user && user.role !== "ADMIN") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Card className="max-w-md border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldCheck className="h-5 w-5" />
              دسترسی غیرمجاز
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              این صفحه فقط برای نقش «مدیر کل» (ADMIN) قابل دسترس است.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="کاربران"
        description="مدیریت کاربران سیستم و نقش‌ها"
        icon={UsersIcon}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            کاربر جدید
          </Button>
        }
      />

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {usersQ.isLoading ? (
            <LoadingState />
          ) : usersQ.isError ? (
            <ErrorState
              message="بارگذاری کاربران ناموفق بود"
              onRetry={() => usersQ.refetch()}
            />
          ) : !usersQ.data?.length ? (
            <EmptyState
              title="کاربری ثبت نشده"
              description="برای شروع، اولین کاربر را بسازید."
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <UserPlus className="h-4 w-4" />
                  کاربر جدید
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام کامل</TableHead>
                  <TableHead>نام کاربری</TableHead>
                  <TableHead>نقش</TableHead>
                  <TableHead className="text-end">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQ.data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.fullName}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {u.username}
                    </TableCell>
                    <TableCell>
                      <Badge className={ROLE_BADGE_CLASS[u.role]}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRoleTarget(u);
                            setRoleValue(u.role);
                          }}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          تغییر نقش
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPwdTarget(u);
                            setPwdValue("");
                          }}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          بازنشانی رمز
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* دیالوگ کاربر جدید */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>کاربر جدید</DialogTitle>
            <DialogDescription>
              فرم زیر را برای ساخت کاربر جدید پر کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="u-fullname">نام کامل *</Label>
              <Input
                id="u-fullname"
                value={createForm.fullName}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, fullName: e.target.value }))
                }
                placeholder="مثلاً علی رضایی"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="u-username">نام کاربری *</Label>
              <Input
                id="u-username"
                value={createForm.username}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, username: e.target.value }))
                }
                placeholder="مثلاً ali.r"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="u-password">رمز عبور *</Label>
              <Input
                id="u-password"
                type="password"
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, password: e.target.value }))
                }
                placeholder="حداقل ۶ کاراکتر"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>نقش *</Label>
              <Select
                value={createForm.role}
                onValueChange={(v: Role) =>
                  setCreateForm((f) => ({ ...f, role: v }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="انتخاب نقش" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMut.isPending}
            >
              انصراف
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={
                createMut.isPending ||
                !createForm.username.trim() ||
                !createForm.password.trim() ||
                !createForm.fullName.trim()
              }
            >
              {createMut.isPending ? "در حال ساخت..." : "ساخت کاربر"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ تغییر نقش */}
      <Dialog
        open={!!roleTarget}
        onOpenChange={(o) => !o && setRoleTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تغییر نقش کاربر</DialogTitle>
            <DialogDescription>
              نقش جدید را برای «{roleTarget?.fullName}» انتخاب کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label>نقش</Label>
            <Select
              value={roleValue}
              onValueChange={(v: Role) => setRoleValue(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRoleTarget(null)}
              disabled={roleMut.isPending}
            >
              انصراف
            </Button>
            <Button
              onClick={() => roleMut.mutate()}
              disabled={roleMut.isPending || roleValue === roleTarget?.role}
            >
              {roleMut.isPending ? "در حال ذخیره..." : "ذخیره"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ بازنشانی رمز */}
      <Dialog
        open={!!pwdTarget}
        onOpenChange={(o) => !o && setPwdTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>بازنشانی رمز عبور</DialogTitle>
            <DialogDescription>
              رمز عبور جدید را برای «{pwdTarget?.fullName}» وارد کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-pwd">رمز جدید *</Label>
            <Input
              id="new-pwd"
              type="password"
              value={pwdValue}
              onChange={(e) => setPwdValue(e.target.value)}
              placeholder="حداقل ۶ کاراکتر"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPwdTarget(null)}
              disabled={pwdMut.isPending}
            >
              انصراف
            </Button>
            <Button
              onClick={() => pwdMut.mutate()}
              disabled={pwdMut.isPending || pwdValue.trim().length < 6}
            >
              {pwdMut.isPending ? "در حال ذخیره..." : "بازنشانی رمز"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
