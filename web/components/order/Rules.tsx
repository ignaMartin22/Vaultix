import { RulesSummary } from "@/components/RulesSummary";
import type { OrderAccount } from "@/lib/vaultix/contract";

/**
 * Rules before paying (03 §5.3), from the order's own snapshot: what the buyer
 * sees is what the order enforces, even if the config changes later.
 */
export function Rules({ order, role }: { order: OrderAccount; role: "seller" | "buyer" }) {
  return (
    <RulesSummary
      role={role}
      amount={order.amount}
      feeBps={order.feeBps}
      disputeDepositBps={order.disputeDepositBps}
      shipDeadlineSecs={order.shipDeadlineSecs}
      claimWindowSecs={order.claimWindowSecs}
    />
  );
}
