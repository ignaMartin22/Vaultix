import { describe, expect, it } from "vitest";

import { describeIdentity } from "./identity";

const PHANTOM = "AgPfzQo6EUMXqR6Ze1idYQdSL1gvBZdMJsU3BHkwktCq";
const EMBEDDED = {
  type: "wallet",
  address: "5WNMrZZc6UzMcn7cAZkzwn5BzyYJnxqt1DweHeh6fM3Q",
  chainType: "solana",
  walletClientType: "privy",
};

describe("describeIdentity", () => {
  it("shows the Google email, not the embedded wallet Privy created", () => {
    expect(describeIdentity([EMBEDDED, { type: "google_oauth", email: "ana@gmail.com" }])).toEqual({
      method: "google",
      methodLabel: "Google",
      handle: "ana@gmail.com",
    });
  });

  it("shows an email login's address", () => {
    expect(describeIdentity([{ type: "email", address: "ana@example.com" }, EMBEDDED])).toMatchObject({
      method: "email",
      handle: "ana@example.com",
    });
  });

  it("names the external wallet and shortens its address", () => {
    const id = describeIdentity([
      { type: "wallet", address: PHANTOM, chainType: "solana", walletClientType: "phantom" },
    ]);
    expect(id).toMatchObject({ method: "wallet", methodLabel: "Phantom" });
    expect(id?.handle).not.toBe(PHANTOM);
    expect(id?.handle.startsWith(PHANTOM.slice(0, 4))).toBe(true);
  });

  it("is null when there's nothing to show", () => {
    expect(describeIdentity([EMBEDDED])).toBeNull();
    expect(describeIdentity([])).toBeNull();
  });
});
