import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";

import idl from "../vaultix/idl.json";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../vaultix/pdas";
import type { AuthUser } from "./auth";
import { ApiError } from "./errors";
import { createSponsor, parseSecretKey, utcDay } from "./fee-payer";
import { decodeTransaction, validateSponsoredTx, type SponsorContext } from "./sponsor-validate";

const programId = new PublicKey(idl.address);
const usdcMint = Keypair.generate().publicKey;
const feePayer = Keypair.generate();
const seller = Keypair.generate();
const stranger = Keypair.generate();
const blockhash = Keypair.generate().publicKey.toBase58();

const ctx: SponsorContext = {
  feePayer: feePayer.publicKey,
  userPubkeys: [seller.publicKey.toBase58()],
  programId,
  usdcMint,
};

/** A vaultix instruction with the IDL's accounts, overriding some by name. */
function vaultixIx(name: string, accounts: Record<string, PublicKey> = {}): TransactionInstruction {
  const def = idl.instructions.find((ix) => ix.name === name);
  if (!def) throw new Error(`no ${name} in IDL`);
  return new TransactionInstruction({
    programId,
    keys: def.accounts.map((a) => ({
      pubkey: accounts[a.name] ?? Keypair.generate().publicKey,
      isSigner: "signer" in a && a.signer === true,
      isWritable: "writable" in a && a.writable === true,
    })),
    data: Buffer.from(def.discriminator),
  });
}

function ataCreateIdempotent(owner: PublicKey, mint: PublicKey = usdcMint, payer = feePayer.publicKey) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function tx(instructions: TransactionInstruction[], signers: Keypair[] = [seller], payer = feePayer.publicKey) {
  const t = new Transaction({ feePayer: payer, recentBlockhash: blockhash }).add(...instructions);
  if (signers.length > 0) t.partialSign(...signers);
  return t;
}

function createOrderTx() {
  return tx([
    ataCreateIdempotent(seller.publicKey),
    vaultixIx("create_order", { seller: seller.publicKey, payer: feePayer.publicKey }),
  ]);
}

function expectRejected(fn: () => unknown, pattern?: RegExp) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("bad_request");
    if (pattern) expect((err as ApiError).message).toMatch(pattern);
    return;
  }
  throw new Error("expected the transaction to be rejected");
}

describe("validateSponsoredTx: valid transactions", () => {
  it("accepts the seller's ATA + create_order with the fee payer as rent payer", () => {
    expect(validateSponsoredTx(createOrderTx(), ctx)).toEqual(["create_order"]);
  });

  it("accepts pay with compute budget instructions within the caps", () => {
    const t = tx([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
      vaultixIx("pay", { buyer: seller.publicKey }),
    ]);
    expect(validateSponsoredTx(t, ctx)).toEqual(["pay"]);
  });

  it("accepts permissionless release and close_order refunding the fee payer", () => {
    expect(validateSponsoredTx(tx([vaultixIx("release")], []), ctx)).toEqual(["release"]);
    const close = vaultixIx("close_order", { caller: seller.publicKey, rent_payer: feePayer.publicKey });
    expect(validateSponsoredTx(tx([close]), ctx)).toEqual(["close_order"]);
  });

  it("round-trips through the wire format", () => {
    const wire = createOrderTx().serialize({ requireAllSignatures: false }).toString("base64");
    expect(validateSponsoredTx(decodeTransaction(wire), ctx)).toEqual(["create_order"]);
  });
});

describe("validateSponsoredTx: rule 1 (signers)", () => {
  it("rejects a signer that is not one of the user's accounts", () => {
    const t = tx([vaultixIx("pay", { buyer: stranger.publicKey })], [stranger]);
    expectRejected(() => validateSponsoredTx(t, ctx), /no es tuya/);
  });

  it("rejects a missing user signature", () => {
    const t = tx([vaultixIx("pay", { buyer: seller.publicKey })], []);
    expectRejected(() => validateSponsoredTx(t, ctx), /falta tu firma/);
  });

  it("rejects a signature that doesn't match the message", () => {
    const t = tx([vaultixIx("pay", { buyer: seller.publicKey })]);
    const sig = t.signatures.find((s) => s.publicKey.equals(seller.publicKey))!;
    sig.signature = Buffer.alloc(64, 7);
    expectRejected(() => validateSponsoredTx(t, ctx), /firma inválida/);
  });

  it("rejects a transaction whose fee payer is not ours, or already co-signed", () => {
    const other = tx([vaultixIx("pay", { buyer: seller.publicKey })], [seller], seller.publicKey);
    expectRejected(() => validateSponsoredTx(other, ctx), /comisión/);
    const preSigned = tx([vaultixIx("pay", { buyer: seller.publicKey })], [seller, feePayer]);
    expectRejected(() => validateSponsoredTx(preSigned, ctx), /ya viene firmada/);
  });
});

describe("validateSponsoredTx: rule 2 (fee payer only pays rent)", () => {
  it("rejects a SOL transfer out of the fee payer", () => {
    const drain = SystemProgram.transfer({
      fromPubkey: feePayer.publicKey,
      toPubkey: stranger.publicKey,
      lamports: 1_000_000_000,
    });
    expectRejected(() => validateSponsoredTx(tx([drain, vaultixIx("release")], []), ctx));
  });

  it("rejects the fee payer in any vaultix slot other than payer / rent_payer", () => {
    const asBuyer = tx([vaultixIx("pay", { buyer: feePayer.publicKey, buyer_token: Keypair.generate().publicKey })], []);
    expectRejected(() => validateSponsoredTx(asBuyer, ctx), /cuenta que paga/);
    const asSellerToken = tx([vaultixIx("release", { seller_token: feePayer.publicKey })], []);
    expectRejected(() => validateSponsoredTx(asSellerToken, ctx), /cuenta que paga/);
    const asCaller = tx([vaultixIx("close_order", { caller: feePayer.publicKey })], []);
    expectRejected(() => validateSponsoredTx(asCaller, ctx), /cuenta que paga/);
  });

  it("rejects ATAs for another mint, another owner, or owned by the fee payer", () => {
    const otherMint = tx([ataCreateIdempotent(seller.publicKey, Keypair.generate().publicKey), vaultixIx("release")]);
    expectRejected(() => validateSponsoredTx(otherMint, ctx), /otro token/);
    const otherOwner = tx([ataCreateIdempotent(stranger.publicKey), vaultixIx("release")]);
    expectRejected(() => validateSponsoredTx(otherOwner, ctx), /otra persona/);
  });
});

describe("validateSponsoredTx: rule 3 (allowlist)", () => {
  it("rejects programs outside the allowlist", () => {
    const memo = new TransactionInstruction({
      programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      keys: [],
      data: Buffer.from("hola"),
    });
    expectRejected(() => validateSponsoredTx(tx([memo, vaultixIx("release")], []), ctx), /programa no permitido/);
  });

  it("rejects vaultix instructions that are not sponsored", () => {
    for (const name of ["resolve_dispute", "initialize_config", "update_config"]) {
      const signerName = name === "resolve_dispute" ? "arbiter" : "admin";
      const t = tx([vaultixIx(name, { [signerName]: seller.publicKey })]);
      expectRejected(() => validateSponsoredTx(t, ctx), /instrucción no permitida/);
    }
  });

  it("rejects a known discriminator with extra accounts", () => {
    const ix = vaultixIx("release");
    ix.keys.push({ pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true });
    expectRejected(() => validateSponsoredTx(tx([ix], []), ctx), /cuentas inesperadas/);
  });

  it("caps compute budget so priority fees can't drain the fee payer", () => {
    const pricey = tx([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_001 }), vaultixIx("release")], []);
    expectRejected(() => validateSponsoredTx(pricey, ctx), /prioridad/);
    const big = tx([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), vaultixIx("release")], []);
    expectRejected(() => validateSponsoredTx(big, ctx), /límite de cómputo/);
    const heap = tx([ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }), vaultixIx("release")], []);
    expectRejected(() => validateSponsoredTx(heap, ctx), /no permitida/);
  });

  it("rejects transactions with no vaultix instruction", () => {
    expectRejected(() => validateSponsoredTx(tx([ataCreateIdempotent(seller.publicKey)]), ctx), /ninguna operación/);
  });

  it("rejects garbage on the wire", () => {
    expectRejected(() => decodeTransaction("not base64 at all"));
    expectRejected(() => decodeTransaction(""));
    expectRejected(() => decodeTransaction(42));
  });
});

describe("createSponsor: rule 4 (daily limit) and sending", () => {
  const user: AuthUser = {
    privyUserId: "did:privy:ana",
    pubkey: seller.publicKey.toBase58(),
    solanaPubkeys: [seller.publicKey.toBase58()],
    email: null,
  };
  const wire = () => createOrderTx().serialize({ requireAllSignatures: false }).toString("base64");

  type SendFn = (raw: Buffer) => Promise<string>;

  function setup(count: number, send = vi.fn<SendFn>(async () => "sig123")) {
    const incrementUsage = vi.fn(async () => count);
    const sponsor = createSponsor({
      feePayer,
      programId,
      usdcMint,
      dailyLimit: 20,
      incrementUsage,
      send,
      now: () => new Date("2026-11-05T23:59:59Z"),
    });
    return { sponsor, incrementUsage, send };
  }

  it("co-signs and sends within the limit", async () => {
    const { sponsor, incrementUsage, send } = setup(20);
    await expect(sponsor(user, wire())).resolves.toEqual({ signature: "sig123" });
    expect(incrementUsage).toHaveBeenCalledWith("did:privy:ana", "2026-11-05");
    const sent = Transaction.from(send.mock.calls[0][0]);
    expect(sent.verifySignatures(true)).toBe(true);
  });

  it("refuses once the limit is exceeded, without sending", async () => {
    const { sponsor, send } = setup(21);
    const err = await sponsor(user, wire()).catch((e: unknown) => e);
    expect((err as ApiError).code).toBe("rate_limited");
    expect(send).not.toHaveBeenCalled();
  });

  it("doesn't count invalid transactions", async () => {
    const { sponsor, incrementUsage } = setup(1);
    const bad = tx([vaultixIx("pay", { buyer: stranger.publicKey })], [stranger]);
    await expect(sponsor(user, bad.serialize({ requireAllSignatures: false }).toString("base64"))).rejects.toThrow(ApiError);
    expect(incrementUsage).not.toHaveBeenCalled();
  });

  it("maps an expired blockhash and other send failures", async () => {
    const expired = setup(1, vi.fn<SendFn>(async () => Promise.reject(new Error("Blockhash not found"))));
    expect(((await expired.sponsor(user, wire()).catch((e: unknown) => e)) as ApiError).code).toBe("blockhash_expired");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failed = setup(1, vi.fn<SendFn>(async () => Promise.reject(new Error("custom program error: 0x1770"))));
    expect(((await failed.sponsor(user, wire()).catch((e: unknown) => e)) as ApiError).code).toBe("tx_failed");
    warn.mockRestore();
  });
});

describe("fee payer helpers", () => {
  it("parses the secret key JSON and rejects anything else", () => {
    expect(parseSecretKey(JSON.stringify([...feePayer.secretKey])).publicKey.equals(feePayer.publicKey)).toBe(true);
    expect(() => parseSecretKey("[1,2,3]")).toThrow(/64 bytes/);
    expect(() => parseSecretKey("nope")).toThrow(/64 bytes/);
  });

  it("uses the UTC day", () => {
    expect(utcDay(new Date("2026-11-05T23:30:00-03:00"))).toBe("2026-11-06");
  });
});
