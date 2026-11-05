"use client";

import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { useParams } from "next/navigation";

import { TxButton } from "@/components/TxButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/lib/auth/session";
import { getListingByOrder } from "@/lib/listings-client";
import { whatsappUrl } from "@/lib/sell";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";
import { getVaultixClient, isMockClient } from "@/lib/vaultix/client";
import { FINAL_STATUSES, type OrderAccount } from "@/lib/vaultix/contract";

import { BuyerActions } from "./BuyerActions";
import { OrderHeader } from "./OrderHeader";
import { OutcomeCard, type Resolution } from "./OutcomeCard";
import { PayFlow } from "./PayFlow";
import { Rules } from "./Rules";
import { SellerActions } from "./SellerActions";

/** The dispute split, from the DisputeResolved event (only the mock has events client-side for now). */
function resolutionOf(orderPda: string): Resolution | null {
  const client = getVaultixClient();
  if (!isMockClient(client)) return null;
  const event = client.events.find((e) => e.name === "DisputeResolved" && e.order.toBase58() === orderPda);
  return event && event.name === "DisputeResolved"
    ? { buyerAmount: event.buyerAmount, sellerAmount: event.sellerAmount, fee: event.fee }
    : null;
}

function AfterPayment({
  orderPda,
  order,
  isSeller,
  isBuyer,
}: {
  orderPda: string;
  order: OrderAccount;
  isSeller: boolean;
  isBuyer: boolean;
}) {
  if (FINAL_STATUSES.includes(order.status)) {
    return (
      <OutcomeCard
        order={order}
        role={isSeller ? "seller" : isBuyer ? "buyer" : "other"}
        resolution={order.status === "Resolved" ? resolutionOf(orderPda) : null}
      />
    );
  }
  if (isSeller) return <SellerActions orderPda={orderPda} order={order} />;
  if (isBuyer) return <BuyerActions orderPda={orderPda} order={order} />;
  // Third parties see only the status and the seal (03 §5.3).
  return <Card className="text-body text-bone">Este link ya fue pagado. Si querés uno igual, pedíselo al vendedor.</Card>;
}

const NOT_FOUND = "Este link no existe o ya no está disponible.";

function isPubkey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

/** `/p/[orderId]` (03 §5.3): the public link, with the `Created` actions. */
export function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const session = useSession();
  const toast = useToast();
  const valid = isPubkey(orderId);

  const listing = useQuery({
    queryKey: ["listing", orderId],
    queryFn: () => getListingByOrder(orderId),
    enabled: valid,
  });
  const order = useQuery({
    queryKey: vaultixKeys.order(orderId),
    queryFn: () => getVaultixClient().getOrder(new PublicKey(orderId)),
    enabled: valid,
  });

  if (!valid) return <p className="text-steel">{NOT_FOUND}</p>;
  if (listing.isPending || order.isPending) return <p className="text-steel">Cargando…</p>;
  if (listing.isError || order.isError) {
    return <p className="text-plasma">No pudimos cargar este link. Probá de nuevo en un rato.</p>;
  }
  if (!listing.data || !order.data) return <p className="text-steel">{NOT_FOUND}</p>;

  const o = order.data;
  const isSeller = session.pubkey?.equals(o.seller) ?? false;
  const isBuyer = o.buyer !== null && (session.pubkey?.equals(o.buyer) ?? false);
  const link = typeof window === "undefined" ? "" : window.location.href;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.show("Link copiado.", "success");
    } catch {
      toast.show("No pudimos copiarlo.", "error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <OrderHeader listing={listing.data} status={o.status} amount={o.amount} />

      {o.status === "Created" ? (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-subtitle font-semibold">Antes de pagar</h2>
            <Rules order={o} role={isSeller ? "seller" : "buyer"} />
          </section>

          {isSeller ? (
            <div className="flex flex-col gap-3">
              <a
                href={whatsappUrl(listing.data.listing.title, o.amount, link)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-ion-blue px-5 text-body font-medium text-bone hover:bg-ion-blue/90"
              >
                Compartí el link
              </a>
              <Button variant="secondary" onClick={() => void copy()}>
                Copiar link
              </Button>
              <TxButton
                label="Cancelar link"
                variant="destructive"
                signer={session.pubkey}
                successMessage="Cancelaste el link. Nadie más puede pagarlo."
                invalidate={[vaultixKeys.order(orderId)]}
                build={(client) => client.buildCloseOrderTx({ order: new PublicKey(orderId), authority: session.pubkey! })}
              />
            </div>
          ) : (
            <PayFlow orderPda={orderId} order={o} />
          )}
        </>
      ) : (
        <AfterPayment orderPda={orderId} order={o} isSeller={isSeller} isBuyer={isBuyer} />
      )}

      {session.switchTestAccount ? (
        <Button variant="secondary" onClick={session.switchTestAccount}>
          Modo prueba: sos la cuenta {(session.testAccount ?? 0) + 1}
          {isSeller ? " (vendedor)" : isBuyer ? " (comprador)" : ""}. Cambiá a la otra
        </Button>
      ) : null}
    </div>
  );
}
