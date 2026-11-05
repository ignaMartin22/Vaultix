import { describe, expect, it, vi } from "vitest";

import { apiFetch, ApiClientError, sponsorTransaction } from "./api";

const token = async () => "tok";

function fetchReturning(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

async function caught(promise: Promise<unknown>) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiClientError);
  return err as ApiClientError;
}

describe("apiFetch", () => {
  it("sends the bearer token and JSON body", async () => {
    const fetchImpl = fetchReturning(200, { signature: "abc" });
    await expect(sponsorTransaction("AQID", token, fetchImpl)).resolves.toEqual({ signature: "abc" });
    const [path, init] = fetchImpl.mock.calls[0];
    expect(path).toBe("/api/tx/sponsor");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ authorization: "Bearer tok", "content-type": "application/json" });
    expect(init?.body).toBe(JSON.stringify({ transaction: "AQID" }));
  });

  it("surfaces the uniform error body", async () => {
    const fetchImpl = fetchReturning(429, { error: { code: "rate_limited", message: "Probá mañana." } });
    const err = await caught(apiFetch("/api/x", { fetchImpl }));
    expect([err.code, err.message, err.status]).toEqual(["rate_limited", "Probá mañana.", 429]);
  });

  it("handles network failures, odd bodies and missing sessions", async () => {
    const offline = vi.fn<typeof fetch>(async () => Promise.reject(new TypeError("Failed to fetch")));
    expect((await caught(apiFetch("/api/x", { fetchImpl: offline }))).code).toBe("network");

    const html = vi.fn<typeof fetch>(async () => new Response("<html>", { status: 502 }));
    expect((await caught(apiFetch("/api/x", { fetchImpl: html }))).code).toBe("internal");

    const noSession = await caught(apiFetch("/api/x", { getAccessToken: async () => null, fetchImpl: html }));
    expect(noSession.code).toBe("unauthorized");
    expect(html).toHaveBeenCalledTimes(1);
  });
});
