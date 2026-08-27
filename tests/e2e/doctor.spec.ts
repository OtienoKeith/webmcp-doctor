import { expect, test, type Page } from "@playwright/test";

const livePayload = {
  title: "Live WebMCP booking",
  requestedUrl: "https://booking.example/",
  finalUrl: "https://booking.example/",
  scannedAt: new Date().toISOString(),
  cached: false,
  signals: { nativeApi: true, capturedRegistrations: 2, declarativeForms: 1 },
  humanCapabilities: [
    { label: "Book consultation", kind: "form" },
    { label: "Cancel booking", kind: "action" },
  ],
  tools: [{
    name: "book_consultation",
    title: "Book consultation",
    description: "Creates a consultation booking after validation and returns a booking status and identifier.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Requested consultation date" },
        idempotencyKey: { type: "string", description: "Stable retry key" },
      },
      required: ["date", "idempotencyKey"],
    },
    annotations: { readOnlyHint: false },
  }],
};

async function mockLiveScan(page: Page) {
  await page.route("**/api/scan", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(livePayload) });
  });
}

async function runLiveScan(page: Page) {
  await page.goto("/");
  await page.getByLabel("WEBSITE URL").fill("https://booking.example/");
  await page.getByRole("button", { name: "Scan site" }).click();
  await expect(page.getByRole("heading", { name: "Live WebMCP booking", exact: true }).first()).toBeVisible();
}

test("renders the essential diagnostics as one real-site report", async ({ page }) => {
  await mockLiveScan(page);
  await runLiveScan(page);
  await expect(page.locator(".sidebar, .mobile-nav")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Is this site ready for agents?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where does the agent contract break?" })).toBeVisible();
  await expect(page.locator(".trace-node")).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "Repair the discovered contract" })).toBeVisible();
  await page.getByRole("button", { name: "Compare repair" }).click();
  await expect(page.getByRole("button", { name: "Compared" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Can agents do what users can?" })).toBeVisible();
  await expect(page.getByText("Book consultation").first()).toBeVisible();
});

test("starts with one real URL input and no fixture controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("WEBSITE URL")).toHaveCount(1);
  await expect(page.getByText("Your report will appear here")).toBeVisible();
  await expect(page.locator("select, textarea")).toHaveCount(0);
});

test("registers native WebMCP tools and lets an agent open real scan evidence", async ({ page }) => {
  await page.addInitScript(() => {
    const registered: Array<{ name: string; execute: (input: { toolName?: string }) => Promise<string>; inputSchema: Record<string, unknown> }> = [];
    Object.defineProperty(window, "__doctorTools", { value: registered });
    Object.defineProperty(Document.prototype, "modelContext", {
      configurable: true,
      get() {
        return {
          registerTool: async (tool: typeof registered[number]) => { registered.push(tool); },
          getTools: async () => registered.map((tool) => ({ ...tool, inputSchema: JSON.stringify(tool.inputSchema) })),
        };
      },
    });
  });
  await mockLiveScan(page);
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __doctorTools: unknown[] }).__doctorTools.length)).toBe(7);
  await runLiveScan(page);
  const response = await page.evaluate(async () => {
    const tools = (window as unknown as { __doctorTools: Array<{ name: string; execute: (input: { toolName?: string }) => Promise<string> }> }).__doctorTools;
    return tools.findLast((tool) => tool.name === "trace_agent_failure")!.execute({ toolName: "book_consultation" });
  });
  expect(JSON.parse(response)).toMatchObject({ ok: true, section: "failure", uiUpdated: true, toolCount: 1 });
  await expect(page.getByText("Agent opened Trace agent failure for Live WebMCP booking.")).toBeVisible();
});
