import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { pickSolanaAddress } from "./auth/pick-account";
import { createDraft, paymentLink } from "./listings-client";
import { listingHash } from "./listing-hash";
import { MockVaultixClient } from "./vaultix/mock";
import { isOrderIdCollision } from "./tx/errors";
import { orderPda } from "./vaultix/pdas";
import { validatePrice, whatsappUrl } from "./sell";

const MAX = 500_000_000n;

describe("validatePrice", () => {
  it("accepts prices up to the max", () => {
    expect(validatePrice("120,50", MAX)).toEqual({ amount: 120_500_000n });
    expect(validatePrice("500", MAX)).toEqual({ amount: MAX });
  });

  it("explains what's wrong in Spanish", () => {
    expect(validatePrice("0", MAX).error).toMatch(/mayor a 0/);
    expect(validatePrice("500,01", MAX).error).toBe("El máximo por link es USDC 500.00.");
    expect(validatePrice("abc", MAX).error).toMatch(/con números/);
    expect(validatePrice("1,1234567", MAX).error).toMatch(/6 decimales/);
  });
});

describe("whatsappUrl", () => {
  it("shares product, price and link", () => {
    const url = new URL(whatsappUrl("Campera", 45_000_000n, "https://vaultix.app/p/abc"));
    expect(url.origin).toBe("https://wa.me");
    expect(url.searchParams.get("text")).toBe("Campera · USDC 45.00. Pagá protegido con Vaultix: https://vaultix.app/p/abc");
  });
});

describe("pickSolanaAddress", () => {
  it("prefers the connected external account, like the server", () => {
    const embedded = { type: "wallet", chainType: "solana", walletClientType: "privy", address: "EMB" };
    const phantom = { type: "wallet", chainType: "solana", walletClientType: "phantom", address: "PHA" };
    const eth = { type: "wallet", chainType: "ethereum", walletClientType: "metamask", address: "0x" };
    expect(pickSolanaAddress([embedded, phantom, eth])).toBe("PHA");
    expect(pickSolanaAddress([eth, embedded])).toBe("EMB");
    expect(pickSolanaAddress([{ type: "email" }])).toBeNull();
  });
});

describe("mock sell flow", () => {
  it("creates a draft whose order the mock accepts, and spots order_id collisions", async () => {
    const seller = Keypair.generate();
    const photos = [new File(["x"], "a.jpg", { type: "image/jpeg" })];
    const draft = await createDraft(
      { title: "Campera", description: "", amount: 45_000_000n, photos },
      seller.publicKey,
      async () => null,
    );
    expect(draft.orderPda.equals(orderPda(seller.publicKey, draft.orderId))).toBe(true);
    expect(draft.listingHash).toEqual(
      await listingHash({ title: "Campera", description: "", amount: 45_000_000n, photos: [`${draft.id}/1.jpg`] }),
    );
    expect(paymentLink("https://vaultix.app", draft.orderPda)).toBe(`https://vaultix.app/p/${draft.orderPda.toBase58()}`);

    const mock = new MockVaultixClient();
    const create = async () => {
      const tx = await mock.buildCreateOrderTx({
        seller: seller.publicKey,
        orderId: draft.orderId,
        amount: 45_000_000n,
        listingHash: draft.listingHash,
      });
      tx.partialSign(seller);
      return mock.applyTransaction(tx);
    };
    await create();
    expect((await mock.getOrder(draft.orderPda))?.status).toBe("Created");
    const second = await create().catch((e: unknown) => e);
    expect(isOrderIdCollision(second)).toBe(true);
  });
});

describe("shortAddress", () => {
  it("keeps the first and last 4 characters", async () => {
    const { shortAddress } = await import("./format");
    expect(shortAddress("8F3aXXXXXXXXXXXXc41E")).toBe("8F3a…c41E");
    expect(shortAddress("short")).toBe("short");
  });
});
