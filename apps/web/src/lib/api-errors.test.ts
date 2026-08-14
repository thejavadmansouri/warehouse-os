import { afterEach, describe, expect, it, vi } from "vitest";

import { login } from "./api";
import { ApiException } from "./api-error-messages";

afterEach(() => vi.unstubAllGlobals());

/** پاسخِ ساختگی با همان شکلی که سرور واقعاً می‌دهد. */
function stubResponse(status: number, body: unknown, json = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (h: string) =>
          h.toLowerCase() === "content-type"
            ? json
              ? "application/json; charset=utf-8"
              : "text/plain"
            : null,
      },
      json: async () => body,
    }),
  );
}

async function loginError(): Promise<ApiException> {
  try {
    await login("someone", "secret");
  } catch (e) {
    return e as ApiException;
  }
  throw new Error("انتظار می‌رفت خطا پرتاب شود");
}

describe("نگاشت خطای سرور به پیام کاربر", () => {
  /*
   * باگی که واقعاً پیش آمد: قفلِ ورود ۴۲۹ می‌داد با بدنه‌ی **رشته‌ی خام**. کلاینت
   * دنبال `body.error` می‌گشت، روی رشته `undefined` می‌گرفت، پیام سرور را دور
   * می‌ریخت و «خطای غیرمنتظره» نشان می‌داد. کاربر پنج دقیقه قفل بود و فکر
   * می‌کرد رمزش کار نمی‌کند.
   */
  it("بدنه‌ی رشته‌ای ۴۲۹ — پیام خودِ سرور نشان داده می‌شود", async () => {
    stubResponse(429, "تلاش‌های ناموفقِ زیاد — ۵ دقیقه‌ی دیگر دوباره امتحان کنید.");
    const e = await loginError();

    expect(e.status).toBe(429);
    expect(e.message).toContain("تلاش‌های ناموفق");
    expect(e.message).not.toBe("خطای غیرمنتظره");
  });

  it("بدنه‌ی ساختارمند ۴۲۹ — کد و مدتِ انتظار حفظ می‌شود", async () => {
    stubResponse(429, {
      error: "TOO_MANY_ATTEMPTS",
      retryAfterSeconds: 240,
      message: "تلاش‌های ناموفقِ زیاد — ۴ دقیقه‌ی دیگر دوباره امتحان کنید.",
    });
    const e = await loginError();

    expect(e.code).toBe("TOO_MANY_ATTEMPTS");
    expect(e.raw.retryAfterSeconds).toBe(240);
    expect(e.message).toContain("۴ دقیقه");
  });

  it("۴۰۱ همچنان به پیامِ «نام کاربری یا رمز اشتباه» تبدیل می‌شود", async () => {
    stubResponse(401, {
      message: "نام کاربری یا رمز عبور اشتباه است.",
      error: "Unauthorized",
      statusCode: 401,
    });
    const e = await loginError();

    expect(e.status).toBe(401);
    expect(e.code).toBe("INVALID_CREDENTIALS");
  });

  it("آرایه‌ی خطاهای ValidationPipe دست‌نخورده به resolveApiError می‌رسد", async () => {
    stubResponse(400, {
      error: "Bad Request",
      message: ["amount must not be less than 1", "method must be one of..."],
      statusCode: 400,
    });
    const e = await loginError();

    expect(e.message).toContain("amount must not be less than 1");
    expect(e.message).toContain("؛");
  });

  it("بدنه‌ی غیرقابل‌خواندن → پیام پیش‌فرضِ همان وضعیت", async () => {
    stubResponse(503, null, false);
    const e = await loginError();

    expect(e.status).toBe(503);
    expect(e.message).toBe("خطای سمت سرور");
  });
});
