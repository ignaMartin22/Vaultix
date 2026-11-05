import { Keypair, Transaction, TransactionExpiredBlockheightExceededError, TransactionInstruction } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";

import { ApiClientError } from "../api";
import { needsSignatureFrom, runTx, type TxPhase, type TxSteps } from "./run";

const feePayer = Keypair.generate().publicKey;
const user = Keypair.generate().publicKey;

function tx(signers: typeof user[] = []) {
  return new Transaction({ feePayer, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(
    new TransactionInstruction({
      programId: Keypair.generate().publicKey,
      keys: signers.map((pubkey) => ({ pubkey, isSigner: true, isWritable: false })),
      data: Buffer.alloc(0),
    }),
  );
}

function steps(overrides: Partial<TxSteps> = {}): TxSteps {
  return {
    build: vi.fn(async () => tx()),
    sign: vi.fn(async (t: Transaction) => t),
    send: vi.fn(async () => "sig"),
    confirm: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("runTx", () => {
  it("goes through every phase in order", async () => {
    const phases: TxPhase[] = [];
    await expect(runTx(steps(), (p) => phases.push(p))).resolves.toBe("sig");
    expect(phases).toEqual(["signing", "sending", "confirming", "confirmed"]);
  });

  it("rebuilds and retries when the blockhash expires", async () => {
    const send = vi
      .fn<TxSteps["send"]>()
      .mockRejectedValueOnce(new ApiClientError("blockhash_expired", "x", 409))
      .mockResolvedValueOnce("sig2");
    const s = steps({ send });
    await expect(runTx(s, () => {})).resolves.toBe("sig2");
    expect(s.build).toHaveBeenCalledTimes(2);
  });

  it("also retries an expiry detected while confirming", async () => {
    const confirm = vi
      .fn<TxSteps["confirm"]>()
      .mockRejectedValueOnce(new TransactionExpiredBlockheightExceededError("sig"))
      .mockResolvedValueOnce(undefined);
    await expect(runTx(steps({ confirm }), () => {})).resolves.toBe("sig");
  });

  it("gives up after 3 attempts", async () => {
    const phases: TxPhase[] = [];
    const s = steps({ send: vi.fn(async () => Promise.reject(new Error("Blockhash not found"))) });
    await expect(runTx(s, (p) => phases.push(p))).rejects.toThrow(/Blockhash/);
    expect(s.build).toHaveBeenCalledTimes(3);
    expect(phases.at(-1)).toBe("failed");
  });

  it("does not retry other failures", async () => {
    const s = steps({ sign: vi.fn(async () => Promise.reject(new Error("User rejected the request"))) });
    await expect(runTx(s, () => {})).rejects.toThrow(/rejected/);
    expect(s.build).toHaveBeenCalledTimes(1);
    expect(s.send).not.toHaveBeenCalled();
  });
});

describe("needsSignatureFrom", () => {
  it("is false for permissionless transactions (only the fee payer signs)", () => {
    expect(needsSignatureFrom(tx(), user)).toBe(false);
    expect(needsSignatureFrom(tx([user]), null)).toBe(false);
  });

  it("is true when the user signs, including as the fee payer (the arbiter)", () => {
    expect(needsSignatureFrom(tx([user]), user)).toBe(true);
    expect(needsSignatureFrom(tx(), feePayer)).toBe(true);
  });
});
