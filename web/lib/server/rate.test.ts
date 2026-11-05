import { describe, expect, it } from "vitest";

import { parseCriptoYa } from "./rate";

describe("parseCriptoYa", () => {
  it("takes totalAsk rounded to cents, as a string", () => {
    const body = { ask: 1695.6712, totalAsk: 1704.1496, bid: 1625.6273, totalBid: 1617.4991, time: 1793916191 };
    expect(parseCriptoYa(body, "lemoncash")).toEqual({ rate: "1704.15", exchange: "lemoncash", time: 1793916191 });
  });

  it("rejects missing or non-positive quotes", () => {
    expect(() => parseCriptoYa({ totalAsk: 0 }, "x")).toThrow();
    expect(() => parseCriptoYa({ totalAsk: "1700" }, "x")).toThrow();
    expect(() => parseCriptoYa(null, "x")).toThrow();
  });
});
