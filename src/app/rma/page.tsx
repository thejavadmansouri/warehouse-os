import { requireCustomer } from "@/lib/server-account";
import { CustomerShell } from "@/components/customer-shell";
import { RmaView } from "./rma-view";

export const metadata = {
  title: "خدمات پس از فروش و مرجوعی قطعه (RMA) | کاردو B2B",
};

export default async function RmaPage() {
  const acc = await requireCustomer();

  return (
    <CustomerShell
      companyName={acc.customer.companyName}
      contactName={acc.customer.contactName}
      phone={acc.customer.phone}
      tierName={acc.customer.tier?.name}
      tierDiscount={acc.tierDiscount}
      wallet={acc.wallet}
      availableCredit={acc.availableCredit}
      active="rma"
    >
      <div className="mx-auto w-full max-w-4xl px-3 sm:px-6 py-6 pb-24">
        <header className="pb-4 border-b border-slate-200">
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            خدمات پس از فروش و مرجوعی قطعات (RMA)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            ثبت و پیگیری قطعات معیوب، مغایرت فاکتور، شکستگی در باربری و بازگشت وجه به کیف پول
          </p>
        </header>

        <RmaView />
      </div>
    </CustomerShell>
  );
}
