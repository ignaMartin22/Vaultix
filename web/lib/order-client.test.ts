import { describe, expect, it } from "vitest";

import { saveShippingAddress } from "./listings-client";
import { addEvidence, getBuyerAddress, getShipment, listEvidence, saveShipment } from "./order-client";

const noToken = async () => null;

describe("order client (mock mode)", () => {
  it("hands the seller the address the buyer saved", async () => {
    const address = {
      fullName: "Ana",
      phone: "11",
      street: "Corrientes 1234",
      city: "CABA",
      province: "Buenos Aires",
      postalCode: "C1043",
      notes: "",
    };
    await saveShippingAddress("pda-1", address, noToken);
    await expect(getBuyerAddress("pda-1", noToken)).resolves.toEqual(address);
    await expect(getBuyerAddress("pda-2", noToken)).resolves.toBeNull();
  });

  it("stores the shipment normalized", async () => {
    await saveShipment("pda-1", "andreani", "and 48213", noToken);
    await expect(getShipment("pda-1", noToken)).resolves.toEqual({
      carrier: "andreani",
      trackingNumber: "AND48213",
      verified: true,
    });
  });

  it("keeps evidence per order, in order", async () => {
    await addEvidence("pda-9", "buyer", { kind: "note", note: "Llegó roto" }, noToken);
    await addEvidence("pda-9", "seller", { kind: "note", note: "Salió bien embalado" }, noToken);
    const items = await listEvidence("pda-9", noToken);
    expect(items.map((i) => [i.uploader, i.note])).toEqual([
      ["buyer", "Llegó roto"],
      ["seller", "Salió bien embalado"],
    ]);
    await expect(listEvidence("other", noToken)).resolves.toEqual([]);
  });
});
