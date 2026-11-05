import { describe, expect, it } from "vitest";

import { ORDER_STATUS_DISPLAY, statusColorVar, statusDisplay, statusFromIndex } from "./order-status";
import { ORDER_STATUSES } from "./vaultix/contract";

describe("order status display", () => {
  it("matches the table of 03 §3", () => {
    expect(ORDER_STATUS_DISPLAY).toEqual({
      Created: { label: "Creado", color: "steel" },
      Paid: { label: "En bóveda", color: "ultra-violet" },
      Shipped: { label: "Enviado", color: "ion-blue" },
      Disputed: { label: "En disputa", color: "plasma" },
      Released: { label: "Liberado", color: "released" },
      Refunded: { label: "Reembolsado", color: "steel" },
      Resolved: { label: "Resuelto", color: "steel" },
    });
  });

  it("covers every on-chain status", () => {
    for (const status of ORDER_STATUSES) {
      expect(statusDisplay(status).label).toBeTruthy();
    }
  });

  it("returns a CSS variable, not a hex", () => {
    expect(statusColorVar("Disputed")).toBe("var(--plasma)");
  });

  it("maps the enum discriminant like the Rust enum", () => {
    expect(statusFromIndex(0)).toBe("Created");
    expect(statusFromIndex(3)).toBe("Disputed");
    expect(statusFromIndex(6)).toBe("Resolved");
    expect(() => statusFromIndex(7)).toThrow(RangeError);
  });
});
