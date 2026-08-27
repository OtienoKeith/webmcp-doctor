"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  Activity, ArrowRight, Bot, Check, CheckCircle2, CircleAlert, Code2, Copy,
  Download, GitCompareArrows, Globe2, Info, ShieldAlert, Sparkles,
  Stethoscope, UserRound, Wrench,
} from "lucide-react";
import { ScannerView } from "@/components/scanner-view";
import { TraceFlow } from "@/components/trace-flow";
import { metricWeights, type AuditableTool, type AuditResult, type AuditStatus, type MetricKey } from "@/lib/audit";
import {
  auditRepair, buildContractTrace, categoryLabels, compareCapabilities,
  repairToolDefinition, type ScanArtifact,
} from "@/lib/scan-analysis";

type SectionId = "scan" | "health" | "failure" | "repair" | "parity";
type NativeState = "checking" | "native" | "preview";
type ToolInput = { toolName?: string; repaired?: boolean };
type RegisteredTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: ToolInput) => Promise<string>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool(tool: RegisteredTool, options?: { signal?: AbortSignal }): Promise<void>;
    };
  }
}

const webMcpTools: Array<{ name: string; title: string; description: string; section: SectionId }> = [
  { name: "scan_agent_experience", title: "Scan agent experience", description: "Open the real-site scanner for a public URL.", section: "scan" },
  { name: "inspect_tool", title: "Inspect tool", description: "Inspect a discovered tool and its generated repair.", section: "repair" },
  { name: "trace_agent_failure", title: "Trace agent failure", description: "Show the contract-readiness failure trace.", section: "failure" },
  { name: "compare_human_agent_paths", title: "Compare human and agent paths", description: "Compare rendered controls with WebMCP capabilities.", section: "parity" },
  { name: "simulate_tool_change", title: "Simulate tool change", description: "Apply a repair locally and rerun the AX rubric.", section: "repair" },
  { name: "run_ax_test", title: "Run AX test", description: "Show the AX Health result from the latest scan.", section: "health" },
  { name: "explain_ax_score", title: "Explain AX score", description: "Show the weighted AX score and its evidence.", section: "health" },
];

function Logo() {
  return <div className="brand-mark" aria-hidden="true"><span className="brand-cross brand-cross-v" /><span className="brand-cross brand-cross-h" /><Activity size={18} strokeWidth={2.5} /></div>;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`panel ${className}`}>{children}</div>;
}

function SectionHeading({ number, eyebrow, title, description }: { number: string; eyebrow: string; title: string; description: string }) {
  return <div className="essential-section-heading"><span>{number}</span><div><small>{eyebrow}</small><h2>{title}</h2><p>{description}</p></div></div>;
}

function SeverityBadge({ status }: { status: AuditStatus }) {
  const label = status === "failed" ? "critical" : status === "warning" ? "attention" : "healthy";
  const css = status === "failed" ? "critical" : status === "warning" ? "high" : "passed";
  return <span className={`severity severity-${css}`}>{label}</span>;
}

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 85 ? "good" : score >= 65 ? "warn" : "bad";
  return <div className={`score-ring score-ring-large score-${tone}`} style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><div className="score-ring-inner"><strong>{score}</strong><span>/ 100</span></div></div>;
}

function statusForScore(score: number): AuditStatus {
  return score >= 80 ? "passed" : score >= 55 ? "warning" : "failed";
}

function MetricCard({ category, result }: { category: MetricKey; result: AuditResult }) {
  const score = result.categoryScores[category];
  const checks = result.checks.filter((check) => check.category === category);
  const passed = checks.filter((check) => check.status === "passed").length;
  return <div className="metric-card"><div className="metric-topline"><span>{categoryLabels[category]}</span><strong>{score}</strong></div><div className="meter"><motion.span animate={{ width: `${score}%` }} /></div><div className="metric-foot"><span>{passed}/{checks.length} passed</span><span>{metricWeights[category]}% weight</span></div></div>;
}

function CodeBlock({ definition, after = false }: { definition: AuditableTool; after?: boolean }) {
  return <div className={`code-card ${after ? "code-after" : "code-before"}`}><div className="code-head"><span><Code2 size={14} /> {after ? "PROPOSED" : "DISCOVERED"}</span><span className={`code-status ${after ? "code-status-good" : "code-status-bad"}`}>{after ? "REPAIR" : "LIVE"}</span></div><pre><code>{JSON.stringify(definition, null, 2)}</code></pre></div>;
}

export function DoctorDashboard() {
  const [artifact, setArtifact] = useState<ScanArtifact | null>(null);
  const [nativeState, setNativeState] = useState<NativeState>("checking");
  const [repairApplied, setRepairApplied] = useState(false);
  const [selectedToolName, setSelectedToolName] = useState("");
  const [agentNotice, setAgentNotice] = useState("");

  const scrollTo = useCallback((section: SectionId) => {
    requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const handleToolAction = useCallback(async (toolName: string, input: ToolInput = {}) => {
    const tool = webMcpTools.find((item) => item.name === toolName);
    if (!tool) return JSON.stringify({ ok: false, error: "Unknown WebMCP Doctor tool." });
    if (tool.section !== "scan" && !artifact) {
      scrollTo("scan");
      setAgentNotice("Scan a public website before running diagnostics.");
      return JSON.stringify({ ok: false, error: "Scan a real website first.", uiUpdated: true, section: "scan" });
    }
    if (input.toolName && artifact?.tools.some((candidate) => candidate.name === input.toolName)) setSelectedToolName(input.toolName);
    if (toolName === "simulate_tool_change") setRepairApplied(true);
    setAgentNotice(`Agent opened ${tool.title}${artifact ? ` for ${artifact.result.label}` : ""}.`);
    scrollTo(tool.section);
    return JSON.stringify({ ok: true, section: tool.section, score: artifact?.result.score ?? null, toolCount: artifact?.tools.length ?? 0, uiUpdated: true });
  }, [artifact, scrollTo]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) {
      const timer = window.setTimeout(() => setNativeState("preview"), 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    let active = true;
    const register = async () => {
      try {
        for (const tool of webMcpTools) {
          await context.registerTool({
            name: tool.name,
            title: tool.title,
            description: `${tool.description} The resulting report section becomes visible in WebMCP Doctor.`,
            inputSchema: { type: "object", properties: { toolName: { type: "string", description: "Optional discovered tool name" }, repaired: { type: "boolean", description: "Use the generated local repair" } }, required: [] },
            annotations: { readOnlyHint: tool.name !== "simulate_tool_change" },
            execute: (input) => handleToolAction(tool.name, input),
          }, { signal: controller.signal });
        }
        if (active) setNativeState("native");
      } catch {
        if (active) setNativeState("preview");
      }
    };
    void register();
    return () => { active = false; controller.abort(); };
  }, [handleToolAction]);

  const handleScanned = (next: ScanArtifact) => {
    setArtifact(next);
    setRepairApplied(false);
    setSelectedToolName(next.tools[0]?.name ?? "");
    setAgentNotice("");
    window.setTimeout(() => scrollTo("health"), 120);
  };

  return <div className="one-page-shell">
    <header className="essential-header">
      <a className="essential-brand" href="#scan"><Logo /><div><strong>WebMCP Doctor</strong><span>Agent experience diagnostics</span></div></a>
      <div className={`essential-status status-${nativeState}`}><i /><span>{artifact ? `${artifact.tools.length} tools · ${artifact.result.score}/100` : "7 WebMCP tools registered"}</span></div>
    </header>

    {agentNotice && <button className="agent-notice" onClick={() => setAgentNotice("")}><Bot size={15} /><span>{agentNotice}</span><small>dismiss</small></button>}

    <main className="essential-main">
      <ScannerView onScanned={handleScanned} />
      {!artifact ? <Panel className="report-placeholder"><Globe2 size={24} /><strong>Your report will appear here</strong><p>One scan produces the health score, failure trace, repair, and capability comparison.</p></Panel> : <div className="single-report">
        <div className="report-intro"><div><span>LIVE REPORT</span><h2>{artifact.result.label}</h2><a href={artifact.site?.finalUrl} target="_blank" rel="noreferrer">{artifact.site?.finalUrl}</a></div><div><strong>{artifact.tools.length}</strong><span>TOOLS FOUND</span></div></div>
        <HealthSection artifact={artifact} />
        <FailureSection artifact={artifact} onRepair={() => scrollTo("repair")} />
        {artifact.tools.length > 0 && <RepairSection artifact={artifact} selectedName={selectedToolName} onSelected={setSelectedToolName} applied={repairApplied} onApply={() => setRepairApplied(true)} />}
        <ParitySection artifact={artifact} />
      </div>}
    </main>

    <footer className="essential-footer"><span>WebMCP Doctor</span><p>Read-only discovery. Scanned website tools are never invoked.</p></footer>
  </div>;
}

function HealthSection({ artifact }: { artifact: ScanArtifact }) {
  const { result } = artifact;
  const topFinding = result.checks.find((check) => check.status === "failed") ?? result.checks.find((check) => check.status === "warning");
  return <section className="diagnostic-section" id="health">
    <SectionHeading number="01" eyebrow="AX HEALTH" title="Is this site ready for agents?" description="A weighted score from 42 contract checks across discoverability, clarity, reliability, and safety." />
    <div className="essential-health-grid">
      <Panel className="score-panel"><div className="score-copy"><span className="mini-label">AX HEALTH SCORE</span><h2>{result.label}</h2><div className="score-meta"><SeverityBadge status={statusForScore(result.score)} /><span>{result.toolCount} discovered tool{result.toolCount === 1 ? "" : "s"}</span></div></div><ScoreRing score={result.score} /></Panel>
      <Panel className="root-cause-preview"><span className="mini-label"><ShieldAlert size={13} /> TOP RISK</span><h3>{topFinding?.label ?? "No blocking contract risk"}</h3><p>{topFinding?.evidence ?? "The discovered contracts passed every blocking check."}</p></Panel>
    </div>
    <div className="metric-grid">{(["discoverability", "clarity", "reliability", "safety"] as MetricKey[]).map((category) => <MetricCard key={category} category={category} result={result} />)}</div>
    <div className="method-note"><Info size={14} /> Weighted: discoverability {metricWeights.discoverability}%, clarity {metricWeights.clarity}%, reliability {metricWeights.reliability}%, safety {metricWeights.safety}%.</div>
  </section>;
}

function FailureSection({ artifact, onRepair }: { artifact: ScanArtifact; onRepair: () => void }) {
  const trace = useMemo(() => buildContractTrace(artifact), [artifact]);
  const [selectedId, setSelectedId] = useState("root");
  const selected = trace.find((step) => step.id === selectedId) ?? trace[0];
  const topFinding = artifact.result.checks.find((check) => check.status === "failed") ?? artifact.result.checks.find((check) => check.status === "warning");
  return <section className="diagnostic-section" id="failure">
    <SectionHeading number="02" eyebrow="FAILURE X-RAY" title="Where does the agent contract break?" description="A read-only trace from discovery to outcome, built from the metadata the website actually exposes." />
    <Panel className="xray-stage"><div className="trace-workbench"><TraceFlow trace={trace} selectedId={selectedId} onStepSelect={setSelectedId} /><aside className="trace-inspector"><div className="inspector-head"><div><span className={`trace-state trace-state-${selected.state}`}>{selected.state}</span><strong>{selected.label}</strong></div></div><div className="inspector-section"><span>OBSERVED EVIDENCE</span><p>{selected.detail}</p></div><div className="inspector-section inspector-recovery"><span>WHAT TO FIX</span><p>{selected.state === "passed" ? "This stage has sufficient contract evidence." : topFinding?.remediation ?? "Clarify the tool contract before agent use."}</p></div></aside></div></Panel>
    <Panel className="essential-cause"><div><ShieldAlert size={20} /></div><span><small>PRIMARY RISK</small><strong>{topFinding?.label ?? "No blocking metadata risk"}</strong></span>{artifact.tools.length > 0 && <button className="button button-ghost" onClick={onRepair}><Wrench size={15} /> Repair contract <ArrowRight size={14} /></button>}</Panel>
  </section>;
}

function RepairSection({ artifact, selectedName, onSelected, applied, onApply }: { artifact: ScanArtifact; selectedName: string; onSelected: (name: string) => void; applied: boolean; onApply: () => void }) {
  const [copied, setCopied] = useState(false);
  const selected = artifact.tools.find((tool) => tool.name === selectedName) ?? artifact.tools[0];
  const proposed = useMemo(() => repairToolDefinition(selected), [selected]);
  const replay = useMemo(() => auditRepair(selected, proposed), [selected, proposed]);
  const proposedJson = JSON.stringify(proposed, null, 2);
  const copyRepair = async () => { await navigator.clipboard.writeText(proposedJson); setCopied(true); window.setTimeout(() => setCopied(false), 1400); };
  const downloadRepair = () => { const url = URL.createObjectURL(new Blob([proposedJson], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `${proposed.name}.webmcp.json`; link.click(); URL.revokeObjectURL(url); };
  const risks = replay.before.checks.filter((check) => check.status !== "passed").length;
  return <section className="diagnostic-section" id="repair">
    <SectionHeading number="03" eyebrow="TOOL SURGEON" title="Repair the discovered contract" description="Generate a safer definition and compare its score against the live version before changing your code." />
    <div className="essential-repair-bar"><label className="tool-picker"><span>TOOL</span><select value={selected.name} onChange={(event) => onSelected(event.target.value)}>{artifact.tools.map((tool) => <option key={tool.name}>{tool.name}</option>)}</select></label><span><Stethoscope size={15} /> {risks} risks found</span><button className="button button-ghost" onClick={copyRepair}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button><button className="button button-ghost" onClick={downloadRepair}><Download size={15} /> Export</button><button className="button button-primary" onClick={onApply} disabled={applied}>{applied ? <Check size={15} /> : <Sparkles size={15} />}{applied ? "Compared" : "Compare repair"}</button></div>
    <div className="code-compare"><CodeBlock definition={selected} /><div className="compare-arrow"><ArrowRight size={20} /></div><CodeBlock definition={proposed} after /></div>
    <Panel className={`essential-score-change ${applied ? "is-applied" : ""}`}><div><span>LIVE</span><strong>{replay.before.score}</strong><small>{replay.before.checks.filter((check) => check.status === "passed").length}/42 checks pass</small></div><ArrowRight size={18} /><div><span>PROPOSED</span><strong>{applied ? replay.after.score : "—"}</strong><small>{applied ? `${replay.after.checks.filter((check) => check.status === "passed").length}/42 checks pass` : "Run comparison"}</small></div></Panel>
  </section>;
}

function ParitySection({ artifact }: { artifact: ScanArtifact }) {
  const comparison = useMemo(() => compareCapabilities(artifact.humanCapabilities, artifact.tools), [artifact]);
  return <section className="diagnostic-section" id="parity">
    <SectionHeading number="04" eyebrow="HUMAN × AGENT" title="Can agents do what users can?" description="Rendered page controls are compared with the WebMCP capabilities discovered on the same page." />
    <Panel className="gap-callout"><div className="gap-icon"><GitCompareArrows size={23} /></div><div><span className="mini-label">CAPABILITY PARITY</span><h2>{comparison.gaps.length ? `${comparison.gaps.length} human capabilities have no matching agent tool.` : "Every captured human capability has a tool match."}</h2></div><div className="coverage"><span>Coverage</span><strong>{comparison.coverage}%</strong></div></Panel>
    <div className="essential-twin-grid">
      <Panel className="essential-capabilities"><div className="path-header"><div className="path-icon"><UserRound size={19} /></div><div><span className="mini-label">RENDERED PAGE</span><h2>Human</h2></div><b>{artifact.humanCapabilities.length}</b></div><div>{artifact.humanCapabilities.slice(0, 6).map((capability) => <span key={`${capability.kind}-${capability.label}`}><CheckCircle2 size={14} /><strong>{capability.label}</strong><small>{capability.kind}</small></span>)}</div></Panel>
      <Panel className="essential-capabilities agent-panel"><div className="path-header"><div className="path-icon"><Bot size={19} /></div><div><span className="mini-label">WEBMCP REGISTRY</span><h2>Agent</h2></div><b>{artifact.tools.length}</b></div><div>{artifact.tools.slice(0, 6).map((tool) => <span key={tool.name}><CheckCircle2 size={14} /><strong>{tool.title ?? tool.name}</strong><small>{tool.name}</small></span>)}</div></Panel>
    </div>
    {comparison.gaps.length > 0 && <div className="gap-summary"><CircleAlert size={15} /><span>Largest uncovered controls: {comparison.gaps.slice(0, 4).map((gap) => gap.capability.label).join(", ")}.</span></div>}
  </section>;
}
