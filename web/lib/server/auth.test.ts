import type { LinkedAccount } from "@privy-io/node";
import { describe, expect, it, vi } from "vitest";

import { createRequireUser, pickEmail, pickSolanaPubkey, type AuthDeps } from "./auth";
import { ApiError } from "./errors";

const EMBEDDED = "EmbeddedSo1anaAccount1111111111111111111111";
const PHANTOM = "PhantomSo1anaAccount11111111111111111111111";

const embeddedWallet = {
  type: "wallet",
  chain_type: "solana",
  connector_type: "embedded",
  wallet_client: "privy",
  wallet_client_type: "privy",
  address: EMBEDDED,
} as unknown as LinkedAccount;

const phantomWallet = {
  type: "wallet",
  chain_type: "solana",
  connector_type: "solana_adapter",
  wallet_client: "unknown",
  wallet_client_type: "phantom",
  address: PHANTOM,
} as unknown as LinkedAccount;

const ethWallet = {
  type: "wallet",
  chain_type: "ethereum",
  address: "0xabc",
} as unknown as LinkedAccount;

const email = { type: "email", address: "ana@example.com" } as unknown as LinkedAccount;
const google = { type: "google_oauth", email: "ana@gmail.com" } as unknown as LinkedAccount;

function request(authorization?: string) {
  return new Request("https://vaultix.test/api/me", {
    headers: authorization ? { authorization } : {},
  });
}

function setup(accounts: LinkedAccount[], overrides: Partial<AuthDeps> = {}) {
  const deps: AuthDeps = {
    verifyAccessToken: vi.fn(async (token: string) => {
      if (token !== "good-token") throw new Error("invalid signature");
      return { user_id: "did:privy:ana" };
    }),
    getUser: vi.fn(async (id: string) => ({ id, linked_accounts: accounts })),
    upsertProfile: vi.fn(async () => {}),
    ...overrides,
  };
  return { deps, requireUser: createRequireUser(deps) };
}

async function expectApiError(promise: Promise<unknown>, code: string) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe(code);
}

describe("requireUser", () => {
  it("returns the user and upserts the profile", async () => {
    const { deps, requireUser } = setup([email, embeddedWallet]);
    await expect(requireUser(request("Bearer good-token"))).resolves.toEqual({
      privyUserId: "did:privy:ana",
      pubkey: EMBEDDED,
      solanaPubkeys: [EMBEDDED],
      email: "ana@example.com",
    });
    expect(deps.verifyAccessToken).toHaveBeenCalledWith("good-token");
    expect(deps.upsertProfile).toHaveBeenCalledWith({
      privy_user_id: "did:privy:ana",
      wallet_pubkey: EMBEDDED,
      email: "ana@example.com",
    });
  });

  it("rejects a missing or malformed header without calling Privy", async () => {
    const { deps, requireUser } = setup([embeddedWallet]);
    for (const header of [undefined, "good-token", "Basic good-token", "Bearer ", "Bearer a b"]) {
      await expectApiError(requireUser(request(header)), "unauthorized");
    }
    expect(deps.verifyAccessToken).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired token", async () => {
    const { deps, requireUser } = setup([embeddedWallet]);
    await expectApiError(requireUser(request("Bearer forged-token")), "unauthorized");
    expect(deps.getUser).not.toHaveBeenCalled();
    expect(deps.upsertProfile).not.toHaveBeenCalled();
  });

  it("fails with no_wallet when the user has no Solana account yet", async () => {
    const { deps, requireUser } = setup([email, ethWallet]);
    await expectApiError(requireUser(request("Bearer good-token")), "no_wallet");
    expect(deps.upsertProfile).not.toHaveBeenCalled();
  });

  it("does not overwrite the stored email when the user has none", async () => {
    const { deps, requireUser } = setup([phantomWallet]);
    await requireUser(request("bearer good-token"));
    expect(deps.upsertProfile).toHaveBeenCalledWith({
      privy_user_id: "did:privy:ana",
      wallet_pubkey: PHANTOM,
    });
  });

  it("propagates profile upsert failures as non-auth errors", async () => {
    const { requireUser } = setup([embeddedWallet], {
      upsertProfile: async () => {
        throw new Error("db down");
      },
    });
    const err = await requireUser(request("Bearer good-token")).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ApiError);
  });
});

describe("pickSolanaPubkey / pickEmail", () => {
  it("prefers the external account over the embedded one", () => {
    expect(pickSolanaPubkey([embeddedWallet, phantomWallet, ethWallet])).toEqual({
      pubkey: PHANTOM,
      all: [EMBEDDED, PHANTOM],
    });
    expect(pickSolanaPubkey([ethWallet]).pubkey).toBeNull();
  });

  it("takes the email login first, then Google", () => {
    expect(pickEmail([google, email])).toBe("ana@example.com");
    expect(pickEmail([google])).toBe("ana@gmail.com");
    expect(pickEmail([embeddedWallet])).toBeNull();
  });
});
