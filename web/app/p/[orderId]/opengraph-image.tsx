import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { formatUsdc } from "@/lib/amounts";
import { BRAND } from "@/lib/brand";
import { listingMeta } from "@/lib/server/listing-meta";

export const alt = "Pago protegido con Vaultix";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * 03 §5.4: vault-black card, product photo, title, "USDC X" and the
 * "Pago protegido" seal. The Spectral band is a static PNG along the bottom
 * edge with nothing on top (05 §4). Unknown links get the generic card.
 */
export default async function Image({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const [meta, band] = await Promise.all([
    listingMeta(orderId),
    readFile(join(process.cwd(), "public", "og-spectral.png"), "base64"),
  ]);

  const title = meta?.title ?? "Pagá protegido";
  const price = meta ? formatUsdc(BigInt(meta.amountUnits)) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BRAND.vaultBlack,
          color: BRAND.bone,
        }}
      >
        <div style={{ flex: 1, display: "flex", padding: 56, gap: 48, alignItems: "center" }}>
          {meta?.photoUrl ? (
            <img
              src={meta.photoUrl}
              alt=""
              width={460}
              height={460}
              style={{ borderRadius: 24, objectFit: "cover", background: BRAND.graphite }}
            />
          ) : null}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                padding: "10px 18px",
                borderRadius: 12,
                background: BRAND.graphite,
                color: BRAND.steel,
                fontSize: 24,
                letterSpacing: 2,
              }}
            >
              PAGO PROTEGIDO · FONDOS EN BÓVEDA
            </div>
            <div style={{ display: "flex", fontSize: meta?.photoUrl ? 60 : 76, fontWeight: 700, lineHeight: 1.1 }}>
              {title}
            </div>
            {price ? <div style={{ display: "flex", fontSize: 52, fontWeight: 700 }}>{price}</div> : null}
            <div style={{ display: "flex", fontSize: 30, color: BRAND.steel }}>
              {meta ? "Pagá protegido con Vaultix" : "La plata queda en bóveda hasta que llega."}
            </div>
          </div>
        </div>
        <img src={`data:image/png;base64,${band}`} alt="" width={1200} height={16} />
      </div>
    ),
    size,
  );
}
