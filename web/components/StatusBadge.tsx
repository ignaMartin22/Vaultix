import { Badge } from "@/components/ui/Badge";
import { statusDisplay } from "@/lib/order-status";
import type { OrderStatus } from "@/lib/vaultix/contract";

/** The order's status with its fixed label and color (03 §3). */
export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const { label, color } = statusDisplay(status);
  return (
    <Badge tone={color} className={className}>
      {label}
    </Badge>
  );
}
