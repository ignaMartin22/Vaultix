import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  MIN_WITHDRAW_UNITS,
  validateWithdrawAmount,
  validateWithdrawDestination,
} from "./withdraw";

const owner = Keypair.generate().publicKey;

describe("validateWithdrawAmount", () => {
  it("accepts an amount between the minimum and the balance", () => {
    expect(validateWithdrawAmount("2,5", 3_000_000n)).toEqual({ amount: 2_500_000n });
    expect(validateWithdrawAmount("1", 1_000_000n)).toEqual({ amount: MIN_WITHDRAW_UNITS });
  });

  it("explains what's wrong", () => {
    expect(validateWithdrawAmount("0,5", 3_000_000n).error).toMatch(/mínimo/);
    expect(validateWithdrawAmount("4", 3_000_000n).error).toMatch(/No te alcanza: tenés USDC 3.00/);
    expect(validateWithdrawAmount("", 3_000_000n).error).toMatch(/cuánto/);
    expect(validateWithdrawAmount("abc", 3_000_000n).error).toMatch(/números/);
  });
});

describe("validateWithdrawDestination", () => {
  it("accepts another Solana address", () => {
    const other = Keypair.generate().publicKey;
    expect(
      validateWithdrawDestination(` ${other.toBase58()} `, owner).destination?.equals(other),
    ).toBe(true);
  });

  it("rejects empty, malformed and your own address", () => {
    expect(validateWithdrawDestination("", owner).error).toMatch(/Pegá/);
    expect(validateWithdrawDestination("0xabc", owner).error).toMatch(
      /no es una dirección de Solana/,
    );
    expect(validateWithdrawDestination(owner.toBase58(), owner).error).toMatch(/propia/);
  });
});
