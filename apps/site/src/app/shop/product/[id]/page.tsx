import { ProductView } from "./product-view";

export default function ProductPage({ params }: { params: { id: string } }) {
  // key به‌ازای هر id سبب نوسازیِ کاملِ کامپوننت می‌شود؛ در غیر این صورت با
  // پیمایش بین کالاهای مرتبط، حالتِ تعداد/تصویرِ کالای قبلی می‌ماند.
  return <ProductView key={params.id} id={params.id} />;
}