import { describe, expect, it } from "vitest";
import { isPublicHttpUrl, normalizePublicTarget } from "../worker/url-safety";

describe("real-site scan URL safety", () => {
  it("accepts and normalizes public HTTP(S) targets", () => {
    expect(normalizePublicTarget(" https://example.com/tools#section ")).toBe("https://example.com/tools");
    expect(isPublicHttpUrl("http://example.org")).toBe(true);
  });

  it.each([
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://10.0.0.2",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.8",
    "http://[::1]",
    "file:///etc/passwd",
  ])("blocks non-public target %s", (target) => {
    expect(isPublicHttpUrl(target)).toBe(false);
  });
});
