// وضعیت ارتباط با سرور API — یک منبع، تا هر جای پنل بتواند بپرسد.
import { create } from "zustand";

interface ConnectionState {
  /** آخرین درخواست به سرور رسید یا نه. */
  online: boolean;
  /** زمانی که ارتباط قطع شد — برای نشان‌دادن «از چه ساعتی». */
  since: number | null;
  setOnline: (online: boolean) => void;
}

/**
 * قطع‌شدن ارتباط با API.
 *
 * چرا لازم است: پنل همه‌ی داده‌اش را از API می‌گیرد. وقتی سرور خاموش باشد،
 * هر لیستی خالی می‌شود و صفحه دقیقاً شبیه «همه‌چیز پاک شد» به نظر می‌رسد —
 * که سه بار پیش آمد و هر بار ترسناک بود. این store فقط یک چیز را نگه می‌دارد:
 * آیا آخرین تلاش برای رسیدن به سرور موفق بود؟
 *
 * عمداً persist ندارد: وضعیت شبکه چیزی نیست که بین رفرش‌ها معنا داشته باشد.
 */
export const useConnectionStore = create<ConnectionState>((set, get) => ({
  online: true,
  since: null,
  setOnline: (online) => {
    // فقط هنگام *تغییر* وضعیت بنویس، وگرنه هر درخواست موفق یک رندر می‌سازد.
    if (get().online === online) return;
    set({ online, since: online ? null : Date.now() });
  },
}));
