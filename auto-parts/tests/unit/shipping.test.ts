import { describe, expect, it } from "vitest";
import { chargeableWeight, countryList, csvCell, nextShipmentStatuses, volumetricWeight } from "@/lib/shipping";

describe("nextShipmentStatuses", () => {
  it("moves forward only, with failure/return always available", () => {
    expect(nextShipmentStatuses("picked_up", false)).toEqual(["in_transit", "customs_clearance", "out_for_delivery", "delivered", "failed", "returned"]);
  });
  it("allows customs → in transit, and admin-only cancel before pickup", () => {
    expect(nextShipmentStatuses("customs_clearance", false)[0]).toBe("in_transit");
    expect(nextShipmentStatuses("assigned", true)).toContain("cancelled");
    expect(nextShipmentStatuses("assigned", false)).not.toContain("cancelled");
    expect(nextShipmentStatuses("picked_up", true)).not.toContain("cancelled");
  });
  it("carrier cannot skip steps before pickup, and return needs a pickup first", () => {
    expect(nextShipmentStatuses("assigned", false)).toEqual(["accepted", "failed"]);
    expect(nextShipmentStatuses("accepted", false)).toEqual(["picked_up", "failed"]);
    expect(nextShipmentStatuses("assigned", true)).not.toContain("returned");
    expect(nextShipmentStatuses("assigned", true)).toContain("delivered");
  });
  it("offers nothing once closed", () => {
    expect(nextShipmentStatuses("delivered", true)).toEqual([]);
  });
});

describe("weights", () => {
  it("uses the larger of actual and volumetric weight", () => {
    expect(chargeableWeight("12", "18")).toBe(18);
    expect(chargeableWeight(5, null)).toBe(5);
    expect(chargeableWeight(null, null)).toBeNull();
    expect(volumetricWeight(120, 60, 40)).toBe(57.6);
  });
});

describe("countryList", () => {
  it("parses ISO codes and rejects junk", () => {
    expect(countryList("cn, sa  ae،SA")).toEqual(["CN", "SA", "AE"]);
    expect(countryList("China")).toBeNull();
  });
});

describe("csvCell", () => {
  it("quotes and neutralizes formulas but keeps negative numbers", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-10.00")).toBe("-10.00");
    expect(csvCell(null)).toBe("");
  });
});
