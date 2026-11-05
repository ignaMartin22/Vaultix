import { Keypair, type PublicKey } from "@solana/web3.js";
import { beforeEach, describe, expect, it } from "vitest";

import { toHex } from "../listing-hash";
import { trackingHash } from "../tracking";
import { DEFAULT_PROTOCOL, type ConfigAccount, type OrderAccount, type OrderStatus } from "../vaultix/contract";
import type { AuthUser } from "./auth";
import { ApiError } from "./errors";
import { createShippingApi, type Shipment, type ShippingDeps, type ShippingInfo } from "./shipping";

const keys = { seller: Keypair.generate(), buyer: Keypair.generate(), other: Keypair.generate(), arbiter: Keypair.generate() };
const pda = Keypair.generate().publicKey;

function user(k: Keypair): AuthUser {
  return { privyUserId: k.publicKey.toBase58(), pubkey: k.publicKey.toBase58(), solanaPubkeys: [k.publicKey.toBase58()], email: null };
}
const [seller, buyer, other, arbiter] = [keys.seller, keys.buyer, keys.other, keys.arbiter].map(user);

const address = {
  fullName: "Ana Pérez",
  phone: "11 5555 5555",
  street: "Av. Corrientes 1234",
  city: "CABA",
  province: "Buenos Aires",
  postalCode: "C1043",
};

let chainOrder: OrderAccount;
let infos: Map<string, ShippingInfo>;
let shipments: Map<string, Shipment>;
let api: ReturnType<typeof createShippingApi>;

function setOrder(status: OrderStatus, patch: Partial<OrderAccount> = {}) {
  chainOrder = {
    ...chainOrder,
    status,
    buyer: status === "Created" ? null : keys.buyer.publicKey,
    ...patch,
  };
}

beforeEach(() => {
  chainOrder = {
    status: "Created",
    seller: keys.seller.publicKey,
    buyer: null,
    orderId: 1n,
    mint: Keypair.generate().publicKey,
    amount: 45_000_000n,
    feeBps: 150,
    disputeDepositBps: 500,
    shipDeadlineSecs: 432_000n,
    claimWindowSecs: 864_000n,
    listingHash: new Uint8Array(32),
    trackingHash: null,
    disputeDeposit: 0n,
    createdAt: 1n,
    paidAt: 0n,
    shippedAt: 0n,
    rentPayer: keys.seller.publicKey,
    bump: 255,
  };
  infos = new Map();
  shipments = new Map();
  const config: ConfigAccount = {
    admin: keys.arbiter.publicKey,
    arbiter: keys.arbiter.publicKey,
    treasury: Keypair.generate().publicKey,
    allowedMint: chainOrder.mint,
    ...DEFAULT_PROTOCOL,
    bump: 255,
  };
  const deps: ShippingDeps = {
    readOrder: async (p: PublicKey) => (p.equals(pda) ? chainOrder : null),
    readConfig: async () => config,
    upsertShippingInfo: async (o, b, info) => void infos.set(`${o}:${b}`, info),
    getShippingInfo: async (o, b) => infos.get(`${o}:${b}`) ?? null,
    upsertShipment: async (o, s) => void shipments.set(o, s),
    getShipment: async (o) => shipments.get(o) ?? null,
  };
  api = createShippingApi(deps);
});

async function expectCode(promise: Promise<unknown>, code: string, message?: RegExp) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe(code);
  if (message) expect((err as ApiError).message).toMatch(message);
}

const body = (extra: object = {}) => ({ orderPda: pda.toBase58(), ...address, ...extra });

describe("POST /api/shipping", () => {
  it("lets a would-be buyer save an address before paying", async () => {
    await api.saveShippingInfo(buyer, body({ notes: "  timbre 2B " }));
    expect(infos.get(`${pda.toBase58()}:${buyer.pubkey}`)).toMatchObject({ full_name: "Ana Pérez", notes: "timbre 2B" });
  });

  it("validates the fields", async () => {
    await expectCode(api.saveShippingInfo(buyer, body({ city: "  " })), "bad_request", /Ciudad/);
    await expectCode(api.saveShippingInfo(buyer, body({ phone: "1".repeat(41) })), "bad_request", /largo/);
    await expectCode(api.saveShippingInfo(buyer, { ...body(), orderPda: Keypair.generate().publicKey.toBase58() }), "not_found");
  });

  it("rejects the seller and, after paying, anyone but the buyer", async () => {
    await expectCode(api.saveShippingInfo(seller, body()), "bad_request", /propio/);
    setOrder("Paid");
    await expectCode(api.saveShippingInfo(other, body()), "forbidden");
    await api.saveShippingInfo(buyer, body());
    setOrder("Shipped");
    await expectCode(api.saveShippingInfo(buyer, body()), "forbidden", /Ya no/);
  });
});

describe("GET /api/orders/:pda/shipping", () => {
  beforeEach(async () => {
    await api.saveShippingInfo(buyer, body());
    await api.saveShippingInfo(other, body({ fullName: "Otra persona" }));
  });

  it("is hidden while the order is unpaid", async () => {
    await expectCode(api.getShippingForSeller(seller, pda.toBase58()), "forbidden", /cuando te paguen/);
  });

  it("shows the seller only the address of whoever paid", async () => {
    setOrder("Paid");
    const res = await api.getShippingForSeller(seller, pda.toBase58());
    expect(res.shipping.full_name).toBe("Ana Pérez");
    expect(res.buyer).toBe(buyer.pubkey);
  });

  it("denies buyers, strangers and the arbiter", async () => {
    setOrder("Paid");
    for (const u of [buyer, other, arbiter]) await expectCode(api.getShippingForSeller(u, pda.toBase58()), "forbidden");
  });
});

describe("shipment", () => {
  const tracking = { carrier: "andreani", trackingNumber: "and 48213" };

  it("matches a known tracking hash vector (sha256sum of 'andreani:AND48213')", async () => {
    expect(toHex(await trackingHash("andreani", " and 48213 "))).toBe(
      "019204ff729ca82f3e8478f2bbc36ca930c65f9890fad2c46b7c9b33633a3135",
    );
  });

  it("lets only the seller save it, while paid or shipped", async () => {
    await expectCode(api.saveShipment(seller, pda.toBase58(), tracking), "forbidden");
    setOrder("Paid");
    await expectCode(api.saveShipment(buyer, pda.toBase58(), tracking), "forbidden");
    await expect(api.saveShipment(seller, pda.toBase58(), tracking)).resolves.toMatchObject({ ok: true });
    expect(shipments.get(pda.toBase58())).toEqual({ carrier: "andreani", tracking_number: "AND48213" });
  });

  it("must match the on-chain tracking_hash once shipped", async () => {
    setOrder("Shipped", { trackingHash: await trackingHash("andreani", "AND48213") });
    await expectCode(api.saveShipment(seller, pda.toBase58(), { carrier: "oca", trackingNumber: "X999" }), "bad_request", /no coincide/);
    await api.saveShipment(seller, pda.toBase58(), tracking);
  });

  it("validates carrier and number", async () => {
    setOrder("Paid");
    await expectCode(api.saveShipment(seller, pda.toBase58(), { carrier: "dhl", trackingNumber: "123" }), "bad_request", /correo/);
    await expectCode(api.saveShipment(seller, pda.toBase58(), { carrier: "oca", trackingNumber: "1" }), "bad_request", /seguimiento/);
  });

  it("is readable by buyer, seller and arbiter, not by strangers", async () => {
    setOrder("Shipped", { trackingHash: await trackingHash("andreani", "AND48213") });
    await api.saveShipment(seller, pda.toBase58(), tracking);
    for (const u of [buyer, seller, arbiter]) {
      await expect(api.getShipment(u, pda.toBase58())).resolves.toMatchObject({ tracking_number: "AND48213", verified: true });
    }
    await expectCode(api.getShipment(other, pda.toBase58()), "forbidden");
  });
});
