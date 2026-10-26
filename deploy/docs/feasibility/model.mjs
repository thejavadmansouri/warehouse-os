/**
 * مدل مالی طرح توجیهی کاردو — همهٔ اعداد سند از همین‌جا می‌آید.
 *
 * واحد: میلیون تومان، به قیمت ثابت سال پایه (بدون تورم).
 *
 * چرا «قیمت ثابت»: اگر تورم و رشد قیمت را هر دو وارد کنیم، خروجی زیبا می‌شود
 * ولی هیچ‌کس نمی‌تواند آن را کنترل کند. با قیمت ثابت، سودِ واقعی (قدرت خرید)
 * دیده می‌شود و اثر تورم در «نرخ تنزیل» و «نرخ سود تسهیلات» لحاظ شده است.
 *
 * اجرا: node deploy/docs/feasibility/model.mjs
 */

export const YEARS = [1406, 1407, 1408, 1409, 1410];

const NEW_A = [90, 150, 210, 255, 300]; // مشتری جدید تک‌شعبه
const NEW_B = [12, 20, 28, 34, 40]; // مشتری جدید چندشعبه/چندانباره
const CHURN_A = 0.12;
const CHURN_B = 0.06;

const PRICE_A = 42;
const PRICE_B = 118;
const IMPL_A = 9;
const IMPL_B = 35;
const SUPPORT_RATE = 0.15;
const PERPETUAL_PRICE = 220;
const PERPETUAL_COUNT = [6, 10, 14, 18, 20];
const COMMISSION_RATE = 0.08;

const HEADCOUNT = [8, 12, 18, 23, 27];
const COST_PER_FTE = [540, 570, 600, 630, 660];
const OFFICE = [420, 480, 560, 650, 720];
const LEGAL = [120, 150, 180, 210, 240];
const INFRA_RATE = 0.06;
const MARKETING_RATE = 0.18;
const SUPPORT_OPS_RATE = 0.05;

const CAPEX = {
  'تجهیزات رایانه‌ای و اداری تیم': 1600,
  'سرور و زیرساخت داخلی (محیط آزمون و دمو)': 700,
  'تجهیزات تست (گوشی، بارکدخوان، لیبل‌پرینتر)': 400,
  'تجهیزات اداری و تجهیز دفتر کار': 400,
  'دارایی نامشهود: سرمایه‌گذاری نرم‌افزاری محصول': 900,
};
const PRE_OP = {
  'ثبت شرکت، تغییرات اساسنامه و روزنامه رسمی': 40,
  'ثبت اثر نرم‌افزاری و تاییدیهٔ فنی': 90,
  'مشاورهٔ دانش‌بنیان، نظام‌نامه‌ها و مستندسازی': 120,
  'توسعهٔ بازار اولیه و نمایشگاه تخصصی': 200,
  'راه‌اندازی، آموزش و استقرار تیم': 80,
};
const DEPRECIATION_YEARS = 4;
const INTANGIBLE_YEARS = 5;
const LOAN = 4000;
const LOAN_RATE = 0.24;
const LOAN_YEARS = 4;
const LOAN_GRACE = 1;
const PAID_IN = 6000;
const DISCOUNT_RATE = 0.3;
const TAX_RATE = 0.25;
const AR_DAYS = 60;
const AP_DAYS = 35;

const sum = (a) => a.reduce((s, v) => s + v, 0);

/* ------------------------------ محاسبهٔ مدل ------------------------------ */

export function buildModel({
  revFactor = 1,
  payFactor = 1,
  taxExempt = true,
} = {}) {
  /* --- مشتریان و درآمد --- */
  const activeA = [];
  const activeB = [];
  let a = 0;
  let b = 0;
  for (let i = 0; i < YEARS.length; i++) {
    a = a * (1 - CHURN_A) + NEW_A[i] * revFactor;
    b = b * (1 - CHURN_B) + NEW_B[i] * revFactor;
    activeA.push(a);
    activeB.push(b);
  }
  const avgA = activeA.map((v, i) => (i === 0 ? v / 2 : (activeA[i - 1] + v) / 2));
  const avgB = activeB.map((v, i) => (i === 0 ? v / 2 : (activeB[i - 1] + v) / 2));

  const subA = avgA.map((n) => n * PRICE_A);
  const subB = avgB.map((n) => n * PRICE_B);
  const subscription = subA.map((v, i) => v + subB[i]);
  const support = subscription.map((v) => v * SUPPORT_RATE);
  const implementation = NEW_A.map(
    (n, i) => n * revFactor * IMPL_A + NEW_B[i] * revFactor * IMPL_B,
  );
  const perpetual = PERPETUAL_COUNT.map((n) => n * revFactor * PERPETUAL_PRICE);
  const revenue = subscription.map(
    (v, i) => v + support[i] + implementation[i] + perpetual[i],
  );

  /* --- هزینه‌ها --- */
  const payroll = HEADCOUNT.map((n, i) => n * COST_PER_FTE[i] * payFactor);
  const office = OFFICE.slice();
  const legal = LEGAL.slice();
  const infra = revenue.map((v) => v * INFRA_RATE);
  const marketing = revenue.map((v) => v * MARKETING_RATE);
  const commission = revenue.map((v) => v * COMMISSION_RATE);
  const supportOps = revenue.map((v) => v * SUPPORT_OPS_RATE);
  const cashOpex = revenue.map(
    (_, i) => payroll[i] + office[i] + legal[i] + infra[i] + marketing[i] + commission[i] + supportOps[i],
  );

  /* --- سرمایه‌گذاری و استهلاک --- */
  const capexTotal = sum(Object.values(CAPEX));
  const preOpTotal = sum(Object.values(PRE_OP));
  const intangible = CAPEX['دارایی نامشهود: سرمایه‌گذاری نرم‌افزاری محصول'];
  const depreciable = capexTotal - intangible;

  const depreciation = YEARS.map((_, i) => (i < DEPRECIATION_YEARS ? depreciable / DEPRECIATION_YEARS : 0));
  const accumulation = YEARS.map((_, i) => sum(depreciation.slice(0, i + 1)));
  const softAmort = YEARS.map((_, i) => (i < INTANGIBLE_YEARS ? intangible / INTANGIBLE_YEARS : 0));
  const softAccum = YEARS.map((_, i) => sum(softAmort.slice(0, i + 1)));
  const preOpExpense = YEARS.map((_, i) => (i === 0 ? preOpTotal : 0));

  const ebitda = revenue.map((v, i) => v - cashOpex[i] - preOpExpense[i]);
  const ebit = ebitda.map((v, i) => v - depreciation[i] - softAmort[i]);

  /* --- تسهیلات --- */
  const loanSchedule = [];
  let balance = LOAN;
  for (let i = 0; i < YEARS.length; i++) {
    const paying = i >= LOAN_GRACE && i < LOAN_GRACE + LOAN_YEARS;
    const principal = paying ? LOAN / LOAN_YEARS : 0;
    const interestPart = balance * LOAN_RATE;
    balance -= principal;
    loanSchedule.push({ principal, interest: interestPart, total: principal + interestPart, balance });
  }
  const interest = loanSchedule.map((r) => r.interest);

  const pbt = ebit.map((v, i) => v - interest[i]);
  const tax = pbt.map((v) => (taxExempt ? 0 : Math.max(0, v) * TAX_RATE));
  const netIncome = pbt.map((v, i) => v - tax[i]);

  /* --- جریان نقد و ترازنامه --- */
  const ar = revenue.map((v) => (v * AR_DAYS) / 365);
  const ap = cashOpex.map((v) => (v * AP_DAYS) / 365);
  const arChange = ar.map((v, i) => (i === 0 ? v : v - ar[i - 1]));
  const apChange = ap.map((v, i) => (i === 0 ? v : v - ap[i - 1]));

  const capexYear = YEARS.map((_, i) => (i === 0 ? capexTotal : 0));

  const cfo = netIncome.map(
    (v, i) => v + depreciation[i] + softAmort[i] - arChange[i] + apChange[i],
  );
  const cfi = capexYear.map((v) => -v);
  const cff = YEARS.map((_, i) => (i === 0 ? LOAN : 0) - loanSchedule[i].principal);

  const cash = [];
  let cashPrev = PAID_IN + LOAN - capexTotal;
  for (let i = 0; i < YEARS.length; i++) {
    const c = cashPrev + cfo[i] + cfi[i] + cff[i];
    cash.push(c);
    cashPrev = c;
  }

  const netFixed = YEARS.map((_, i) => depreciable - accumulation[i]);
  const netIntangible = YEARS.map((_, i) => intangible - softAccum[i]);
  const loanBalance = loanSchedule.map((r) => r.balance);
  const totalAssets = YEARS.map((_, i) => cash[i] + ar[i] + netFixed[i] + netIntangible[i]);
  const totalLiabilities = YEARS.map((_, i) => loanBalance[i] + ap[i]);
  const equity = YEARS.map((_, i) => totalAssets[i] - totalLiabilities[i]);
  const retained = equity.map((v) => v - PAID_IN);
  const nwc = YEARS.map((_, i) => ar[i] - ap[i]);

  /* جریان نقد آزاد پروژه (unlevered) و سهام‌دار (levered)
     مالیاتِ پروژه روی EBIT است، نه روی سود پس از بهره — وگرنه جریانِ آزاد
     پروژه به ساختار تأمین مالی وابسته می‌شد و مقایسهٔ سناریوها بی‌معنا. */
  const ebitTax = ebit.map((v) => (taxExempt ? 0 : Math.max(0, v) * TAX_RATE));
  const projectFcf = YEARS.map(
    (_, i) =>
      ebit[i] - ebitTax[i] + depreciation[i] + softAmort[i] - arChange[i] + apChange[i] - capexYear[i],
  );
  const equityFcf = YEARS.map(
    (_, i) =>
      projectFcf[i] - interest[i] * (1 - TAX_RATE) + (i === 0 ? LOAN : 0) - loanSchedule[i].principal,
  );

  const cumulativeFcf = [];
  let cum = 0;
  for (const v of projectFcf) {
    cum += v;
    cumulativeFcf.push(cum);
  }

  /* --- شاخص‌ها --- */
  const npv = (rate, flows) => flows.reduce((s, cf, i) => s + cf / Math.pow(1 + rate, i + 1), 0);
  const irr = (flows, lo = -0.95, hi = 5) => {
    let mid = 0;
    for (let k = 0; k < 300; k++) {
      mid = (lo + hi) / 2;
      if (npv(mid, flows) > 0) lo = mid;
      else hi = mid;
    }
    return mid;
  };
  const payback = (flows) => {
    let c = 0;
    for (let i = 0; i < flows.length; i++) {
      if (c + flows[i] >= 0) return i + Math.abs(c) / flows[i];
      c += flows[i];
    }
    return null;
  };

  const projectNpv = npv(DISCOUNT_RATE, projectFcf);
  const projectIrr = irr(projectFcf);
  const equityNpv = npv(DISCOUNT_RATE, equityFcf);
  const equityIrr = irr(equityFcf);
  const paybackProject = payback(projectFcf);
  const paybackEquity = payback(equityFcf);

  /* --- سربه‌سر --- */
  const fixedCosts = YEARS.map(
    (_, i) =>
      payroll[i] + office[i] + legal[i] + depreciation[i] + softAmort[i] + interest[i] + preOpExpense[i],
  );
  const variableRate = INFRA_RATE + MARKETING_RATE + COMMISSION_RATE + SUPPORT_OPS_RATE;
  const bepRevenue = fixedCosts.map((f) => f / (1 - variableRate));
  const bepCustomers = bepRevenue.map((r) => r / (PRICE_A * (1 + SUPPORT_RATE)));
  const marginOfSafety = revenue.map((r, i) => (r - bepRevenue[i]) / r);

  /* --- شاخص‌های SaaS --- */
  const arpu = revenue.map(
    (_, i) => (subscription[i] + support[i]) / (avgA[i] + avgB[i]),
  );
  const cac = YEARS.map(
    (_, i) => (marketing[i] + commission[i]) / (NEW_A[i] * revFactor + NEW_B[i] * revFactor),
  );
  const grossMargin = revenue.map((v, i) => (v - infra[i] - supportOps[i]) / v);
  const churnBlended = (CHURN_A * activeA[4] + CHURN_B * activeB[4]) / (activeA[4] + activeB[4]);
  const ltv = (arpu[0] * grossMargin[0]) / churnBlended;
  const ltvCac = ltv / cac[0];
  const cacPaybackMonths = (cac[0] / (arpu[0] * grossMargin[0])) * 12;

  /* --- نسبت‌های مالی --- */
  const currentRatio = YEARS.map(
    (_, i) => (cash[i] + ar[i]) / (ap[i] + loanSchedule[i].principal),
  );
  const debtRatio = YEARS.map((_, i) => totalLiabilities[i] / totalAssets[i]);
  const netMargin = netIncome.map((v, i) => v / revenue[i]);
  const roe = netIncome.map((v, i) => v / equity[i]);
  const dscr = YEARS.map((_, i) => {
    const debtService = loanSchedule[i].total;
    return debtService === 0
      ? null
      : (netIncome[i] + depreciation[i] + softAmort[i] + interest[i]) / debtService;
  });

  const revenueMix = {
    subA,
    subB,
    support,
    implementation,
    perpetual,
  };
  const costMix = { payroll, office, legal, infra, marketing, commission, supportOps };

  return {
    YEARS, NEW_A, NEW_B, CHURN_A, CHURN_B, PRICE_A, PRICE_B, IMPL_A, IMPL_B,
    SUPPORT_RATE, PERPETUAL_PRICE, PERPETUAL_COUNT, COMMISSION_RATE,
    activeA, activeB, avgA, avgB, subA, subB, subscription, support, implementation, perpetual, revenue,
    HEADCOUNT, COST_PER_FTE, payroll, infra, marketing, commission, supportOps, OFFICE, LEGAL, cashOpex,
    preOpExpense, ebitda, depreciation, softAmort, ebit, interest, pbt, tax, netIncome,
    CAPEX, PRE_OP, capexTotal, preOpTotal, depreciable, intangible,
    LOAN, LOAN_RATE, LOAN_YEARS, LOAN_GRACE, PAID_IN, DISCOUNT_RATE, TAX_RATE, taxExempt,
    loanSchedule, loanBalance, ar, ap, cfo, cfi, cff, cash, netFixed, netIntangible,
    totalAssets, totalLiabilities, equity, retained, nwc,
    projectFcf, equityFcf, cumulativeFcf, projectNpv, projectIrr, equityNpv, equityIrr,
    paybackProject, paybackEquity, fixedCosts, variableRate, bepRevenue, bepCustomers, marginOfSafety,
    arpu, cac, grossMargin, churnBlended, ltv, ltvCac, cacPaybackMonths,
    currentRatio, debtRatio, netMargin, roe, dscr, revenueMix, costMix,
    totals: {
      revenue: sum(revenue),
      ebitda: sum(ebitda),
      netIncome: sum(netIncome),
      projectFcf: sum(projectFcf),
      customersEnd: activeA[4] + activeB[4],
      newCustomers: sum(NEW_A) + sum(NEW_B),
      marketing: sum(marketing),
      payroll: sum(payroll),
    },
    factors: { revFactor, payFactor, taxExempt },
  };
}

export const model = buildModel();

/* ------------------------------ حساسیت ------------------------------ */

export const scenarios = [
  { label: 'پایه', m: model },
  { label: 'فروش ۲۰٪ کمتر', m: buildModel({ revFactor: 0.8 }) },
  { label: 'فروش ۲۰٪ بیشتر', m: buildModel({ revFactor: 1.2 }) },
  { label: 'حقوق ۲۰٪ بیشتر', m: buildModel({ payFactor: 1.2 }) },
  {
    label: 'فروش ۲۰٪ کمتر + حقوق ۲۰٪ بیشتر',
    m: buildModel({ revFactor: 0.8, payFactor: 1.2 }),
  },
  { label: 'بدون معافیت مالیاتی', m: buildModel({ taxExempt: false }) },
].map(({ label, m }) => ({
  label,
  npv: m.projectNpv,
  irr: m.projectIrr,
  payback: m.paybackProject,
  bepYear: m.marginOfSafety.findIndex((v) => v >= 0) + 1,
}));

/* ------------------------------ کنترل و چاپ خلاصه ------------------------------ */

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const f = (n) => Math.round(n).toLocaleString('en-US');
  console.log('سال        درآمد      EBITDA     سود خالص   FCF پروژه   نقد      حقوق صاحبان');
  YEARS.forEach((y, i) =>
    console.log(
      `${y} ${f(model.revenue[i]).padStart(11)} ${f(model.ebitda[i]).padStart(10)} ${f(model.netIncome[i]).padStart(10)} ${f(model.projectFcf[i]).padStart(11)} ${f(model.cash[i]).padStart(8)} ${f(model.equity[i]).padStart(10)}`,
    ),
  );
  console.log('\nمشتریان پایان سال A:', model.activeA.map(f).join(' / '));
  console.log('مشتریان پایان سال B:', model.activeB.map(f).join(' / '));
  console.log('جمع درآمد ۵ سال:', f(model.totals.revenue));
  console.log('NPV@30% پروژه:', f(model.projectNpv), 'IRR:', (model.projectIrr * 100).toFixed(1) + '%');
  console.log('NPV@30% سهام‌دار:', f(model.equityNpv), 'IRR:', (model.equityIrr * 100).toFixed(1) + '%');
  console.log('بازگشت پروژه:', model.paybackProject?.toFixed(2), 'سهام‌دار:', model.paybackEquity?.toFixed(2));
  console.log('سربه‌سر درآمد:', model.bepRevenue.map(f).join(' / '));
  console.log('حاشیه امنیت:', model.marginOfSafety.map((v) => (v * 100).toFixed(0) + '%').join(' / '));
  console.log('DSCR:', model.dscr.map((v) => (v === null ? '-' : v.toFixed(2))).join(' / '));
  console.log('ARPU/CAC/LTV:', f(model.arpu[0]), f(model.cac[0]), f(model.ltv), 'LTV/CAC', model.ltvCac.toFixed(2));
  console.log('سرمایه ثابت:', f(model.capexTotal), 'پیش از بهره‌برداری:', f(model.preOpTotal));
  console.log('اختلاف ترازنامه:', model.equity.map((v, i) => (v - (PAID_IN + sum(model.netIncome.slice(0, i + 1)))).toFixed(2)).join(' / '));
  console.log('\nحساسیت:');
  for (const s of scenarios) {
    console.log(`  ${s.label}: NPV ${f(s.npv)} | IRR ${(s.irr * 100).toFixed(1)}% | بازگشت ${s.payback?.toFixed(2)} | سربه‌سر سال ${s.bepYear}`);
  }
}
