import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env";

const VALID = {
  NEXT_PUBLIC_PRIVY_APP_ID: "app-id",
  PRIVY_APP_SECRET: "secret",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
};

describe("parseServerEnv", () => {
  it("applies the documented defaults", () => {
    expect(parseServerEnv(VALID)).toMatchObject({
      privyAppId: "app-id",
      supabaseUrl: "https://abc.supabase.co",
      sponsorDailyLimit: 20,
      criptoyaExchange: "lemoncash",
      feePayerSecretKey: undefined,
    });
  });

  it("lists every missing required variable at once", () => {
    expect(() => parseServerEnv({ PRIVY_APP_SECRET: "x", SUPABASE_SERVICE_ROLE_KEY: " " })).toThrow(
      /NEXT_PUBLIC_PRIVY_APP_ID is missing[\s\S]*NEXT_PUBLIC_SUPABASE_URL is missing[\s\S]*SUPABASE_SERVICE_ROLE_KEY is missing/,
    );
  });

  it("validates the sponsor limit and the Supabase URL", () => {
    expect(() => parseServerEnv({ ...VALID, SPONSOR_DAILY_LIMIT: "0" })).toThrow(/SPONSOR_DAILY_LIMIT/);
    expect(() => parseServerEnv({ ...VALID, SPONSOR_DAILY_LIMIT: "2.5" })).toThrow(/SPONSOR_DAILY_LIMIT/);
    expect(() => parseServerEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: "abc.supabase.co" })).toThrow(
      /http\(s\)/,
    );
    expect(parseServerEnv({ ...VALID, SPONSOR_DAILY_LIMIT: "50" }).sponsorDailyLimit).toBe(50);
  });
});
