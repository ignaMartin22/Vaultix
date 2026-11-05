/**
 * Notification emails (specs/02-backend.md §4): voseo, the data first, no
 * crypto jargon (05 §6). Pure: given an event and its context, which mails go
 * to whom. `mail.ts` resolves the addresses and sends them.
 */
import { formatUsdc } from "../amounts";
import { formatDeadline } from "../deadlines";
import type { OrderEventRow } from "./events";

export type Recipient = "seller" | "buyer" | "arbiter";

export interface MailContext {
  /** Product title from the listing; falls back to a neutral name. */
  product: string | null;
  /** Public link to the order page. */
  orderUrl: string;
  /** Only for OrderPaid: when the seller must ship by. */
  shipBy?: bigint | null;
}

export interface Mail {
  to: Recipient;
  subject: string;
  text: string;
  html: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Plain, readable mail: one or two short paragraphs and the link. */
function mail(to: Recipient, subject: string, body: string[], ctx: MailContext, cta = "Ver la orden"): Mail {
  const text = [...body, "", `${cta}: ${ctx.orderUrl}`, "", "Vaultix · Pago protegido"].join("\n");
  const html = [
    `<div style="font-family:Inter,Arial,sans-serif;font-size:16px;line-height:1.5">`,
    ...body.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`),
    `<p style="margin:16px 0"><a href="${escapeHtml(ctx.orderUrl)}">${escapeHtml(cta)}</a></p>`,
    `<p style="margin:24px 0 0;font-size:12px">Vaultix · Pago protegido</p>`,
    `</div>`,
  ].join("");
  return { to, subject, text, html };
}

/** The mails one new event triggers (02 §4). Events not in the table send nothing. */
export function mailsFor(event: Pick<OrderEventRow, "event_type" | "payload">, ctx: MailContext): Mail[] {
  const product = ctx.product ?? "tu producto";
  const p = event.payload;

  switch (event.event_type) {
    case "OrderPaid": {
      const by = ctx.shipBy ? formatDeadline(ctx.shipBy) : null;
      return [
        mail(
          "seller",
          by ? `Te pagaron ${product}. Despachá antes del ${by}.` : `Te pagaron ${product}. Despachalo cuanto antes.`,
          [
            `Tu comprador pagó ${formatUsdc(BigInt(str(p.amount)))} y la plata ya está en bóveda.`,
            by
              ? `Despachalo antes del ${by}. Si no, le devolvemos todo al comprador.`
              : "Despachalo cuanto antes. Si pasa el plazo, le devolvemos todo al comprador.",
            "Los datos de envío están en la página de la orden.",
          ],
          ctx,
        ),
      ];
    }
    case "OrderShipped":
      return [
        mail(
          "buyer",
          `El vendedor despachó ${product}.`,
          [
            "Tu plata sigue en bóveda hasta que confirmes que llegó.",
            "Cuando lo recibas, confirmalo. Si algo está mal, podés abrir un reclamo desde la orden.",
          ],
          ctx,
        ),
      ];
    case "OrderReleased": {
      const amount = formatUsdc(BigInt(str(p.seller_amount)));
      return [
        mail(
          "seller",
          `Cobraste ${amount} por ${product}.`,
          [
            p.by_timeout === true
              ? `Pasó el plazo de reclamo sin problemas y te liberamos ${amount}.`
              : `El comprador confirmó que le llegó y te liberamos ${amount}.`,
            "Ya está en tu cuenta.",
          ],
          ctx,
        ),
      ];
    }
    case "OrderRefunded": {
      const amount = formatUsdc(BigInt(str(p.buyer_amount)));
      return [
        mail(
          "buyer",
          `Te devolvimos ${amount}.`,
          [`El vendedor no despachó ${product} a tiempo, así que te devolvimos ${amount}. No se cobró comisión.`],
          ctx,
        ),
      ];
    }
    case "DisputeOpened":
      return [
        mail(
          "seller",
          `Abrieron un reclamo por ${product}. Subí tu evidencia.`,
          [
            "El comprador abrió un reclamo. La plata sigue en bóveda mientras se revisa.",
            "Subí fotos del paquete, el comprobante del correo o lo que muestre que lo mandaste bien. Un árbitro va a decidir.",
          ],
          ctx,
          "Subir evidencia",
        ),
        mail(
          "arbiter",
          `Abrieron un reclamo por ${product}.`,
          ["Hay un reclamo nuevo para revisar en el panel de reclamos."],
          { ...ctx, orderUrl: ctx.orderUrl.replace(/\/p\/[^/]+$/, "/admin/disputes") },
          "Abrir el panel",
        ),
      ];
    case "DisputeResolved": {
      const buyerAmount = formatUsdc(BigInt(str(p.buyer_amount)));
      const sellerAmount = formatUsdc(BigInt(str(p.seller_amount)));
      const body = [`El árbitro resolvió el reclamo por ${product}.`, `Comprador: ${buyerAmount}. Vendedor: ${sellerAmount}.`];
      return [
        mail("buyer", `Se resolvió el reclamo por ${product}.`, body, ctx),
        mail("seller", `Se resolvió el reclamo por ${product}.`, body, ctx),
      ];
    }
    default:
      return [];
  }
}

/** Words the UI and mails never use (AGENTS.md, 05 §6). */
export const FORBIDDEN_WORDS = [
  "wallet",
  "billetera",
  "gas",
  "fee de red",
  "smart contract",
  "contrato inteligente",
  "programa",
  "seed phrase",
  "blockchain",
  "on-chain",
  "escrow",
  "transacción",
  "token",
];
