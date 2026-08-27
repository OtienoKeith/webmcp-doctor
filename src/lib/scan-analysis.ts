import { auditTools, type AuditableTool, type AuditResult, type AuditStatus, type MetricKey } from "@/lib/audit";
import type { TraceStep } from "@/components/trace-flow";

export type HumanCapability = {
  label: string;
  kind: "form" | "action" | "navigation";
};

export type SiteMetadata = {
  requestedUrl: string;
  finalUrl: string;
  scannedAt: string;
  cached: boolean;
  signals: {
    nativeApi: boolean;
    capturedRegistrations: number;
    declarativeForms: number;
  };
};

export type ScanArtifact = {
  result: AuditResult;
  tools: AuditableTool[];
  humanCapabilities: HumanCapability[];
  site?: SiteMetadata;
};

export const categoryLabels: Record<MetricKey, string> = {
  discoverability: "Discoverability",
  clarity: "Tool clarity",
  reliability: "Reliability & recovery",
  safety: "Safety",
};

export function statusFromScore(score: number): AuditStatus {
  return score >= 80 ? "passed" : score >= 55 ? "warning" : "failed";
}

function toSnakeCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "agent_tool";
}

function isMutation(tool: AuditableTool) {
  return /(create|update|delete|remove|rotate|deploy|ship|send|invite|purchase|charge|place|reset|finalize|execute|write|change|book|cancel)/i.test(`${tool.name} ${tool.description}`);
}

export function repairToolDefinition(tool: AuditableTool): AuditableTool {
  const schema = (tool.inputSchema ?? { type: "object" }) as { properties?: Record<string, Record<string, unknown>>; required?: string[]; [key: string]: unknown };
  const mutates = isMutation(tool);
  const properties: Record<string, Record<string, unknown>> = Object.fromEntries(Object.entries(schema.properties ?? {}).map(([name, property]) => [name, {
    ...property,
    description: typeof property.description === "string" && property.description.trim() ? property.description : `Validated ${name} value for this operation.`,
  }]));
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);

  if (mutates) {
    properties.mode ??= { type: "string", enum: ["preview", "execute"], default: "preview", description: "Preview validates consequences without mutation; execute requires explicit confirmation." };
    properties.confirmationToken ??= { type: "string", description: "Explicit user-confirmation token required for execution." };
    properties.idempotencyKey ??= { type: "string", description: "Stable retry key that prevents duplicate side effects." };
    required.add("mode");
    required.add("idempotencyKey");
  }

  const outcome = mutates
    ? " Validates inputs, supports preview before execution, rejects invalid or conflicting requests, and returns a stable operation identifier with retry and recovery guidance."
    : " Returns a structured result with a stable identifier and clearly separates untrusted page content from instructions.";

  return {
    ...tool,
    name: toSnakeCase(tool.name),
    title: tool.title || tool.name.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    description: `${tool.description.trim().replace(/[.\s]+$/, "")}.${outcome}`,
    inputSchema: { ...schema, type: "object", properties, required: Array.from(required) },
    annotations: {
      ...tool.annotations,
      readOnlyHint: !mutates,
      untrustedContentHint: /(content|review|message|comment|document|page|search)/i.test(`${tool.name} ${tool.description}`),
    },
  };
}

export function buildContractTrace(artifact: ScanArtifact): TraceStep[] {
  const { result, tools } = artifact;
  const firstTool = tools[0];
  const topFinding = result.checks.find((check) => check.status === "failed") ?? result.checks.find((check) => check.status === "warning");
  return [
    { id: "goal", label: "Site loaded", detail: artifact.site?.finalUrl ?? result.label, state: "passed" },
    { id: "discover", label: "Tools discovered", detail: `${tools.length} registered tool${tools.length === 1 ? "" : "s"}`, state: statusFromScore(result.categoryScores.discoverability) },
    { id: "select", label: "Selection evidence", detail: firstTool ? `${firstTool.name}: ${firstTool.description.slice(0, 72)}` : "No task contract was exposed", state: statusFromScore(result.categoryScores.clarity) },
    { id: "input", label: "Input contract", detail: firstTool ? `${Object.keys(((firstTool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {})).length} structured parameters` : "No input schema available", state: statusFromScore(Math.min(result.categoryScores.discoverability, result.categoryScores.clarity)) },
    { id: "execute", label: "Execution readiness", detail: `Recovery and retry score: ${result.categoryScores.reliability}/100`, state: statusFromScore(result.categoryScores.reliability) },
    { id: "root", label: "Primary contract risk", detail: topFinding?.label ?? "No blocking metadata risk found", state: topFinding?.status ?? "passed" },
  ];
}

function tokens(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3 && !["with", "this", "that", "from", "your", "tool"].includes(token)));
}

export function compareCapabilities(humanCapabilities: HumanCapability[], tools: AuditableTool[]) {
  const toolTokens = tools.map((tool) => ({ tool, tokens: tokens(`${tool.name} ${tool.title ?? ""} ${tool.description}`) }));
  const humanRows = humanCapabilities.slice(0, 12).map((capability) => {
    const capabilityTokens = tokens(capability.label);
    const match = toolTokens.find((candidate) => Array.from(capabilityTokens).some((token) => candidate.tokens.has(token)));
    return { capability, matchedTool: match?.tool, covered: Boolean(match) };
  });
  const covered = humanRows.filter((row) => row.covered).length;
  return {
    humanRows,
    coverage: humanRows.length ? Math.round((covered / humanRows.length) * 100) : 0,
    gaps: humanRows.filter((row) => !row.covered),
    agentOnly: tools.filter((tool) => !humanRows.some((row) => row.matchedTool?.name === tool.name)),
  };
}

export function auditRepair(before: AuditableTool, after: AuditableTool) {
  return {
    before: auditTools([before], { source: "manifest", label: before.title ?? before.name }),
    after: auditTools([after], { source: "manifest", label: after.title ?? after.name }),
  };
}
