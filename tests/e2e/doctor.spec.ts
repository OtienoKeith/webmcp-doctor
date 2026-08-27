import { expect, test } from "@playwright/test";

test("runs the guided judge flow into Failure X-Ray", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Is this website ready for agents?" })).toBeVisible();
  await page.getByRole("button", { name: "Start 3-min demo" }).click();
  await expect(page.getByText("Start with the AX Health Score")).toBeVisible();
  await page.getByRole("button", { name: /Next wow factor/ }).click();
  await expect(page.getByRole("heading", { name: "See exactly where the agent broke" })).toBeVisible();
  await expect(page.locator(".trace-node")).toHaveCount(6);
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
