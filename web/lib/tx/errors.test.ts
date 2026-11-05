import { describe, expect, it } from "vitest";

import { ApiClientError } from "../api";
import { VaultixError } from "../vaultix/contract";
import { programErrorName, txErrorMessage } from "./errors";

describe("programErrorName", () => {
  it("reads Anchor custom errors in every format they show up", () => {
    expect(programErrorName("failed: custom program error: 0x1770")).toBe("InvalidStatus");
    expect(programErrorName("Error Code: ClaimWindowClosed. Error Number: 6014.")).toBe("ClaimWindowClosed");
    expect(programErrorName('Transaction failed: {"InstructionError":[0,{"Custom":6013}]}')).toBe("DeadlineNotReached");
  });

  it("recognizes token and system failures", () => {
    expect(programErrorName("Program log: Error: insufficient funds")).toBe("InsufficientFunds");
    expect(programErrorName("Allocate: account Address { … } already in use")).toBe("AccountAlreadyInUse");
    expect(programErrorName("something else")).toBeNull();
  });
});

describe("txErrorMessage", () => {
  it("maps program errors to Spanish copy (03 §4)", () => {
    expect(txErrorMessage(new Error("custom program error: 0x1770"))).toBe(
      "Esta orden ya cambió de estado. Actualizá la página.",
    );
    expect(txErrorMessage(new VaultixError("SellerCannotBuy"))).toBe("No podés comprar tu propio producto.");
  });

  it("reads program errors from simulation logs", () => {
    const err = Object.assign(new Error("Simulation failed"), {
      logs: ["Program log: AnchorError occurred. Error Number: 6005. Error Message: Seller cannot buy."],
    });
    expect(txErrorMessage(err)).toBe("No podés comprar tu propio producto.");
  });

  it("says nothing moved when the user cancels", () => {
    expect(txErrorMessage(new Error("User rejected the request."))).toMatch(/Cancelaste/);
  });

  it("passes API messages through and falls back to a calm generic one", () => {
    expect(txErrorMessage(new ApiClientError("rate_limited", "Hiciste muchas operaciones hoy.", 429))).toBe(
      "Hiciste muchas operaciones hoy.",
    );
    expect(txErrorMessage(new Error("boom"))).toMatch(/No se pudo completar/);
  });
});
