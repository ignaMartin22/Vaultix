import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BRAND, BRAND_VARS } from "./brand";

describe("BRAND", () => {
  it("matches styles/tokens.css", () => {
    const css = readFileSync(join(__dirname, "..", "styles", "tokens.css"), "utf8");
    for (const [key, hex] of Object.entries(BRAND)) {
      const name = BRAND_VARS[key as keyof typeof BRAND];
      const match = new RegExp(`${name}:\s*(#[0-9A-Fa-f]{6})`).exec(css);
      expect(match?.[1]?.toUpperCase(), name).toBe(hex.toUpperCase());
    }
  });
});
