import { describe, expect, it } from "vitest";
import { isCapability, safeFileName, sniffDocument } from "@/lib/partners";

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("sniffDocument", () => {
  it("recognizes PDF, PNG and JPEG by content", () => {
    expect(sniffDocument(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))?.mime).toBe("application/pdf");
    expect(sniffDocument(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe("image/png");
    expect(sniffDocument(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
  });
  it("rejects anything else, even with a .pdf name", () => {
    expect(sniffDocument(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(sniffDocument(bytes(0x4d, 0x5a))).toBeNull(); // exe
    expect(sniffDocument(new Uint8Array())).toBeNull();
  });
});

describe("helpers", () => {
  it("cleans file names", () => {
    expect(safeFileName("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(safeFileName("السجل التجاري.pdf")).toBe("السجل التجاري.pdf");
    expect(safeFileName("   ")).toBe("file");
  });
  it("accepts only known capabilities", () => {
    expect(isCapability("supplier")).toBe(true);
    expect(isCapability("admin")).toBe(false);
  });
});
