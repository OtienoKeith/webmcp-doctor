import { describe, expect, it } from "vitest";
import { auditTools, axRubric, parseToolManifest } from "@/lib/audit";

const unsafeCheckout = {
  name: "finalizeCart",
  description: "Finalizes the current shopping cart.",
  inputSchema: { type: "object", properties: { shipping: { type: "string" } } },
};

const repairedCheckout = {
  name: "place_order",
  title: "Place order",
  description: "Validates an order preview and only places and charges it after explicit confirmation. Returns an order identifier, status, and recovery guidance for conflicts or retry failures.",
  inputSchema: {
    type: "object",
    properties: {
      shipping: { type: "string", description: "Validated shipping method identifier" },
      mode: { type: "string", enum: ["preview", "execute"], description: "Preview or confirmed execution mode" },
      confirmationToken: { type: "string", description: "Explicit user confirmation token" },
      idempotencyKey: { type: "string", description: "Stable retry key" },
    },
    required: ["shipping", "mode", "idempotencyKey"],
  },
  annotations: { readOnlyHint: false },
};

describe("AX audit engine", () => {
  it("keeps the public rubric at exactly 42 checks", () => {
    expect(axRubric).toHaveLength(42);
    expect(axRubric.filter((item) => item.category === "discoverability")).toHaveLength(11);
    expect(axRubric.filter((item) => item.category === "clarity")).toHaveLength(11);
    expect(axRubric.filter((item) => item.category === "reliability")).toHaveLength(12);
    expect(axRubric.filter((item) => item.category === "safety")).toHaveLength(8);
  });

  it("accepts arrays and MCP-style tools containers", () => {
    const tool = { name: "read_status", description: "Returns current service status for the requested project identifier.", inputSchema: { type: "object", properties: {}, required: [] }, annotations: { readOnlyHint: true } };
    expect(parseToolManifest(JSON.stringify([tool]))).toHaveLength(1);
    expect(parseToolManifest(JSON.stringify({ tools: [tool] }))).toHaveLength(1);
    expect(() => parseToolManifest("{}")).toThrow(/tools array/i);
  });

  it("finds consent and intent defects in an unsafe checkout contract", () => {
    const result = auditTools([unsafeCheckout]);
    expect(result.score).toBeLessThan(65);
    expect(result.checks.find((check) => check.id === "s3")?.status).toBe("failed");
    expect(result.checks.find((check) => check.id === "r1")?.status).toBe("failed");
  });

  it("scores the repaired checkout contract higher", () => {
    const before = auditTools([unsafeCheckout]);
    const after = auditTools([repairedCheckout]);
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.checks.find((check) => check.id === "s3")?.status).toBe("passed");
    expect(after.checks.find((check) => check.id === "r1")?.status).toBe("passed");
  });

  it("requires an untrusted-content boundary for content tools", () => {
    const base = { name: "get_product_reviews", title: "Get product reviews", description: "Returns user-written product review content and a stable result identifier.", inputSchema: { type: "object", properties: { productId: { type: "string", description: "Product resource identifier" } }, required: ["productId"] } };
    expect(auditTools([base]).checks.find((check) => check.id === "s2")?.status).toBe("failed");
    expect(auditTools([{ ...base, annotations: { readOnlyHint: true, untrustedContentHint: true } }]).checks.find((check) => check.id === "s2")?.status).toBe("passed");
  });
});
