/*
 * زرین‌پال — API v4 (request / verify).
 *
 * حالت سندباکس تا وقتی ZARINPAL_SANDBOX=false نشود.
 * مبلغ همیشه «تومان» به این ماژول می‌رسد؛ به ریال اینجا تبدیل می‌شود.
 * در سندباکس، هر merchant_id معتبرِ ۳۶ کاراکتری کار می‌کند.
 */

const SANDBOX = process.env.ZARINPAL_SANDBOX !== "false";

const API_BASE = SANDBOX
  ? "https://sandbox.zarinpal.com/pg/v4"
  : "https://payment.zarinpal.com/pg/v4";

const START_PAY_BASE = SANDBOX
  ? "https://sandbox.zarinpal.com/pg/StartPay"
  : "https://payment.zarinpal.com/pg/StartPay";

const MERCHANT_ID =
  process.env.ZARINPAL_MERCHANT_ID || "00000000-0000-0000-0000-000000000000";

export type RequestResult =
  | { ok: true; authority: string; url: string }
  | { ok: false; code: number; message: string };

export async function zarinpalRequest(params: {
  amountToman: number;
  description: string;
  callbackUrl: string;
  mobile?: string;
}): Promise<RequestResult> {
  const amountRial = Math.round(params.amountToman) * 10;

  try {
    const res = await fetch(`${API_BASE}/payment/request.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: MERCHANT_ID,
        amount: amountRial,
        description: params.description,
        callback_url: params.callbackUrl,
        metadata: params.mobile ? { mobile: params.mobile } : undefined,
      }),
    });

    const json = (await res.json()) as {
      data?: { code?: number; authority?: string; message?: string };
      errors?: { code?: number; message?: string } | unknown[];
    };

    const code = json?.data?.code;

    // کد ۱۰۰ = موفق؛ ۱۰۱ = قبلاً ثبت شده (برای verify مهم است)
    if (code === 100 && json.data?.authority) {
      return {
        ok: true,
        authority: json.data.authority,
        url: `${START_PAY_BASE}/${json.data.authority}`,
      };
    }

    const errObj = Array.isArray(json.errors) ? undefined : json.errors;

    return {
      ok: false,
      code: errObj?.code ?? code ?? -1,
      message: errObj?.message ?? json?.data?.message ?? "درگاه پاسخ نامعتبر داد",
    };
  } catch {
    return { ok: false, code: -2, message: "ارتباط با درگاه برقرار نشد" };
  }
}

export type VerifyResult =
  | { ok: true; refId: string; cardPan?: string }
  | { ok: false; code: number; message: string };

export async function zarinpalVerify(params: {
  amountToman: number;
  authority: string;
}): Promise<VerifyResult> {
  const amountRial = Math.round(params.amountToman) * 10;

  try {
    const res = await fetch(`${API_BASE}/payment/verify.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: MERCHANT_ID,
        amount: amountRial,
        authority: params.authority,
      }),
    });

    const json = (await res.json()) as {
      data?: { code?: number; ref_id?: number; card_pan?: string; message?: string };
      errors?: { code?: number; message?: string } | unknown[];
    };

    const code = json?.data?.code;

    if (code === 100 || code === 101) {
      return {
        ok: true,
        refId: String(json.data?.ref_id ?? ""),
        cardPan: json.data?.card_pan,
      };
    }

    const errObj = Array.isArray(json.errors) ? undefined : json.errors;

    return {
      ok: false,
      code: errObj?.code ?? code ?? -1,
      message: errObj?.message ?? json?.data?.message ?? "پرداخت تأیید نشد",
    };
  } catch {
    return { ok: false, code: -2, message: "ارتباط با درگاه برقرار نشد" };
  }
}

export function zarinpalIsSandbox(): boolean {
  return SANDBOX;
}
