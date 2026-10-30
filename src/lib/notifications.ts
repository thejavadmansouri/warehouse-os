import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";

/**
 * سیستم هوشمند اعلان‌ها و پیامک‌های باربری و مالی کاردو B2B در استان کرمان
 */
export interface SendNotificationParams {
  customerId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  sendSms?: boolean;
  smsRecipientPhone?: string;
}

export async function createNotification(params: SendNotificationParams) {
  const { customerId, type, title, message, link, sendSms = true, smsRecipientPhone } = params;

  let phone = smsRecipientPhone;
  if (!phone) {
    const cust = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { phone: true },
    });
    phone = cust?.phone;
  }

  let smsSent = false;
  if (sendSms && phone) {
    smsSent = await dispatchSms({
      phone,
      message,
      type,
    });
  }

  const notification = await prisma.notification.create({
    data: {
      customerId,
      type,
      title,
      message,
      link,
      smsSent,
    },
  });

  return notification;
}

/**
 * شبیه‌ساز و درگاه ارسال پیامک (الگوهای خدماتی کاوه‌نگار / فراپیامک برای استان کرمان)
 */
async function dispatchSms(params: { phone: string; message: string; type: NotificationType }): Promise<boolean> {
  const { phone, message, type } = params;
  console.log(`[SMS-SERVICE] 📨 Dispatching B2B SMS to ${phone} [${type}]:\n"${message}"`);

  // در محیط عملیاتی به Kavenegar یا فراپیامک متصل می‌شود:
  // const kavenegarApiKey = process.env.KAVENEGAR_API_KEY;
  // if (kavenegarApiKey) { ... }

  return true;
}

/**
 * پیامک بیجک باربری استان کرمان
 */
export async function notifyBijakIssued(params: {
  customerId: string;
  orderNumber: string;
  carrierName: string;
  waybillNumber: string;
  destinationCity: string;
}) {
  const { customerId, orderNumber, carrierName, waybillNumber, destinationCity } = params;
  const title = `بیجک باربری صادر شد (${carrierName})`;
  const message = `همکار گرامی، سفارش ${orderNumber} به مقصد ${destinationCity} تحویل ${carrierName} گردید.\nشماره بیجک: ${waybillNumber}\nسامانه کاردو B2B دیار کریمان`;

  return createNotification({
    customerId,
    type: "BIJAK_ISSUED",
    title,
    message,
    link: `/orders`,
    sendSms: true,
  });
}

/**
 * پیامک و نوتیفیکیشن تغییر وضعیت چک صیادی
 */
export async function notifyChequeStatus(params: {
  customerId: string;
  sayadId: string;
  status: "PASSED" | "BOUNCED" | "RECEIVED";
  amountToman: number;
}) {
  const { customerId, sayadId, status, amountToman } = params;
  let title = "بروزرسانی وضعیت چک صیادی";
  let message = "";

  if (status === "PASSED") {
    title = "چک صیادی تأیید و سقف اعتبار شارژ شد";
    message = `چک صیادی به شناسه ${sayadId} به مبلغ ${amountToman.toLocaleString("fa-IR")} تومان تأیید و خط اعتبار شما شارژ گردید.`;
  } else if (status === "BOUNCED") {
    title = "هشدار نکول و برگشت چک صیادی";
    message = `چک صیادی به شناسه ${sayadId} نکول/برگشت خورده است. حساب شما موقتاً به وضعیت تعلیق تغییر یافت.`;
  } else {
    title = "دریافت چک صیادی در سامانه";
    message = `چک صیادی به شناسه ${sayadId} دریافت و در صف بررسی واحد مالی کاردو قرار گرفت.`;
  }

  return createNotification({
    customerId,
    type: "CHEQUE_STATUS",
    title,
    message,
    link: `/cheques`,
    sendSms: true,
  });
}
