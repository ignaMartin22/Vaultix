"use client";

import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { ArsApprox } from "@/components/ArsApprox";
import { Button, ButtonAnchor } from "@/components/ui/Button";
import { ErrorNote, Loading } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { formatUsdc } from "@/lib/amounts";
import { useSession } from "@/lib/auth/session";
import { CLUSTER } from "@/lib/solana-network";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";
import { getVaultixClient } from "@/lib/vaultix/client";

import { WithdrawForm } from "./WithdrawForm";

const IS_DEVNET = CLUSTER !== "mainnet-beta";

function explorerUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}${IS_DEVNET ? "?cluster=devnet" : ""}`;
}

/**
 * `/account`: what the user holds and where to receive it. The balance comes
 * straight from the chain; the address is the one their payments land on.
 */
export function AccountPage() {
  const session = useSession();
  const toast = useToast();
  const owner = session.pubkey;
  const address = owner?.toBase58() ?? "";
  const [qr, setQr] = useState<string | null>(null);

  const balance = useQuery({
    queryKey: vaultixKeys.balance(address),
    queryFn: () => getVaultixClient().getUsdcBalance(owner!),
    enabled: !!owner,
  });

  useEffect(() => {
    if (!address) return;
    let alive = true;
    // The QR library needs real colors: read them from the brand tokens.
    const css = getComputedStyle(document.documentElement);
    const dark = css.getPropertyValue("--vault-black").trim();
    const light = css.getPropertyValue("--bone").trim();
    QRCode.toDataURL(address, { margin: 1, width: 176, color: { dark, light } })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [address]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      toast.show("Dirección copiada.", "success");
    } catch {
      toast.show("No pudimos copiarla. Mantené apretada la dirección para copiarla.", "error");
    }
  }

  if (!session.ready) return <Loading />;

  if (!session.authenticated || !owner) {
    return (
      <div className="flex max-w-xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="font-display text-display text-bone lg:text-display-lg">Tu cuenta</h1>
          <p className="text-subtitle text-steel text-pretty">
            Entrá para ver tu saldo y la dirección donde recibís tus cobros.
          </p>
        </header>
        <Button onClick={session.login}>Entrá con tu email o Google</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-display text-bone lg:text-display-lg">Tu cuenta</h1>
        <p className="max-w-xl text-subtitle text-steel text-pretty">
          Lo que cobrás por tus ventas llega acá. También podés recibir USDC desde otra app.
        </p>
      </header>

      <section
        aria-labelledby="balance-title"
        className="flex flex-col gap-4 rounded-2xl border border-steel/15 bg-graphite p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="balance-title" className="text-body text-steel">
            Saldo disponible
          </h2>
          <button
            type="button"
            onClick={() => void balance.refetch()}
            disabled={balance.isFetching}
            aria-label="Actualizar saldo"
            title="Actualizar saldo"
            className="group flex size-11 items-center justify-center rounded-full border border-steel/30 text-steel transition-colors hover:border-steel hover:bg-vault-black hover:text-bone disabled:text-bone"
          >
            {/* Two arrows chasing each other; they turn while the balance is read. */}
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className={`size-5 ${balance.isFetching ? "animate-[spin_0.9s_linear_infinite]" : "transition-transform duration-500 ease-vault group-hover:rotate-180"}`}
            >
              <path
                d="M16 10a6 6 0 0 1-10.4 4.1M4 10a6 6 0 0 1 10.4-4.1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path
                d="M14.6 2.6v3.6H11M5.4 17.4v-3.6H9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        {balance.isPending ? (
          <Loading label="Leyendo tu saldo…" />
        ) : balance.isError ? (
          <ErrorNote>No pudimos leer tu saldo. Probá de nuevo en un rato.</ErrorNote>
        ) : (
          <div className="flex flex-col gap-1" aria-live="polite">
            <span className="font-mono text-display tabular-nums text-bone">
              {formatUsdc(balance.data)}
            </span>
            <span className="text-body tabular-nums text-steel">
              <ArsApprox units={balance.data} />
            </span>
          </div>
        )}
      </section>

      <section
        aria-labelledby="withdraw-title"
        className="flex flex-col gap-5 rounded-2xl border border-steel/15 bg-graphite p-5 sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="withdraw-title" className="font-display text-title text-bone">
            Retirar a otra app
          </h2>
          <p className="text-body text-steel">
            Mandá tus USDC a Lemon, Ripio, Phantom u otra cuenta de Solana.
          </p>
        </div>
        {balance.data !== undefined ? (
          <WithdrawForm owner={owner} balance={balance.data} />
        ) : (
          <p className="text-body text-steel">Cuando leamos tu saldo vas a poder retirar.</p>
        )}
      </section>

      <section
        aria-labelledby="address-title"
        className="flex flex-col gap-5 rounded-2xl border border-steel/15 bg-graphite p-5 sm:p-6"
      >
        <h2 id="address-title" className="font-display text-title text-bone">
          Tu dirección para recibir
        </h2>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated data URL
            <img
              src={qr}
              alt="Código QR de tu dirección"
              width={176}
              height={176}
              className="size-44 shrink-0 self-center rounded-xl sm:self-start"
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <p className="break-all font-mono text-body text-bone">{address}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button fullWidth variant="secondary" onClick={() => void copy()}>
                <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4">
                  <rect
                    x="5.5"
                    y="5.5"
                    width="8"
                    height="8"
                    rx="1.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                Copiar dirección
              </Button>
              <ButtonAnchor
                fullWidth
                variant="secondary"
                href={explorerUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver movimientos
                <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4">
                  <path
                    d="M6 3h7v7M13 3 4 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="sr-only">(se abre en otra pestaña)</span>
              </ButtonAnchor>
            </div>
          </div>
        </div>
        <p className="flex items-start gap-2 border-t border-steel/15 pt-4 text-body text-bone">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rotate-45 bg-ember" />
          <span>
            Solo USDC por la red <strong>Solana</strong>
            {IS_DEVNET ? " (Devnet, la red de prueba)" : ""}. Si te lo mandan por otra red, se
            pierde.
          </span>
        </p>
      </section>
    </div>
  );
}
