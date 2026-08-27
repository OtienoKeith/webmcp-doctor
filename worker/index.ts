import puppeteer, { type BrowserWorker } from "@cloudflare/puppeteer";
import { isPublicHttpUrl, normalizePublicTarget } from "./url-safety";

type WorkerEnv = {
  ASSETS: Fetcher;
  BROWSER: BrowserWorker;
};

type ScannedTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  exposedTo?: string[];
};

type PageScan = {
  title: string;
  finalUrl: string;
  tools: ScannedTool[];
  humanCapabilities: Array<{ label: string; kind: "form" | "action" | "navigation" }>;
  signals: {
    nativeApi: boolean;
    capturedRegistrations: number;
    declarativeForms: number;
  };
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), { ...init, headers: { ...jsonHeaders, ...init.headers } });
}

async function readTarget(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4096) throw new Error("The scan request is too large.");
  const body = await request.json<{ url?: unknown }>();
  if (typeof body.url !== "string") throw new Error("A website URL is required.");
  return normalizePublicTarget(body.url);
}

function normalizeTool(tool: {
  name?: unknown;
  title?: unknown;
  description?: unknown;
  inputSchema?: unknown;
  annotations?: ScannedTool["annotations"];
  exposedTo?: unknown;
}): ScannedTool | null {
  if (typeof tool.name !== "string" || typeof tool.description !== "string") return null;
  let schema = tool.inputSchema;
  if (typeof schema === "string") {
    try {
      schema = JSON.parse(schema) as Record<string, unknown>;
    } catch {
      schema = { type: "object" };
    }
  }
  return {
    name: tool.name,
    ...(typeof tool.title === "string" && tool.title ? { title: tool.title } : {}),
    description: tool.description,
    inputSchema: schema && typeof schema === "object" ? schema as Record<string, unknown> : { type: "object" },
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
    ...(Array.isArray(tool.exposedTo) && tool.exposedTo.every((origin) => typeof origin === "string") ? { exposedTo: tool.exposedTo } : {}),
  };
}

async function scanPage(target: string, env: WorkerEnv): Promise<PageScan> {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1365, height: 768 });
    await page.setRequestInterception(true);
    page.on("request", (intercepted) => {
      const resourceType = intercepted.resourceType();
      const requestUrl = intercepted.url();
      if (!isPublicHttpUrl(requestUrl) || ["image", "media", "font"].includes(resourceType)) {
        void intercepted.abort();
      } else {
        void intercepted.continue();
      }
    });

    await page.evaluateOnNewDocument(() => {
      type CapturedTool = {
        name?: string;
        title?: string;
        description?: string;
        inputSchema?: unknown;
        annotations?: unknown;
        exposedTo?: unknown;
      };
      const captured: CapturedTool[] = [];
      const hadNativeApi = "modelContext" in document;
      const record = (first: CapturedTool | string, second?: CapturedTool) => {
        const candidate = typeof first === "string" ? { ...(second ?? {}), name: first } : first;
        captured.push({
          name: candidate?.name,
          title: candidate?.title,
          description: candidate?.description,
          inputSchema: candidate?.inputSchema,
          annotations: candidate?.annotations,
          exposedTo: candidate?.exposedTo,
        });
      };
      const shim = {
        registerTool(first: CapturedTool | string, second?: CapturedTool) {
          record(first, second);
          return Promise.resolve();
        },
        unregisterTool() { return Promise.resolve(); },
        getTools() { return Promise.resolve(captured); },
        provideContext(context: { tools?: CapturedTool[] }) {
          for (const tool of context?.tools ?? []) record(tool);
          return Promise.resolve();
        },
        addEventListener() {},
        removeEventListener() {},
      };
      Object.defineProperty(globalThis, "__webmcpDoctorTools", { value: captured, configurable: false });
      Object.defineProperty(globalThis, "__webmcpDoctorHadNative", { value: hadNativeApi, configurable: false });
      if (!("modelContext" in document)) Object.defineProperty(document, "modelContext", { value: shim, configurable: true });
      if (!("modelContext" in navigator)) Object.defineProperty(navigator, "modelContext", { value: shim, configurable: true });
    });

    const response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 15_000 });
    if (!response) throw new Error("The website did not return a document.");
    if (response.status() >= 400) throw new Error(`The website returned HTTP ${response.status()}.`);
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 4_000 }).catch(() => undefined);

    const pageScan = await page.evaluate(async () => {
      type RawTool = {
        name?: string;
        title?: string;
        description?: string;
        inputSchema?: unknown;
        annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
        exposedTo?: string[];
      };
      type ScanDocument = Document & { modelContext?: { getTools?: () => Promise<RawTool[]> } };
      const scanGlobal = globalThis as typeof globalThis & { __webmcpDoctorTools?: RawTool[]; __webmcpDoctorHadNative?: boolean };
      const captured = scanGlobal.__webmcpDoctorTools ?? [];
      let native: RawTool[] = [];
      const context = (document as ScanDocument).modelContext;
      if (context?.getTools) {
        try { native = await context.getTools(); } catch { native = []; }
      }

      const fieldType = (field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
        if (field instanceof HTMLSelectElement) return "string";
        if (field instanceof HTMLTextAreaElement) return "string";
        if (["number", "range"].includes(field.type)) return "number";
        if (field.type === "checkbox") return "boolean";
        return "string";
      };
      const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form[toolname]"));
      const declarative = forms.map((form) => {
        const properties: Record<string, Record<string, unknown>> = {};
        const required: string[] = [];
        for (const field of Array.from(form.elements)) {
          if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) || !field.name) continue;
          const property: Record<string, unknown> = { type: fieldType(field) };
          const description = field.getAttribute("toolparamdescription") ?? field.getAttribute("aria-label") ?? undefined;
          if (description) property.description = description;
          if (field instanceof HTMLSelectElement) property.enum = Array.from(field.options).map((option) => option.value).filter(Boolean);
          properties[field.name] = property;
          if (field.required) required.push(field.name);
        }
        return {
          name: form.getAttribute("toolname") ?? "",
          title: form.getAttribute("tooltitle") ?? undefined,
          description: form.getAttribute("tooldescription") ?? "",
          inputSchema: { type: "object", properties, ...(required.length ? { required } : {}) },
          annotations: { readOnlyHint: false },
        };
      });

      const all = [...native, ...captured, ...declarative];
      const deduped = Array.from(new Map(all.filter((tool) => tool?.name).map((tool) => [tool.name, tool])).values());
      const visibleLabel = (element: Element) => (element.getAttribute("aria-label") ?? element.getAttribute("title") ?? element.textContent ?? "").replace(/\s+/g, " ").trim();
      const humanCapabilities = [
        ...Array.from(document.querySelectorAll<HTMLFormElement>("form")).map((form) => ({
          label: (form.getAttribute("tooltitle") ?? form.getAttribute("aria-label") ?? visibleLabel(form.querySelector("button[type=submit],input[type=submit]") ?? form)) || `Form ${form.id || "workflow"}`,
          kind: "form" as const,
        })),
        ...Array.from(document.querySelectorAll<HTMLButtonElement>("button")).map((button) => ({ label: visibleLabel(button), kind: "action" as const })),
        ...Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((link) => ({ label: visibleLabel(link), kind: "navigation" as const })),
      ].filter((capability) => capability.label.length >= 3 && capability.label.length <= 90);
      const dedupedCapabilities = Array.from(new Map(humanCapabilities.map((capability) => [`${capability.kind}:${capability.label.toLowerCase()}`, capability])).values()).slice(0, 18);
      return {
        title: document.title || new URL(location.href).hostname,
        finalUrl: location.href,
        tools: deduped,
        humanCapabilities: dedupedCapabilities,
        signals: {
          nativeApi: Boolean(scanGlobal.__webmcpDoctorHadNative),
          capturedRegistrations: captured.length,
          declarativeForms: forms.length,
        },
      };
    });

    return {
      ...pageScan,
      tools: pageScan.tools.map(normalizeTool).filter((tool): tool is ScannedTool => tool !== null),
    };
  } finally {
    await browser.close();
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/api/scan") return env.ASSETS.fetch(request);
    if (request.method !== "POST") return json({ error: "Use POST /api/scan with a public website URL." }, { status: 405, headers: { allow: "POST" } });

    try {
      const target = await readTarget(request);
      const cacheKey = new Request(`${url.origin}/api/scan-cache?url=${encodeURIComponent(target)}`);
      const edgeCache = await caches.open("webmcp-doctor-site-scans");
      const cached = await edgeCache.match(cacheKey);
      if (cached) {
        const cachedPayload = await cached.json<Record<string, unknown>>();
        return json({ ...cachedPayload, cached: true });
      }

      const scanned = await scanPage(target, env);
      const payload = { ...scanned, requestedUrl: target, scannedAt: new Date().toISOString(), engine: "cloudflare-browser", cached: false };
      const response = json(payload, { headers: { "cache-control": "public, max-age=0, s-maxage=300" } });
      ctx.waitUntil(edgeCache.put(cacheKey, response.clone()));
      return response;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The website could not be scanned.";
      console.error(JSON.stringify({ event: "site_scan_failed", message }));
      const status = /Enter|URL|Private|public|credentials|large/.test(message) ? 400 : 502;
      return json({ error: message }, { status });
    }
  },
} satisfies ExportedHandler<WorkerEnv>;
