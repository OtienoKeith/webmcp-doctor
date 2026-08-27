export type MetricKey = "discoverability" | "clarity" | "reliability" | "safety";

export type Metric = {
  key: MetricKey;
  label: string;
  score: number;
  passed: number;
  total: number;
  summary: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
};

export type Scenario = {
  id: string;
  label: string;
  shortLabel: string;
  category: string;
  company: string;
  goal: string;
  score: number;
  repairedScore: number;
  severity: "critical" | "high" | "medium";
  rootCause: string;
  impact: string;
  metrics: Metric[];
  findings: Array<{
    severity: "critical" | "high" | "medium";
    title: string;
    detail: string;
  }>;
  toolBefore: ToolDefinition;
  toolAfter: ToolDefinition;
  trace: Array<{
    id: string;
    label: string;
    detail: string;
    state: "passed" | "warning" | "failed";
  }>;
  humanPath: Array<{ label: string; detail: string; shared?: boolean }>;
  agentPath: Array<{ label: string; detail: string; state: "passed" | "warning" | "failed" }>;
  gap: string;
  fixSummary: string;
  beforeTests: { passed: number; total: number; successRate: number; median: string };
  afterTests: { passed: number; total: number; successRate: number; median: string };
};

export const scenarios: Scenario[] = [
  {
    id: "deploy",
    label: "Deploy a production release",
    shortLabel: "Deployment",
    category: "DEPLOYMENT",
    company: "Northstar Deploy",
    goal: "Deploy release v2.8.1 to production without interrupting traffic.",
    score: 58,
    repairedScore: 91,
    severity: "critical",
    rootCause: "The tool hides a destructive production action behind an ambiguous verb and accepts an unbounded environment string.",
    impact: "Agent selected staging, but a fallback silently targeted production. No preview or confirmation gate existed.",
    metrics: [
      { key: "discoverability", label: "Discoverability", score: 82, passed: 9, total: 11, summary: "Tool is registered and task-relevant, but aliases are missing." },
      { key: "clarity", label: "Tool clarity", score: 46, passed: 5, total: 11, summary: "Side effects and environment behavior are not declared." },
      { key: "reliability", label: "Reliability", score: 61, passed: 7, total: 12, summary: "No idempotency key, preview, or rollback handle." },
      { key: "safety", label: "Safety", score: 38, passed: 3, total: 8, summary: "Production mutation executes without explicit confirmation." },
    ],
    findings: [
      { severity: "critical", title: "Undeclared destructive side effect", detail: "`ship` immediately changes live traffic, but the description reads like a packaging action." },
      { severity: "high", title: "Free-form target", detail: "`where` accepts any string and falls back to production when the value is unknown." },
      { severity: "medium", title: "No recovery contract", detail: "The response omits deployment ID, rollback token, and partial-failure state." },
    ],
    toolBefore: {
      name: "ship",
      description: "Ships the selected version.",
      inputSchema: { type: "object", properties: { version: { type: "string" }, where: { type: "string" } } },
    },
    toolAfter: {
      name: "deploy_release",
      description: "Creates a deployment preview or, only with explicit confirmation, shifts traffic to a validated target environment. Returns deployment and rollback IDs.",
      inputSchema: {
        type: "object",
        properties: {
          version: { type: "string", description: "Exact immutable release version, for example v2.8.1" },
          environment: { type: "string", enum: ["staging", "production"], description: "Validated deployment target" },
          mode: { type: "string", enum: ["preview", "execute"], default: "preview" },
          confirmationToken: { type: "string", description: "Required only for production execution" },
          idempotencyKey: { type: "string", description: "Prevents duplicate deployments on retry" },
        },
        required: ["version", "environment", "mode", "idempotencyKey"],
      },
    },
    trace: [
      { id: "goal", label: "Goal understood", detail: "Release v2.8.1 safely", state: "passed" },
      { id: "discover", label: "Tool discovered", detail: "Found `ship`", state: "passed" },
      { id: "select", label: "Tool selected", detail: "Weak semantic match", state: "warning" },
      { id: "input", label: "Input formed", detail: "where: prod-eu", state: "warning" },
      { id: "execute", label: "Execution", detail: "Fallback → production", state: "failed" },
      { id: "root", label: "Root cause", detail: "Unsafe contract", state: "failed" },
    ],
    humanPath: [
      { label: "Open Releases", detail: "Production context visible", shared: true },
      { label: "Choose v2.8.1", detail: "Version metadata displayed", shared: true },
      { label: "Preview rollout", detail: "Diff + health checks shown" },
      { label: "Type PRODUCTION", detail: "Explicit safety gate" },
      { label: "Watch rollout", detail: "Rollback remains available" },
    ],
    agentPath: [
      { label: "Discover `ship`", detail: "Only plausible tool", state: "passed" },
      { label: "Infer target", detail: "Uses prod-eu", state: "warning" },
      { label: "Call tool", detail: "No preview mode", state: "failed" },
      { label: "Receive `ok`", detail: "No rollout or rollback ID", state: "failed" },
    ],
    gap: "The human UI has two safety affordances and a recovery handle that the agent contract does not expose.",
    fixSummary: "Make intent explicit, constrain the target, separate preview from execution, and return recovery handles.",
    beforeTests: { passed: 7, total: 12, successRate: 58, median: "2.4s" },
    afterTests: { passed: 11, total: 12, successRate: 92, median: "1.9s" },
  },
  {
    id: "cloud",
    label: "Rotate a compromised API key",
    shortLabel: "Cloud console",
    category: "CLOUD",
    company: "Nimbus Cloud",
    goal: "Rotate only the compromised billing API key while keeping dependent services online.",
    score: 64,
    repairedScore: 93,
    severity: "high",
    rootCause: "The rotation tool cannot identify downstream consumers or overlap old and new credentials during migration.",
    impact: "The key rotated successfully, but three dependent workloads immediately lost authentication.",
    metrics: [
      { key: "discoverability", label: "Discoverability", score: 88, passed: 10, total: 11, summary: "The tool is easy to find for rotation tasks." },
      { key: "clarity", label: "Tool clarity", score: 70, passed: 8, total: 11, summary: "The target is clear; dependency impact is not." },
      { key: "reliability", label: "Reliability", score: 44, passed: 5, total: 12, summary: "No overlap window, dependency list, or rollback." },
      { key: "safety", label: "Safety", score: 55, passed: 5, total: 8, summary: "Mutation is scoped but irreversible." },
    ],
    findings: [
      { severity: "high", title: "Invisible dependency blast radius", detail: "The human console shows three consumers; the tool returns none." },
      { severity: "high", title: "Instant revocation", detail: "Rotation invalidates the old key before clients can migrate." },
      { severity: "medium", title: "Irreversible response", detail: "Only a success boolean is returned; there is no recovery window." },
    ],
    toolBefore: {
      name: "rotateKey",
      description: "Rotate an API key.",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
    toolAfter: {
      name: "plan_or_rotate_api_key",
      description: "Inspects consumers and plans a safe credential rotation. Execution creates a timed overlap window and returns migration status plus a rollback deadline.",
      inputSchema: {
        type: "object",
        properties: {
          keyId: { type: "string", description: "Exact credential resource ID" },
          mode: { type: "string", enum: ["inspect", "execute"], default: "inspect" },
          overlapMinutes: { type: "integer", minimum: 5, maximum: 1440, default: 60 },
          idempotencyKey: { type: "string" },
        },
        required: ["keyId", "mode"],
      },
    },
    trace: [
      { id: "goal", label: "Goal understood", detail: "Rotate without outage", state: "passed" },
      { id: "discover", label: "Tool discovered", detail: "Found `rotateKey`", state: "passed" },
      { id: "select", label: "Tool selected", detail: "High semantic match", state: "passed" },
      { id: "input", label: "Input formed", detail: "Key ID valid", state: "passed" },
      { id: "execute", label: "Execution", detail: "3 consumers revoked", state: "failed" },
      { id: "root", label: "Root cause", detail: "Dependencies hidden", state: "failed" },
    ],
    humanPath: [
      { label: "Open credential", detail: "Scope and owner visible", shared: true },
      { label: "Review consumers", detail: "3 workloads listed" },
      { label: "Choose overlap", detail: "60-minute migration window" },
      { label: "Rotate", detail: "Old key remains valid temporarily" },
      { label: "Track migration", detail: "Per-consumer status" },
    ],
    agentPath: [
      { label: "Find `rotateKey`", detail: "Clear tool match", state: "passed" },
      { label: "Pass key ID", detail: "Schema-valid", state: "passed" },
      { label: "Rotate instantly", detail: "Consumers not disclosed", state: "failed" },
      { label: "Receive true", detail: "No migration state", state: "failed" },
    ],
    gap: "Dependency inspection, staged rollout, and migration telemetry exist for people but disappear in the tool interface.",
    fixSummary: "Expose dependency discovery and a reversible overlap window before revocation.",
    beforeTests: { passed: 8, total: 12, successRate: 67, median: "1.4s" },
    afterTests: { passed: 12, total: 12, successRate: 100, median: "1.6s" },
  },
  {
    id: "commerce",
    label: "Review a cart before checkout",
    shortLabel: "E-commerce",
    category: "COMMERCE",
    company: "Mercury Market",
    goal: "Review the final cart total and shipping choice without placing the order.",
    score: 42,
    repairedScore: 94,
    severity: "critical",
    rootCause: "`finalizeCart` sounds like a read or preparation step but immediately charges the customer.",
    impact: "The agent intended to summarize the cart and instead placed a $486.20 order.",
    metrics: [
      { key: "discoverability", label: "Discoverability", score: 76, passed: 8, total: 11, summary: "The tool is visible but overlaps with `getCart`." },
      { key: "clarity", label: "Tool clarity", score: 28, passed: 3, total: 11, summary: "Name and description conceal a purchase." },
      { key: "reliability", label: "Reliability", score: 53, passed: 6, total: 12, summary: "Duplicate calls can create duplicate orders." },
      { key: "safety", label: "Safety", score: 14, passed: 1, total: 8, summary: "Payment executes without confirmation or amount bound." },
    ],
    findings: [
      { severity: "critical", title: "Ambiguous finalization", detail: "The implementation places an order, but neither name nor description says purchase or charge." },
      { severity: "critical", title: "No consent boundary", detail: "The tool has no preview mode or user-approved checkout token." },
      { severity: "high", title: "Unbounded charge", detail: "The request does not bind the customer-approved expected total." },
    ],
    toolBefore: {
      name: "finalizeCart",
      description: "Finalizes the current shopping cart.",
      inputSchema: { type: "object", properties: { shipping: { type: "string" } } },
    },
    toolAfter: {
      name: "place_order",
      description: "Places and charges an order only after a separate cart preview and explicit user approval. Rejects if the approved total or cart version changed.",
      inputSchema: {
        type: "object",
        properties: {
          cartVersion: { type: "string", description: "Version returned by preview_cart" },
          shippingMethodId: { type: "string" },
          expectedTotal: { type: "number", description: "Exact total explicitly approved by the user" },
          approvalToken: { type: "string", description: "Single-use token from the confirmation UI" },
          idempotencyKey: { type: "string" },
        },
        required: ["cartVersion", "shippingMethodId", "expectedTotal", "approvalToken", "idempotencyKey"],
      },
    },
    trace: [
      { id: "goal", label: "Goal understood", detail: "Review, do not buy", state: "passed" },
      { id: "discover", label: "Tool discovered", detail: "2 cart tools", state: "passed" },
      { id: "select", label: "Tool selected", detail: "Picked `finalizeCart`", state: "warning" },
      { id: "input", label: "Input formed", detail: "shipping: express", state: "passed" },
      { id: "execute", label: "Execution", detail: "Card charged $486.20", state: "failed" },
      { id: "root", label: "Root cause", detail: "Intent misrepresented", state: "failed" },
    ],
    humanPath: [
      { label: "Open cart", detail: "Items and subtotal", shared: true },
      { label: "Choose shipping", detail: "Price updates visibly", shared: true },
      { label: "Review order", detail: "Full total, address, returns" },
      { label: "Place order", detail: "Explicit charged amount" },
    ],
    agentPath: [
      { label: "Get cart", detail: "Subtotal only", state: "passed" },
      { label: "Select finalize", detail: "Interprets as review", state: "warning" },
      { label: "Pass shipping", detail: "No total or consent", state: "warning" },
      { label: "Order placed", detail: "Unexpected charge", state: "failed" },
    ],
    gap: "The UI clearly separates review from purchase; the agent surface collapses both into one ambiguous mutation.",
    fixSummary: "Split preview and purchase, name the charge explicitly, and bind execution to approved cart state.",
    beforeTests: { passed: 5, total: 12, successRate: 42, median: "2.1s" },
    afterTests: { passed: 12, total: 12, successRate: 100, median: "2.0s" },
  },
  {
    id: "saas",
    label: "Invite a team from a CSV",
    shortLabel: "SaaS workspace",
    category: "SAAS",
    company: "Orbit Workspace",
    goal: "Invite 24 teammates with the correct roles and safely retry any transient failures.",
    score: 71,
    repairedScore: 96,
    severity: "high",
    rootCause: "The bulk invite contract returns one boolean, hiding partial failures and making retries duplicate successful invitations.",
    impact: "A retry sent 19 duplicate invitations while five failed addresses remained unexplained.",
    metrics: [
      { key: "discoverability", label: "Discoverability", score: 91, passed: 10, total: 11, summary: "Strong name, metadata, and task match." },
      { key: "clarity", label: "Tool clarity", score: 78, passed: 9, total: 11, summary: "Inputs are clear, but response semantics are vague." },
      { key: "reliability", label: "Reliability", score: 37, passed: 4, total: 12, summary: "No per-item result, idempotency, or retry guidance." },
      { key: "safety", label: "Safety", score: 74, passed: 6, total: 8, summary: "Roles are constrained; domain policy is not exposed." },
    ],
    findings: [
      { severity: "high", title: "Partial success collapsed", detail: "One boolean hides which of 24 invitations were accepted, rejected, or retriable." },
      { severity: "high", title: "Retry duplicates side effects", detail: "The tool has no batch or row-level idempotency key." },
      { severity: "medium", title: "Policy discovered too late", detail: "Allowed email domains are enforced only during execution." },
    ],
    toolBefore: {
      name: "bulk_invite",
      description: "Invite a list of people to the workspace.",
      inputSchema: { type: "object", properties: { emails: { type: "array", items: { type: "string" } }, role: { type: "string" } }, required: ["emails"] },
    },
    toolAfter: {
      name: "validate_or_invite_workspace_members",
      description: "Validates workspace invitation policy or sends idempotent invitations. Returns a result for every row with success, permanent failure, or safe-to-retry status.",
      inputSchema: {
        type: "object",
        properties: {
          members: { type: "array", maxItems: 100, items: { type: "object", properties: { email: { type: "string", format: "email" }, role: { type: "string", enum: ["member", "admin", "viewer"] }, rowKey: { type: "string" } }, required: ["email", "role", "rowKey"] } },
          mode: { type: "string", enum: ["validate", "send"], default: "validate" },
          batchId: { type: "string", description: "Stable idempotency key across retries" },
        },
        required: ["members", "mode", "batchId"],
      },
    },
    trace: [
      { id: "goal", label: "Goal understood", detail: "Invite 24 safely", state: "passed" },
      { id: "discover", label: "Tool discovered", detail: "Found bulk_invite", state: "passed" },
      { id: "select", label: "Tool selected", detail: "Exact match", state: "passed" },
      { id: "input", label: "Input formed", detail: "24 emails + role", state: "passed" },
      { id: "execute", label: "Execution", detail: "Returns false", state: "failed" },
      { id: "root", label: "Root cause", detail: "Partial state hidden", state: "failed" },
    ],
    humanPath: [
      { label: "Upload CSV", detail: "24 rows parsed", shared: true },
      { label: "Map roles", detail: "Per-row preview", shared: true },
      { label: "Validate", detail: "5 policy issues marked" },
      { label: "Send 19", detail: "Valid subset confirmed" },
      { label: "Fix 5 rows", detail: "Only failures retried" },
    ],
    agentPath: [
      { label: "Call bulk_invite", detail: "24 addresses", state: "passed" },
      { label: "Receive false", detail: "No row state", state: "failed" },
      { label: "Retry all", detail: "19 duplicates", state: "failed" },
    ],
    gap: "The human workflow previews and validates each row; the tool erases row-level state and safe retry boundaries.",
    fixSummary: "Expose validation, row-level outcomes, and stable idempotency keys.",
    beforeTests: { passed: 8, total: 12, successRate: 67, median: "3.8s" },
    afterTests: { passed: 12, total: 12, successRate: 100, median: "3.4s" },
  },
];

export const metricWeights: Record<MetricKey, number> = {
  discoverability: 25,
  clarity: 30,
  reliability: 25,
  safety: 20,
};

export function getScenario(id?: string) {
  return scenarios.find((scenario) => scenario.id === id) ?? scenarios[0];
}
