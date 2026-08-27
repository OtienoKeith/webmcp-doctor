import { expect, test } from "@playwright/test";

test("runs the guided diagnostic flow into Failure X-Ray", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Audit a live WebMCP website" })).toBeVisible();
  await page.getByRole("button", { name: "Start 3-min demo" }).click();
  await expect(page.getByText("Start with the AX Health Score")).toBeVisible();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByRole("heading", { name: "See exactly where the agent broke" })).toBeVisible();
  await expect(page.locator(".trace-node")).toHaveCount(6);
});

test("audits tools discovered from a live website URL", async ({ page }) => {
  await page.route("**/api/scan", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        title: "Live WebMCP booking",
        requestedUrl: "https://booking.example/",
        finalUrl: "https://booking.example/",
        scannedAt: new Date().toISOString(),
        cached: false,
        signals: { nativeApi: true, capturedRegistrations: 2, declarativeForms: 1 },
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
      }),
    });
  });
  await page.goto("/");
  await page.getByLabel("WEBSITE TO AUDIT").fill("https://booking.example/");
  await page.getByRole("button", { name: "Scan live site" }).click();
  await expect(page.getByRole("heading", { name: "Live WebMCP booking" })).toBeVisible();
  await expect(page.getByText("1 tool · live website")).toBeVisible();
  await expect(page.getByText("2 imperative · 1 declarative")).toBeVisible();
});

test("audits an imported manifest with all 42 inspectable checks", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Live Scanner" }).click();
  await page.getByLabel("WebMCP tool manifest").fill(JSON.stringify({ tools: [{ name: "finalizeCart", description: "Finalizes cart.", inputSchema: { type: "object", properties: { shipping: { type: "string" } } } }] }));
  await page.getByRole("button", { name: "Audit manifest" }).click();
  await expect(page.getByText("Imported manifest")).toBeVisible();
  await expect(page.locator(".check-row")).toHaveCount(42);
  await expect(page.getByText("AX rubric v1.0 · 42 checks")).toBeVisible();
});

test("registers native WebMCP tools and lets an agent update the UI", async ({ page }) => {
  await page.addInitScript(() => {
    const registered: Array<{ name: string; execute: (input: { scenarioId?: string }) => Promise<string>; inputSchema: Record<string, unknown> }> = [];
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
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __doctorTools: unknown[] }).__doctorTools.length)).toBe(7);
  const response = await page.evaluate(async () => {
    const tools = (window as unknown as { __doctorTools: Array<{ name: string; execute: (input: { scenarioId: string }) => Promise<string> }> }).__doctorTools;
    return tools.find((tool) => tool.name === "trace_agent_failure")!.execute({ scenarioId: "commerce" });
  });
  expect(JSON.parse(response)).toMatchObject({ ok: true, scenario: "commerce", view: "xray", uiUpdated: true });
  await expect(page.getByRole("heading", { name: "See exactly where the agent broke" })).toBeVisible();
});
