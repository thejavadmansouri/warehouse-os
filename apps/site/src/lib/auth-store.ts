// استورِ احراز هویتِ مدیرِ سایت — جدا از پنلِ انبار.
//
// عمداً کلیدِ persist متفاوتی دارد (`site-admin-auth`) تا اگر هر دو اپ روی یک
// دامنه اجرا شوند، لاگینِ یکی لاگینِ دیگری را پاک نکند.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Role, User } from "./types";

interface SiteAuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  updateUser: (user: Partial<User>) => void;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

export const useSiteAuthStore = create<SiteAuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      updateUser: (user) =>
        set((s) => (s.user ? { user: { ...s.user, ...user } } : s)),
      logout: () => set({ token: null, user: null }),
      hasRole: (...roles) => {
        const u = get().user;
        return !!u && roles.includes(u.role);
      },
    }),
    {
      name: "site-admin-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ token: s.token, user: s.user }),
    }
  )
);
