"use client";

import { useQuery } from "@tanstack/react-query";
import type { PublicKey } from "@solana/web3.js";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { formatUsdc } from "@/lib/amounts";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";
import { getVaultixClient, isMockClient } from "@/lib/vaultix/client";

export interface TopUpSheetProps {
  open: boolean;
  onClose: () => void;
  owner: PublicKey;
  /** What the payment needs, in minimum units. */
  needed: bigint;
  onEnough: () => void;
}

const POLL_MS = 5_000;
const isDevnet = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet") !== "mainnet-beta";

/** "Cargá saldo" (03 §5.3): address + QR, how to send USDC, polling every 5 s. */
export function TopUpSheet({ open, onClose, owner, needed, onEnough }: TopUpSheetProps) {
  const toast = useToast();
  const address = owner.toBase58();
  const [qr, setQr] = useState<string | null>(null);

  const balance = useQuery({
    queryKey: vaultixKeys.balance(address),
    queryFn: () => getVaultixClient().getUsdcBalance(owner),
    refetchInterval: open ? POLL_MS : false,
    enabled: open,
  });

  const have = balance.data ?? 0n;
  const missing = needed > have ? needed - have : 0n;

  useEffect(() => {
    if (open && balance.data !== undefined && balance.data >= needed) onEnough();
  }, [open, balance.data, needed, onEnough]);

  useEffect(() => {
    let alive = true;
    // The QR library needs real colors: read them from the brand tokens.
    const css = getComputedStyle(document.documentElement);
    const dark = css.getPropertyValue("--vault-black").trim();
    const light = css.getPropertyValue("--bone").trim();
    QRCode.toDataURL(address, { margin: 1, width: 192, color: { dark, light } })
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

  const client = getVaultixClient();

  return (
    <Sheet open={open} onClose={onClose} title={`Te faltan ${formatUsdc(missing)}`}>
      <div className="flex flex-col gap-4">
        <p className="text-body text-steel">
          Mandá USDC a tu cuenta por la red <strong className="text-bone">Solana</strong> desde Lemon, Ripio u otra app.
          Apenas lleguen, seguimos solos.
        </p>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated data URL
          <img src={qr} alt="Código QR de tu cuenta" className="mx-auto h-48 w-48 rounded-xl" />
        ) : null}
        <button
          type="button"
          onClick={() => void copy()}
          className="break-all rounded-xl border border-steel/40 bg-vault-black px-4 py-3 text-left font-mono text-label text-bone"
        >
          {address}
          <span className="mt-1 block font-sans text-steel">Tocá para copiar</span>
        </button>
        <p className="text-label text-steel" aria-live="polite">
          Tenés {formatUsdc(have)}. Revisamos cada 5 segundos.
        </p>
        {isDevnet ? (
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-body text-ion-blue underline"
          >
            Modo prueba: pedí USDC gratis en el faucet de Circle (red Solana Devnet)
          </a>
        ) : null}
        {isMockClient(client) ? (
          <Button
            variant="secondary"
            onClick={() => {
              client.mintUsdc(owner, missing);
              void balance.refetch();
            }}
          >
            Cargar USDC de prueba
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
