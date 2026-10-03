/**
 * ایمپورت یک‌بارمصرفِ مشتریان از خروجی اکسل پارسیان (HESAB.xlsx).
 *
 * ستون‌های فایل: نام حساب، مانده حساب، تلفن، موبايل، کدکل.
 * فقط ردیف‌های «کدکل = 12» مشتری‌اند — بقیه (صندوق، بانک، تنخواه...) حساب‌های
 * داخلی حسابداری‌اند. از این ردیف‌ها هم بخشی اسمشان عدد یا تاریخ خام
 * پارسیان است (جای خالی/حذف‌شده در دفتر حساب)؛ آن‌ها فقط وقتی مانده‌ی
 * غیرصفر دارند با نامی مثل «حساب ناشناس (کد ۶۶۰۹)» وارد می‌شوند تا بدهیِ
 * واقعیِ پشتشان گم نشود.
 *
 * علامتِ «مانده حساب»: مثبت = بدهکارِ مشتری، دقیقاً هم‌جهت با قرارداد
 * CustomerLedger («مثبت = بدهی زیاد می‌شود» — ledger.service.ts). واحد ریال
 * است، هم‌جهت با schema.prisma روی ProductPrice.
 *
 *   npx ts-node prisma/import-customers-parsian.ts [path/to/HESAB.xlsx]           (پیش‌نمایش)
 *   npx ts-node prisma/import-customers-parsian.ts [path/to/HESAB.xlsx] --commit
 */
import { PrismaClient, LedgerEntryType, PhoneKind } from '@prisma/client';
import * as XLSX from 'xlsx';
import { normalizePersian } from '../src/engine/utils/persian-normalize';
import { normalizePhone, phoneKind } from '../src/common/phone.util';

const prisma = new PrismaClient();

const CUSTOMER_KODKOL = 12;
const DEFAULT_FILE = process.env.HOME + '/Downloads/HESAB.xlsx';

/**
 * حساب‌های تأمین‌کننده (بارز پخش، آریان خودرو، پارس سهند رادیاتور...) هم زیر
 * همون کدکل=۱۲ پارسیان قاطی مشتری‌های نهایی‌اند؛ فرقشون مقیاس مانده‌ست —
 * بدهیِ ما به تأمین‌کننده‌های عمده دو-سه رقم از بدهیِ مشتریِ نهایی بزرگ‌تره
 * و حتی از INT4 هم رد می‌زنه. سیستم فعلی مدل «تأمین‌کننده» ندارد، پس این
 * ردیف‌ها کلاً کنار گذاشته می‌شوند — تصمیمِ کاربر، نه فقط رفعِ خطای سرریز.
 */
const SUPPLIER_LIKE_THRESHOLD = 2_147_483_647; // INT4 max

interface RawRow {
  'نام حساب': string | number | undefined;
  'مانده حساب': number | undefined;
  'تلفن': string | number | undefined;
  'موبايل': string | number | undefined;
  'کدکل': number | undefined;
}

function isJunkName(name: string | number | undefined): boolean {
  if (name === undefined || name === null) return true;
  if (typeof name === 'number') return true;
  const t = name.trim();
  if (!t) return true;
  // تاریخِ خامِ پارسیان: 1399/02/13 یا 15/02/1399
  if (/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(t)) return true;
  // عددِ خالص که به‌عنوان متن ذخیره شده
  if (/^\d+$/.test(t)) return true;
  return false;
}

function buildSearchName(firstName: string): string {
  return normalizePersian(firstName).trim();
}

async function main() {
  const commit = process.argv.includes('--commit');
  const filePath = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) ?? DEFAULT_FILE;

  console.log(`خواندن ${filePath} ...`);
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: RawRow[] = XLSX.utils.sheet_to_json(sheet);

  const customerRows = rows.filter((r) => r['کدکل'] === CUSTOMER_KODKOL);

  const toImport: {
    name: string;
    balance: number;
    mobile: string | null;
    landline: string | null;
    junk: boolean;
  }[] = [];

  let skippedJunkZero = 0;
  const skippedSupplierLike: { name: string; balance: number }[] = [];

  for (const r of customerRows) {
    const rawName = r['نام حساب'];
    const balance = Math.round(Number(r['مانده حساب']) || 0);
    const junk = isJunkName(rawName);

    if (Math.abs(balance) > SUPPLIER_LIKE_THRESHOLD) {
      skippedSupplierLike.push({ name: String(rawName), balance });
      continue;
    }

    if (junk && balance === 0) {
      skippedJunkZero++;
      continue;
    }

    const name = junk
      ? `حساب ناشناس (کد ${rawName})`
      : String(rawName).trim();

    const mobile = normalizePhone(r['موبايل'] != null ? String(r['موبايل']) : null);
    const landline = normalizePhone(r['تلفن'] != null ? String(r['تلفن']) : null);

    toImport.push({ name, balance, mobile, landline, junk });
  }

  console.log(`ردیف‌های کدکل=۱۲: ${customerRows.length}`);
  console.log(`رد شده (بی‌نام/بی‌معنی با مانده صفر): ${skippedJunkZero}`);
  console.log(`رد شده (تأمین‌کننده‌ی احتمالی — مانده بیش از ${SUPPLIER_LIKE_THRESHOLD.toLocaleString('fa-IR')}): ${skippedSupplierLike.length}`);
  if (skippedSupplierLike.length) {
    for (const s of skippedSupplierLike) console.log(`  ${s.name}: ${s.balance.toLocaleString('fa-IR')}`);
  }
  console.log(`برای ایمپورت: ${toImport.length} (${toImport.filter((x) => x.junk).length} تاشون ناشناس با بدهیِ واقعی)`);

  // شماره‌های از قبل موجود در دیتابیس — تا با یکتاییِ سراسریِ CustomerPhone تصادم نکنیم.
  const existingPhones = new Set(
    (await prisma.customerPhone.findMany({ select: { phone: true } })).map((p) => p.phone),
  );

  const usedInBatch = new Set<string>();
  const skippedPhones: { customer: string; phone: string }[] = [];

  function claimPhone(phone: string | null): string | null {
    if (!phone) return null;
    if (existingPhones.has(phone) || usedInBatch.has(phone)) return null;
    usedInBatch.add(phone);
    return phone;
  }

  let created = 0;
  let withOpeningBalance = 0;

  for (const row of toImport) {
    const mobile = claimPhone(row.mobile);
    if (row.mobile && !mobile) skippedPhones.push({ customer: row.name, phone: row.mobile });

    const landline = claimPhone(row.landline);
    if (row.landline && !landline) skippedPhones.push({ customer: row.name, phone: row.landline });

    const phones: { phone: string; kind: PhoneKind; isPrimary: boolean }[] = [];
    if (mobile) phones.push({ phone: mobile, kind: phoneKind(mobile) as PhoneKind, isPrimary: true });
    if (landline) phones.push({ phone: landline, kind: phoneKind(landline) as PhoneKind, isPrimary: !mobile });

    if (commit) {
      const customer = await prisma.customer.create({
        data: {
          firstName: row.name,
          searchName: buildSearchName(row.name),
          note: row.junk ? 'ایمپورت از پارسیان — نام اصلی در فایل مبدا گم شده بود' : 'ایمپورت از پارسیان',
          phones: phones.length ? { create: phones } : undefined,
        },
      });

      if (row.balance !== 0) {
        await prisma.customerLedger.create({
          data: {
            customerId: customer.id,
            type: LedgerEntryType.OPENING,
            amount: row.balance,
            note: 'مانده‌ی اول دوره — ایمپورت از پارسیان',
          },
        });
        withOpeningBalance++;
      }
    }
    created++;
  }

  console.log('─'.repeat(70));
  console.log(`${commit ? '✓ ساخته شد' : 'ساخته می‌شود'}: ${created} مشتری، ${withOpeningBalance || toImport.filter((r) => r.balance !== 0).length} تا با مانده‌ی اول دوره`);
  if (skippedPhones.length) {
    console.log(`⚠ ${skippedPhones.length} شماره تلفن به‌خاطر تکراری‌بودن (سراسری) به هیچ مشتری وصل نشد:`);
    for (const s of skippedPhones.slice(0, 30)) console.log(`  ${s.customer}: ${s.phone}`);
    if (skippedPhones.length > 30) console.log(`  ... و ${skippedPhones.length - 30} مورد دیگر`);
  }
  console.log(commit ? '' : 'برای نوشتن در دیتابیس: --commit');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
