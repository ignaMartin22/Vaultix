"use client";

import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { useParams } from "next/navigation";

import { TxButton } from "@/components/TxButton";
import { Button, ButtonAnchor, ButtonLink } from "@/components/ui/Button";
import { ErrorNote, Loading } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/lib/auth/session";
import { getListingByOrder, listingMatchesOrder } from "@/lib/listings-client";
import { LIVE_POLL_MS } from "@/lib/order-status";
import { whatsappUrl } from "@/lib/sell";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";
import { getVaultixClient, isMockClient } from "@/lib/vaultix/client";
import { FINAL_STATUSES, type OrderAccount } from "@/lib/vaultix/contract";

import { BuyerActions } from "./BuyerActions";
import { OrderAbout, OrderGallery, OrderSummary } from "./OrderHeader";
import { OrderTrack } from "./OrderTrack";
import { OutcomeCard, type Resolution } from "./OutcomeCard";
import { PayFlow } from "./PayFlow";
import { Rules } from "./Rules";
import { SellerActions } from "./SellerActions";
import { StateNote } from "./StateNote";

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
  return (
    <StateNote title="Este link ya fue pagado.">
      <p>Si querés uno igual, pedíselo al vendedor.</p>
    </StateNote>
  );
}

function Unavailable() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-6 py-10">
      <StateNote title="Este link no existe o ya no está disponible.">
        <p>Revisá que esté completo o pedile al vendedor que te lo mande de nuevo.</p>
      </StateNote>
      <ButtonLink href="/" variant="secondary">
        Ir al inicio
      </ButtonLink>
    </div>
  );
}

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
    // The other side acts on their own phone: keep re-reading the vault until the
    // order settles, so a payment, a dispatch or a release shows without reloading.
    // React Query pauses this while the tab is in the background.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && !FINAL_STATUSES.includes(status) ? LIVE_POLL_MS : false;
    },
  });

  if (!valid) return <Unavailable />;
  if (listing.isPending || order.isPending) return <Loading label="Abriendo el link…" className="py-10" />;
  if (listing.isError || order.isError) {
    return <ErrorNote className="py-10">No pudimos cargar este link. Probá de nuevo en un rato.</ErrorNote>;
  }
  if (!listing.data || !order.data) return <Unavailable />;
  // The product shown must be the one this order commits to. A seller can close a
  // Created order and re-create it at the same address with other terms; the old
  // listing would then describe an order it no longer matches (X-03).
  if (!listingMatchesOrder(listing.data.listing.listingHash, order.data.listingHash)) {
    return <Unavailable />;
  }

  const o = order.data;
  const isSeller = session.pubkey?.equals(o.seller) ?? false;
  const isBuyer = o.buyer !== null && (session.pubkey?.equals(o.buyer) ?? false);
  const link = typeof window === "undefined" ? "" : window.location.href;
  const hasPhotos = listing.data.listing.photoUrls.length > 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.show("Link copiado.", "success");
    } catch {
      toast.show("No pudimos copiarlo.", "error");
    }
  }

  return (
    <div
      className={`grid gap-8 ${hasPhotos ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16" : "mx-auto w-full max-w-xl"}`}
    >
      {hasPhotos ? (
        <div className="flex flex-col gap-10">
          <OrderGallery listing={listing.data} />
          <div className="hidden lg:block">
            <OrderAbout listing={listing.data} />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-8">
        <OrderSummary orderPda={orderId} listing={listing.data} status={o.status} amount={o.amount} />
        <OrderTrack status={o.status} />
        {/* On mobile the description reads before the actions; on desktop it sits under the photos. */}
        <div className={hasPhotos ? "lg:hidden" : ""}>
          <OrderAbout listing={listing.data} />
        </div>

        {o.status === "Created" ? (
          <>
            <section aria-labelledby="rules-title" className="flex flex-col gap-3">
              <h2 id="rules-title" className="font-mono text-label uppercase text-steel">
                Antes de pagar
              </h2>
              <Rules order={o} role={isSeller ? "seller" : "buyer"} />
            </section>

            {isSeller ? (
              <div className="flex flex-col gap-3">
                <ButtonAnchor
                  fullWidth
                  href={whatsappUrl(listing.data.listing.title, o.amount, link)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Compartí el link
                </ButtonAnchor>
                <Button fullWidth variant="secondary" onClick={() => void copy()}>
                  Copiar link
                </Button>
                <div className="mt-4 flex flex-col gap-3 border-t border-steel/15 pt-5">
                  <p className="text-body text-steel">Si lo cancelás, nadie más va a poder pagarlo.</p>
                  <TxButton
                    fullWidth
                    label="Cancelar link"
                    variant="destructive"
                    signer={session.pubkey}
                    successMessage="Cancelaste el link. Nadie más puede pagarlo."
                    invalidate={[vaultixKeys.order(orderId)]}
                    build={(client) => client.buildCloseOrderTx({ order: new PublicKey(orderId), authority: session.pubkey! })}
                  />
                </div>
              </div>
            ) : (
              <PayFlow orderPda={orderId} order={o} />
            )}
          </>
        ) : (
          <AfterPayment orderPda={orderId} order={o} isSeller={isSeller} isBuyer={isBuyer} />
        )}

        {session.switchTestAccount ? (
          <div className="flex flex-col gap-2 border-t border-dashed border-steel/25 pt-5">
            <span className="font-mono text-label uppercase text-ember">Modo prueba</span>
            <p className="text-body text-steel">
              Sos la cuenta {(session.testAccount ?? 0) + 1}
              {isSeller ? " (vendedor)" : isBuyer ? " (comprador)" : ""}.{" "}
              <button type="button" className="link min-h-11" onClick={session.switchTestAccount}>
                Cambiá a la otra
              </button>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
