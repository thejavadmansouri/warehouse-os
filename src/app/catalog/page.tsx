import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { requireCustomer } from "@/lib/server-account";
import { CustomerShell } from "@/components/customer-shell";
import { AdminShell } from "@/components/admin/admin-shell";
import { CatalogBrowser } from "./catalog-browser";
import { prisma } from "@/lib/prisma";
import { mapCatalog } from "@/lib/catalog";

export const instant = false;

/*
 * کاتالوگ — رندر اولیه سمت سرور تا اولین قاب خالی نباشد.
 * فیلترها بعد از تایپ از API به‌روز می‌شوند.
 * هم برای خریداران با CustomerShell و هم برای مدیران با AdminShell در دسترس است.
 */
export default async function CatalogPage() {
  await connection();

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    redirect("/login?next=/catalog");
  }

  const isAdmin = session.role === "admin";
  let adminInfo: any = null;
  let customerAcc: any = null;

  if (isAdmin) {
    adminInfo = await prisma.adminUser.findUnique({
      where: { id: session.sub },
      select: { id: true, username: true, name: true, role: true },
    });
    if (!adminInfo) redirect("/login");
  } else {
    customerAcc = await requireCustomer();
  }

  const [products, shipping] = await Promise.all([
    prisma.product.findMany({
      where: isAdmin ? undefined : { isActive: true },
      include: { volumePrices: { orderBy: { qtyFrom: "asc" } } },
      orderBy: [{ brand: "asc" }, { category: "asc" }, { name: "asc" }],
      take: 200,
    }),
    prisma.shippingMethod.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const initialItems = mapCatalog(
    products,
    {
      tierDiscountPercent: customerAcc ? customerAcc.tierDiscount : 0,
      customerDiscountPercent: customerAcc ? customerAcc.customerDiscount : 0,
    },
    isAdmin || customerAcc?.customer.status === "ACTIVE",
  );

  const browserContent = (
    <CatalogBrowser
      initialItems={initialItems}
      canOrder={isAdmin || customerAcc?.customer.status === "ACTIVE"}
      wallet={customerAcc?.wallet ?? 0}
      availableCredit={customerAcc?.availableCredit ?? 0}
      creditLimit={customerAcc?.creditLimit ?? 0}
      tierDiscount={customerAcc?.tierDiscount ?? 0}
      customerDiscount={customerAcc?.customerDiscount ?? 0}
      shipping={shipping.map((s) => ({
        id: s.id,
        name: s.name,
        cost: Number(s.cost),
        freeAbove: s.freeAbove ? Number(s.freeAbove) : null,
        note: s.note,
      }))}
    />
  );

  if (isAdmin && adminInfo) {
    return (
      <AdminShell admin={adminInfo}>
        <div className="max-w-6xl mx-auto px-4 py-6">{browserContent}</div>
      </AdminShell>
    );
  }

  return (
    <CustomerShell
      companyName={customerAcc.customer.companyName}
      contactName={customerAcc.customer.contactName}
      phone={customerAcc.customer.phone}
      tierName={customerAcc.customer.tier?.name}
      tierDiscount={customerAcc.tierDiscount}
      wallet={customerAcc.wallet}
      availableCredit={customerAcc.availableCredit}
      active="catalog"
    >
      {browserContent}
    </CustomerShell>
  );
}
