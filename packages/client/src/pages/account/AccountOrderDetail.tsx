import { useState } from "react";
import { useParams } from "react-router-dom";
import { OrderSummaryCard } from "@/components/orders/OrderSummaryCard";
import { PayNowButton } from "@/components/orders/PayNowButton";
import { TransferInstructionsCard } from "@/components/orders/TransferInstructionsCard";
import { Spinner } from "@/components/ui/Spinner";
import { useMyOrder } from "@/hooks/useMyOrder";
import NotFound from "../NotFound";

export default function AccountOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { order, isLoading, error } = useMyOrder(id);
  const [localOrder, setLocalOrder] = useState(order);

  const current = localOrder ?? order;

  if (isLoading) return <Spinner label="Buscando tu pedido…" />;
  if (error || !current) return <NotFound />;

  const isTransfer = current.paymentMethod === "transfer";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-text">Pedido #{current.orderNumber}</h1>
      {current.status === "pending" && !isTransfer && <PayNowButton orderId={current._id} />}
      <OrderSummaryCard order={current} />
      {isTransfer && <TransferInstructionsCard order={current} onOrderChange={setLocalOrder} />}
    </div>
  );
}
