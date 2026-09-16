import { OrderDetailView } from "./order-detail-view";

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  return <OrderDetailView id={params.id} />;
}