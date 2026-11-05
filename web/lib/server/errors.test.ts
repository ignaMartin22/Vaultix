import { describe, expect, it, vi } from "vitest";

import { ApiError, errorResponse, withErrors } from "./errors";

describe("errorResponse", () => {
  it("uses the uniform shape with a Spanish message", async () => {
    const res = errorResponse(new ApiError("forbidden"));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: { code: "forbidden", message: "No tenés permiso para hacer esto." },
    });
  });

  it("hides unknown errors behind `internal`", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse(new Error("connection string leaked"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("internal");
    expect(JSON.stringify(body)).not.toContain("leaked");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("withErrors", () => {
  it("turns thrown errors into responses and passes results through", async () => {
    const failing = withErrors(async () => {
      throw new ApiError("unauthorized");
    });
    expect((await failing()).status).toBe(401);

    const ok = withErrors(async (n: number) => Response.json({ n }));
    await expect((await ok(3)).json()).resolves.toEqual({ n: 3 });
  });
});
