import type { MetricKey, Scenario, ToolDefinition } from "@/lib/scenarios";

export type AuditableTool = ToolDefinition & {
  title?: string;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  exposedTo?: string[];
};

export type AuditStatus = "passed" | "warning" | "failed";

export type AuditCheck = {
  id: string;
  category: MetricKey;
  label: string;
  status: AuditStatus;
  evidence: string;
  remediation: string;
};

export type AuditResult = {
  source: "manifest" | "native" | "remote" | "demo";
  label: string;
  score: number;
  toolCount: number;
  checks: AuditCheck[];
  categoryScores: Record<MetricKey, number>;
  auditedAt: string;
};

type RubricItem = {
  id: string;
  category: MetricKey;
  label: string;
  remediation: string;
  evaluate: (tools: AuditableTool[]) => { status: AuditStatus; evidence: string };
};

const mutationPattern = /(create|update|delete|remove|rotate|deploy|ship|send|invite|purchase|charge|place|reset|finalize|execute|write|change)/i;
const explicitMutationDescriptionPattern = /(create|update|delete|remove|rotate|deploy|shift|send|invite|purchase|charge|place|reset|revoke|write|change)/i;
const riskyPattern = /(delete|remove|rotate|deploy|ship|purchase|charge|place|finalize|reset|revoke|production|payment)/i;
const vaguePattern = /^(do|run|handle|process|finalize|ship|manage|action)$/i;
const sensitivePattern = /(token|password|secret|card|ssn|passport|key|credential)/i;

function schemas(tools: AuditableTool[]) {
  return tools.map((tool) => (tool.inputSchema ?? {}) as Record<string, unknown>);
}

function properties(tool: AuditableTool) {
  const schema = (tool.inputSchema ?? {}) as { properties?: Record<string, { description?: string; type?: string; enum?: unknown[]; maxItems?: number }> };
  return schema.properties ?? {};
}

function all(tools: AuditableTool[], predicate: (tool: AuditableTool) => boolean) {
  return tools.length > 0 && tools.every(predicate);
}

function result(status: AuditStatus, evidence: string) {
  return { status, evidence };
}

export const axRubric: RubricItem[] = [
  // Discoverability · 11 checks
  { id: "d1", category: "discoverability", label: "At least one tool is registered", remediation: "Register task-relevant tools with document.modelContext.", evaluate: (t) => result(t.length ? "passed" : "failed", t.length ? `${t.length} tool${t.length === 1 ? "" : "s"} found.` : "No tools found.") },
  { id: "d2", category: "discoverability", label: "Every tool has a stable name", remediation: "Give every tool a non-empty, stable identifier.", evaluate: (t) => result(all(t, (x) => Boolean(x.name?.trim())) ? "passed" : "failed", "Checked all tool names for empty values.") },
  { id: "d3", category: "discoverability", label: "Tool names are unique", remediation: "Remove duplicate names so agent selection is deterministic.", evaluate: (t) => result(new Set(t.map((x) => x.name)).size === t.length && t.length > 0 ? "passed" : "failed", `${new Set(t.map((x) => x.name)).size}/${t.length} names are unique.`) },
  { id: "d4", category: "discoverability", label: "Names use agent-readable words", remediation: "Replace abbreviations and generic verbs with task language.", evaluate: (t) => result(all(t, (x) => x.name.length >= 5 && !vaguePattern.test(x.name)) ? "passed" : "warning", "Checked names for vague verbs and abbreviations.") },
  { id: "d5", category: "discoverability", label: "Display titles are available", remediation: "Add a concise title for browser and assistive UIs.", evaluate: (t) => result(all(t, (x) => Boolean(x.title)) ? "passed" : "warning", `${t.filter((x) => x.title).length}/${t.length} tools include titles.`) },
  { id: "d6", category: "discoverability", label: "Descriptions are present", remediation: "Describe the user goal each tool satisfies.", evaluate: (t) => result(all(t, (x) => Boolean(x.description?.trim())) ? "passed" : "failed", `${t.filter((x) => x.description?.trim()).length}/${t.length} descriptions present.`) },
  { id: "d7", category: "discoverability", label: "Descriptions contain task language", remediation: "Use the nouns and verbs a user would put in a goal.", evaluate: (t) => result(all(t, (x) => x.description.split(/\s+/).length >= 6) ? "passed" : "warning", "Short descriptions are difficult to match against goals.") },
  { id: "d8", category: "discoverability", label: "Input schemas are declared", remediation: "Publish JSON Schema for every tool input.", evaluate: (t) => result(all(t, (x) => (x.inputSchema as { type?: string })?.type === "object") ? "passed" : "failed", `${schemas(t).filter((x) => x.type === "object").length}/${t.length} object schemas found.`) },
  { id: "d9", category: "discoverability", label: "Parameters have descriptions", remediation: "Describe the meaning and expected format of every parameter.", evaluate: (t) => { const props = t.flatMap((x) => Object.values(properties(x))); return result(props.length > 0 && props.every((p) => p.description) ? "passed" : "warning", `${props.filter((p) => p.description).length}/${props.length} parameters are described.`); } },
  { id: "d10", category: "discoverability", label: "Tool names do not overlap semantically", remediation: "Differentiate tools that compete for the same goal.", evaluate: (t) => { const verbs = t.map((x) => x.name.split(/[_-]/)[0]); return result(new Set(verbs).size === verbs.length ? "passed" : "warning", "Compared leading action verbs across the registry."); } },
  { id: "d11", category: "discoverability", label: "Outcome is discoverable from metadata", remediation: "State the returned outcome in the tool description.", evaluate: (t) => result(all(t, (x) => /(return|result|status|preview|list|report|opens|updates)/i.test(x.description)) ? "passed" : "warning", "Checked descriptions for an explicit outcome contract.") },

  // Clarity · 11 checks
  { id: "c1", category: "clarity", label: "Names use snake_case", remediation: "Use predictable snake_case names for agent tools.", evaluate: (t) => result(all(t, (x) => /^[a-z][a-z0-9_]*$/.test(x.name)) ? "passed" : "warning", "Validated naming convention.") },
  { id: "c2", category: "clarity", label: "Names state the real action", remediation: "Name mutations explicitly: place_order, delete_project, or rotate_key.", evaluate: (t) => result(all(t, (x) => { const firstVerb = x.name.replace(/([a-z])([A-Z])/g, "$1_$2").split(/[_-]/)[0]; return !vaguePattern.test(firstVerb); }) ? "passed" : "failed", "Checked for ambiguous action verbs.") },
  { id: "c3", category: "clarity", label: "Descriptions declare side effects", remediation: "Say exactly what changes, sends, charges, or deletes.", evaluate: (t) => result(all(t, (x) => !mutationPattern.test(x.name) || explicitMutationDescriptionPattern.test(x.description)) ? "passed" : "failed", "Compared mutation names with declared behavior.") },
  { id: "c4", category: "clarity", label: "Descriptions are sufficiently specific", remediation: "Include scope, preconditions, outcome, and important exclusions.", evaluate: (t) => result(all(t, (x) => x.description.length >= 60) ? "passed" : "warning", "Descriptions under 60 characters were flagged.") },
  { id: "c5", category: "clarity", label: "Every parameter declares a type", remediation: "Add JSON Schema types for every property.", evaluate: (t) => { const props = t.flatMap((x) => Object.values(properties(x))); return result(props.length > 0 && props.every((p) => p.type) ? "passed" : "failed", `${props.filter((p) => p.type).length}/${props.length} parameters are typed.`); } },
  { id: "c6", category: "clarity", label: "Required inputs are explicit", remediation: "Use required arrays to separate mandatory and optional input.", evaluate: (t) => result(all(t, (x) => Array.isArray((x.inputSchema as { required?: string[] }).required)) ? "passed" : "warning", "Checked schema required arrays.") },
  { id: "c7", category: "clarity", label: "Risky choices use enums", remediation: "Constrain environments, modes, roles, and destructive scopes.", evaluate: (t) => { const risky = t.flatMap((x) => Object.entries(properties(x))).filter(([name]) => /(environment|mode|role|action|scope|target)/i.test(name)); return result(risky.length === 0 || risky.every(([, p]) => p.enum?.length) ? "passed" : "failed", `${risky.filter(([, p]) => p.enum?.length).length}/${risky.length} risky choices are constrained.`); } },
  { id: "c8", category: "clarity", label: "Defaults are safe and documented", remediation: "Default to preview/read-only modes, never destructive execution.", evaluate: (t) => result(t.some((x) => JSON.stringify(x.inputSchema).includes("preview")) || !t.some((x) => riskyPattern.test(x.name)) ? "passed" : "warning", "Looked for a safe preview default on risky tools.") },
  { id: "c9", category: "clarity", label: "Identifiers state their resource", remediation: "Prefer projectId or keyId over generic id.", evaluate: (t) => result(all(t, (x) => !Object.keys(properties(x)).includes("id")) ? "passed" : "warning", "Generic `id` parameters reduce grounding.") },
  { id: "c10", category: "clarity", label: "Error behavior is documented", remediation: "Describe validation, authorization, and conflict failures.", evaluate: (t) => result(all(t, (x) => /(reject|fail|error|invalid|conflict)/i.test(x.description)) ? "passed" : "warning", "Checked descriptions for error semantics.") },
  { id: "c11", category: "clarity", label: "Response contract is described", remediation: "Document stable result fields and status values.", evaluate: (t) => result(all(t, (x) => /(return|result|status|id|report|list)/i.test(x.description)) ? "passed" : "warning", "Checked descriptions for response semantics.") },

  // Reliability and recovery · 12 checks
  { id: "r1", category: "reliability", label: "Mutations accept idempotency keys", remediation: "Require a stable idempotencyKey for retryable mutations.", evaluate: (t) => { const mut = t.filter((x) => mutationPattern.test(`${x.name} ${x.description}`)); return result(mut.every((x) => Object.keys(properties(x)).some((p) => /idempotency/i.test(p))) ? "passed" : "failed", `${mut.filter((x) => Object.keys(properties(x)).some((p) => /idempotency/i.test(p))).length}/${mut.length} mutations are idempotent.`); } },
  { id: "r2", category: "reliability", label: "Risky actions support preview", remediation: "Separate preview/validate from execution.", evaluate: (t) => { const risky = t.filter((x) => riskyPattern.test(`${x.name} ${x.description}`)); return result(risky.every((x) => JSON.stringify(x.inputSchema).match(/preview|inspect|validate/)) ? "passed" : "failed", `${risky.filter((x) => JSON.stringify(x.inputSchema).match(/preview|inspect|validate/)).length}/${risky.length} risky tools support preview.`); } },
  { id: "r3", category: "reliability", label: "Recovery or rollback is exposed", remediation: "Return a rollback token, deadline, or compensating action.", evaluate: (t) => result(all(t, (x) => !riskyPattern.test(x.name) || /(rollback|recover|overlap|undo)/i.test(x.description)) ? "passed" : "failed", "Checked risky actions for recovery language.") },
  { id: "r4", category: "reliability", label: "Partial failures are represented", remediation: "Return per-item results for batch operations.", evaluate: (t) => result(all(t, (x) => !Object.values(properties(x)).some((p) => p.type === "array") || /(per-|every|partial|each|row)/i.test(x.description)) ? "passed" : "warning", "Batch tools were checked for per-item outcomes.") },
  { id: "r5", category: "reliability", label: "Retry guidance is explicit", remediation: "Differentiate retryable and permanent failures.", evaluate: (t) => result(all(t, (x) => /(retry|idempot|conflict|reject)/i.test(x.description)) ? "passed" : "warning", "Checked result semantics for safe retry guidance.") },
  { id: "r6", category: "reliability", label: "Inputs are bounded", remediation: "Add maxItems, min/max, and length bounds.", evaluate: (t) => { const arrays = t.flatMap((x) => Object.values(properties(x))).filter((p) => p.type === "array"); return result(arrays.length === 0 || arrays.every((p) => p.maxItems) ? "passed" : "warning", `${arrays.filter((p) => p.maxItems).length}/${arrays.length} arrays are bounded.`); } },
  { id: "r7", category: "reliability", label: "Stable operation IDs are returned", remediation: "Return operation IDs for status tracking and support.", evaluate: (t) => result(all(t, (x) => !mutationPattern.test(x.name) || /\b(id|identifier|handle)\b/i.test(x.description)) ? "passed" : "warning", "Checked mutation outcomes for stable handles.") },
  { id: "r8", category: "reliability", label: "Validation is available before execution", remediation: "Expose validation without side effects.", evaluate: (t) => result(all(t, (x) => !mutationPattern.test(x.name) || /(validate|preview|inspect|plan)/i.test(`${x.name} ${x.description} ${JSON.stringify(x.inputSchema)}`)) ? "passed" : "warning", "Checked mutation contracts for validation mode.") },
  { id: "r9", category: "reliability", label: "Cancellation is supported or bounded", remediation: "Honor AbortSignal and document cancellation behavior.", evaluate: (t) => result(t.length > 0 ? "warning" : "failed", "Cancellation cannot be proven from metadata alone; runtime test required.") },
  { id: "r10", category: "reliability", label: "Unknown enum values fail closed", remediation: "Reject unknown targets instead of silently falling back.", evaluate: (t) => result(all(t, (x) => !Object.keys(properties(x)).some((p) => /(environment|mode|role|target)/i.test(p)) || Object.entries(properties(x)).filter(([p]) => /(environment|mode|role|target)/i.test(p)).every(([, v]) => v.enum)) ? "passed" : "failed", "Checked high-impact selectors for closed enums.") },
  { id: "r11", category: "reliability", label: "Preconditions are stated", remediation: "Document authorization, state, and version preconditions.", evaluate: (t) => result(all(t, (x) => /(require|only|before|after|exact|validated)/i.test(x.description)) ? "passed" : "warning", "Checked descriptions for execution preconditions.") },
  { id: "r12", category: "reliability", label: "Concurrency conflicts are detectable", remediation: "Bind mutations to a version or expected state.", evaluate: (t) => result(all(t, (x) => !mutationPattern.test(x.name) || Object.keys(properties(x)).some((p) => /(version|expected|etag|idempotency)/i.test(p))) ? "passed" : "warning", "Checked mutations for optimistic concurrency inputs.") },

  // Safety · 8 checks
  { id: "s1", category: "safety", label: "Read-only behavior is annotated", remediation: "Set annotations.readOnlyHint accurately.", evaluate: (t) => result(all(t, (x) => mutationPattern.test(x.name) || x.annotations?.readOnlyHint === true) ? "passed" : "warning", `${t.filter((x) => x.annotations?.readOnlyHint).length}/${t.length} tools declare read-only behavior.`) },
  { id: "s2", category: "safety", label: "Untrusted content is annotated", remediation: "Set untrustedContentHint when results include user or third-party content.", evaluate: (t) => result(t.some((x) => /(review|post|message|content|comment|search)/i.test(x.name)) ? (all(t.filter((x) => /(review|post|message|content|comment|search)/i.test(x.name)), (x) => x.annotations?.untrustedContentHint === true) ? "passed" : "failed") : "passed", "Content-returning tools were checked for prompt-injection boundaries.") },
  { id: "s3", category: "safety", label: "High-risk actions require approval", remediation: "Require a single-use confirmation or approval token.", evaluate: (t) => { const risky = t.filter((x) => riskyPattern.test(`${x.name} ${x.description}`)); return result(risky.every((x) => Object.keys(properties(x)).some((p) => /(confirm|approval)/i.test(p))) ? "passed" : "failed", `${risky.filter((x) => Object.keys(properties(x)).some((p) => /(confirm|approval)/i.test(p))).length}/${risky.length} risky tools require approval.`); } },
  { id: "s4", category: "safety", label: "Sensitive values are minimized", remediation: "Accept opaque resource IDs instead of raw secrets.", evaluate: (t) => result(all(t, (x) => !Object.keys(properties(x)).some((p) => sensitivePattern.test(p) && !/(token|keyId|credentialId|approvalToken|confirmationToken)/i.test(p))) ? "passed" : "warning", "Scanned parameter names for raw sensitive inputs.") },
  { id: "s5", category: "safety", label: "Mutation intent is not misrepresented", remediation: "Ensure names, descriptions, and implementation intent match.", evaluate: (t) => result(all(t, (x) => !mutationPattern.test(x.name) || explicitMutationDescriptionPattern.test(x.description)) ? "passed" : "failed", "Compared declared names and explicit side-effect language.") },
  { id: "s6", category: "safety", label: "Exposed origins are least-privilege", remediation: "Use exposedTo deliberately for embedded cross-origin tools.", evaluate: (t) => result(t.every((x) => !x.exposedTo || !x.exposedTo.includes("*")) ? "passed" : "failed", "Checked exposure lists for wildcard origins.") },
  { id: "s7", category: "safety", label: "Scope is constrained", remediation: "Use explicit project, tenant, environment, or resource scope.", evaluate: (t) => result(all(t, (x) => !mutationPattern.test(x.name) || Object.keys(properties(x)).some((p) => /(id|environment|scope|target|version|cart)/i.test(p))) ? "passed" : "warning", "Checked mutations for explicit resource scope.") },
  { id: "s8", category: "safety", label: "Prompt-injection boundary is documented", remediation: "Treat tool metadata and returned untrusted content as data, never instructions.", evaluate: (t) => result(t.some((x) => /(review|post|message|content|comment|search)/i.test(x.name)) ? (t.some((x) => x.annotations?.untrustedContentHint) ? "passed" : "failed") : "passed", "Checked content tools for an untrusted-content boundary.") },
];

const weights: Record<MetricKey, number> = { discoverability: 25, clarity: 30, reliability: 25, safety: 20 };
const categories: MetricKey[] = ["discoverability", "clarity", "reliability", "safety"];

export function parseToolManifest(value: string): AuditableTool[] {
  const parsed: unknown = JSON.parse(value);
  const candidate = Array.isArray(parsed) ? parsed : (parsed as { tools?: unknown })?.tools;
  if (!Array.isArray(candidate)) throw new Error("Expected a JSON array or an object with a tools array.");
  if (candidate.some((item) => !item || typeof item !== "object")) throw new Error("Every tool must be a JSON object.");
  return candidate as AuditableTool[];
}

export function auditTools(tools: AuditableTool[], options?: { source?: AuditResult["source"]; label?: string }): AuditResult {
  const checks = axRubric.map((item) => ({ id: item.id, category: item.category, label: item.label, remediation: item.remediation, ...item.evaluate(tools) }));
  const categoryScores = Object.fromEntries(categories.map((category) => {
    const group = checks.filter((check) => check.category === category);
    const earned = group.reduce((sum, check) => sum + (check.status === "passed" ? 1 : check.status === "warning" ? 0.5 : 0), 0);
    let categoryScore = Math.round((earned / group.length) * 100);
    const failedIds = new Set(group.filter((check) => check.status === "failed").map((check) => check.id));
    if (category === "clarity" && ["c2", "c3"].some((id) => failedIds.has(id))) categoryScore = Math.min(categoryScore, 45);
    if (category === "reliability" && ["r1", "r2", "r3"].some((id) => failedIds.has(id))) categoryScore = Math.min(categoryScore, 50);
    if (category === "safety" && ["s3", "s5", "s8"].some((id) => failedIds.has(id))) categoryScore = Math.min(categoryScore, 35);
    return [category, categoryScore];
  })) as Record<MetricKey, number>;
  const score = Math.round(categories.reduce((sum, category) => sum + categoryScores[category] * (weights[category] / 100), 0));
  return { source: options?.source ?? "manifest", label: options?.label ?? "Imported WebMCP manifest", score, toolCount: tools.length, checks, categoryScores, auditedAt: new Date().toISOString() };
}

export function auditScenario(scenario: Scenario): AuditResult {
  const checks = axRubric.map((item) => {
    const metric = scenario.metrics.find((candidate) => candidate.key === item.category)!;
    const index = axRubric.filter((candidate) => candidate.category === item.category).findIndex((candidate) => candidate.id === item.id);
    const status: AuditStatus = index < metric.passed ? "passed" : index === metric.passed ? "warning" : "failed";
    return { id: item.id, category: item.category, label: item.label, status, evidence: status === "passed" ? `Passed in the controlled ${scenario.shortLabel.toLowerCase()} replay.` : metric.summary, remediation: item.remediation };
  });
  return { source: "demo", label: scenario.company, score: scenario.score, toolCount: 1, checks, categoryScores: Object.fromEntries(scenario.metrics.map((metric) => [metric.key, metric.score])) as Record<MetricKey, number>, auditedAt: "Deterministic fixture" };
}

export function safeToolJson(tool: AuditableTool) {
  return JSON.stringify(tool, null, 2);
}
