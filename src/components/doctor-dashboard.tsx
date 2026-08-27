"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity, ArrowRight, Beaker, Bot, Check, CheckCircle2, ChevronDown,
  CircleAlert, CircleDot, ClipboardCheck, Code2, GitCompareArrows,
  Info, LayoutDashboard, Play, Radar, RefreshCw, ScanSearch, ShieldAlert,
  Sparkles, Stethoscope, TerminalSquare, TestTube2, UserRound, Wrench,
  X, Zap, ScanLine, Copy, Download,
} from "lucide-react";
import { AuditChecklist } from "@/components/audit-checklist";
import { ScannerView } from "@/components/scanner-view";
import { TraceFlow } from "@/components/trace-flow";
import { auditScenario, type AuditableTool, type AuditResult } from "@/lib/audit";
import { getScenario, metricWeights, scenarios, type Metric, type Scenario } from "@/lib/scenarios";

type View = "scanner" | "overview" | "xray" | "surgeon" | "twin" | "tools";
type NativeState = "checking" | "native" | "preview";
type ActivityItem = { id: number; tool: string; detail: string; source: "agent" | "demo" };
type ToolInput = { scenarioId?: string; scenario_id?: string; repaired?: boolean };
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
      getTools?(): Promise<Array<{ name: string; title?: string; description: string; inputSchema?: string | Record<string, unknown>; annotations?: RegisteredTool["annotations"] }>>;
    };
  }
}

const views: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "scanner", label: "Live Scanner", icon: ScanLine },
  { id: "overview", label: "AX Health", icon: LayoutDashboard },
  { id: "xray", label: "Failure X-Ray", icon: ScanSearch },
  { id: "surgeon", label: "Tool Surgeon", icon: Wrench },
  { id: "twin", label: "Digital Twin", icon: GitCompareArrows },
  { id: "tools", label: "WebMCP Lab", icon: TerminalSquare },
];

const demoSteps = [
  { kicker: "01 · DIAGNOSE", title: "Start with the AX Health Score", copy: "A 30-second audit turns agent readiness into an explainable score.", view: "overview" as View },
  { kicker: "02 · TRACE", title: "Follow the failure, not the symptom", copy: "X-Ray tracks the agent from goal to the exact contract defect.", view: "xray" as View },
  { kicker: "03 · REPAIR", title: "Operate with Tool Surgeon", copy: "Generate a safer definition and prove it against the same deterministic tests.", view: "surgeon" as View },
  { kicker: "04 · COMPARE", title: "Reveal the experience gap", copy: "Digital Twin shows what the human UI can do that the agent cannot.", view: "twin" as View },
];

const webMcpTools = [
  { name: "scan_agent_experience", title: "Scan agent experience", description: "Audits the selected demo surface and updates the AX Health dashboard.", view: "overview" as View, icon: Radar },
  { name: "inspect_tool", title: "Inspect tool", description: "Opens the unsafe tool contract with structured findings and a proposed repair.", view: "surgeon" as View, icon: Stethoscope },
  { name: "trace_agent_failure", title: "Trace agent failure", description: "Replays a deterministic agent attempt and opens its failure graph.", view: "xray" as View, icon: ScanSearch },
  { name: "compare_human_agent_paths", title: "Compare human and agent paths", description: "Builds a capability-level digital twin of both workflows.", view: "twin" as View, icon: GitCompareArrows },
  { name: "simulate_tool_change", title: "Simulate tool change", description: "Applies the proposed contract in a sandbox and updates before/after results.", view: "surgeon" as View, icon: Beaker },
  { name: "run_ax_test", title: "Run AX test", description: "Runs the controlled 12-case AX test suite for the selected environment.", view: "overview" as View, icon: TestTube2 },
  { name: "explain_ax_score", title: "Explain AX score", description: "Explains the weighted score and opens the supporting evidence.", view: "overview" as View, icon: Info },
];

function Logo() {
  return <div className="brand-mark" aria-hidden="true"><span className="brand-cross brand-cross-v" /><span className="brand-cross brand-cross-h" /><Activity size={18} strokeWidth={2.5} /></div>;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

function SeverityBadge({ severity }: { severity: Scenario["severity"] | "passed" }) {
  return <span className={`severity severity-${severity}`}>{severity}</span>;
}

function ScoreRing({ score, size = "large" }: { score: number; size?: "large" | "small" }) {
  const tone = score >= 85 ? "good" : score >= 65 ? "warn" : "bad";
  return <div className={`score-ring score-ring-${size} score-${tone}`} style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><div className="score-ring-inner"><strong>{score}</strong><span>/ 100</span></div></div>;
}

function MetricCard({ metric, repaired }: { metric: Metric; repaired: boolean }) {
  const boosts = { discoverability: 7, clarity: 36, reliability: 31, safety: 47 };
  const value = repaired ? Math.min(98, metric.score + boosts[metric.key]) : metric.score;
  return <div className="metric-card"><div className="metric-topline"><span>{metric.label}</span><strong className={value >= 85 ? "text-good" : value >= 60 ? "text-warn" : "text-bad"}>{value}</strong></div><div className="meter"><motion.span animate={{ width: `${value}%` }} transition={{ duration: 0.7 }} /></div><p>{metric.summary}</p><div className="metric-foot"><span>{metric.passed}/{metric.total} checks</span><span>{metricWeights[metric.key]}% weight</span></div></div>;
}

function CodeBlock({ definition, after = false }: { definition: Scenario["toolBefore"]; after?: boolean }) {
  const schema = JSON.stringify(definition.inputSchema, null, 2);
  return <div className={`code-card ${after ? "code-after" : "code-before"}`}><div className="code-head"><span><Code2 size={14} /> {after ? "PROPOSED CONTRACT" : "CURRENT CONTRACT"}</span><span className={`code-status ${after ? "code-status-good" : "code-status-bad"}`}>{after ? "AX-READY" : "UNSAFE"}</span></div><pre><code><span className="code-key">name</span>: <span className="code-string">&quot;{definition.name}&quot;</span>{"\n"}<span className="code-key">description</span>: <span className="code-string">&quot;{definition.description}&quot;</span>{"\n"}<span className="code-key">inputSchema</span>: {schema}</code></pre></div>;
}

export function DoctorDashboard() {
  const [activeView, setActiveView] = useState<View>("overview");
  const [scenarioId, setScenarioId] = useState("deploy");
  const [repaired, setRepaired] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [nativeState, setNativeState] = useState<NativeState>("checking");
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [demoStep, setDemoStep] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const scenario = getScenario(scenarioId);
  const fallbackTools: AuditableTool[] = webMcpTools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: {
      type: "object",
      properties: { scenarioId: { type: "string", description: "Controlled environment identifier", enum: scenarios.map((item) => item.id) } },
      required: [],
    },
    annotations: { readOnlyHint: !["simulate_tool_change", "run_ax_test"].includes(tool.name) },
  }));

  const recordActivity = useCallback((tool: string, detail: string, source: ActivityItem["source"] = "demo") => {
    setActivities((items) => [{ id: Date.now() + Math.random(), tool, detail, source }, ...items].slice(0, 8));
  }, []);

  const runScan = useCallback((source: ActivityItem["source"] = "demo") => {
    setScanning(true);
    setShowExplanation(false);
    window.setTimeout(() => {
      setScanning(false);
      recordActivity("scan_agent_experience", "Audit complete · 42 deterministic checks", source);
    }, 850);
  }, [recordActivity]);

  const handleToolAction = useCallback(async (toolName: string, input: ToolInput = {}, source: ActivityItem["source"] = "demo") => {
    const selected = input.scenarioId ?? input.scenario_id;
    const nextScenario = getScenario(selected ?? scenarioId);
    if (selected) setScenarioId(nextScenario.id);
    const tool = webMcpTools.find((item) => item.name === toolName);
    if (tool) setActiveView(tool.view);
    if (toolName === "scan_agent_experience" || toolName === "run_ax_test") runScan(source);
    if (toolName === "simulate_tool_change") {
      setRepaired(true);
      recordActivity(toolName, `Repair simulated · score ${nextScenario.score} → ${nextScenario.repairedScore}`, source);
    } else if (toolName === "explain_ax_score") {
      setShowExplanation(true);
      recordActivity(toolName, "Score evidence expanded in dashboard", source);
    } else if (toolName !== "scan_agent_experience" && toolName !== "run_ax_test") {
      recordActivity(toolName, `${nextScenario.company} · UI synchronized`, source);
    }
    return JSON.stringify({ ok: true, scenario: nextScenario.id, view: tool?.view ?? "overview", score: toolName === "simulate_tool_change" || input.repaired ? nextScenario.repairedScore : nextScenario.score, rootCause: nextScenario.rootCause, uiUpdated: true });
  }, [recordActivity, runScan, scenarioId]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) {
      const previewTimer = window.setTimeout(() => setNativeState("preview"), 0);
      return () => window.clearTimeout(previewTimer);
    }
    const controller = new AbortController();
    let active = true;
    const register = async () => {
      try {
        for (const tool of webMcpTools) {
          await context.registerTool({
            name: tool.name,
            title: tool.title,
            description: `${tool.description} UI state changes are visible in WebMCP Doctor. Optional scenarioId values: deploy, cloud, commerce, saas.`,
            inputSchema: { type: "object", properties: { scenarioId: { type: "string", enum: scenarios.map((item) => item.id), description: "Controlled demo environment to inspect" }, repaired: { type: "boolean", description: "Run against the proposed repaired contract when supported" } } },
            annotations: { readOnlyHint: !["simulate_tool_change", "run_ax_test"].includes(tool.name) },
            execute: (input) => handleToolAction(tool.name, input, "agent"),
          }, { signal: controller.signal });
        }
        if (active) setNativeState("native");
      } catch { if (active) setNativeState("preview"); }
    };
    register();
    return () => { active = false; controller.abort(); };
  }, [handleToolAction]);

  const startDemo = () => { setScenarioId("commerce"); setRepaired(false); setDemoStep(1); setActiveView("overview"); runScan(); };
  const advanceDemo = () => {
    if (demoStep >= demoSteps.length) { setDemoStep(0); setActiveView("overview"); return; }
    const next = demoStep + 1;
    setDemoStep(next);
    const nextView = demoSteps[next - 1].view;
    setActiveView(nextView);
    if (nextView === "surgeon") window.setTimeout(() => setRepaired(true), 350);
  };

  return <div className="doctor-shell">
    <aside className="sidebar">
      <div className="brand"><Logo /><div><strong>WebMCP</strong><span>DOCTOR</span></div></div>
      <div className="sidebar-label">DIAGNOSTICS</div>
      <nav>{views.map((view) => { const Icon = view.icon; return <button key={view.id} className={activeView === view.id ? "active" : ""} onClick={() => setActiveView(view.id)}><Icon size={18} /><span>{view.label}</span>{view.id === "tools" && <em>7</em>}</button>; })}</nav>
      <div className="sidebar-spacer" />
      <div className={`webmcp-status webmcp-status-${nativeState}`}><div className="pulse-dot" /><div><strong>{nativeState === "native" ? "WebMCP live" : nativeState === "preview" ? "Demo bridge active" : "Checking WebMCP"}</strong><span>{nativeState === "native" ? "7 native tools registered" : "7 tools · progressive fallback"}</span></div></div>
      <div className="sidebar-note"><ShieldAlert size={15} /><span>Local-only scenarios<br />No data leaves this browser</span></div>
    </aside>

    <main className="main-shell">
      <header className="topbar">
        <div className="mobile-brand"><Logo /><strong>WebMCP Doctor</strong></div>
        <div className="environment-picker"><span>TEST ENVIRONMENT</span><label><CircleDot size={15} /><select value={scenarioId} onChange={(event) => { setScenarioId(event.target.value); setRepaired(false); }} aria-label="Select test environment">{scenarios.map((item) => <option key={item.id} value={item.id}>{item.company} · {item.shortLabel}</option>)}</select><ChevronDown size={15} /></label></div>
        <div className="top-actions"><button className="button button-ghost" onClick={() => setActiveView("tools")}><TerminalSquare size={16} /> Tool console</button><button className="button button-primary" onClick={startDemo}><Play size={15} fill="currentColor" /> Start 3-min demo</button></div>
      </header>

      {demoStep > 0 && <div className="demo-guide"><div className="demo-progress">{demoSteps.map((_, index) => <span key={index} className={index < demoStep ? "done" : ""} />)}</div><div><span>{demoSteps[demoStep - 1].kicker}</span><strong>{demoSteps[demoStep - 1].title}</strong><p>{demoSteps[demoStep - 1].copy}</p></div><button className="button button-light" onClick={advanceDemo}>{demoStep === demoSteps.length ? "Finish tour" : "Next step"}<ArrowRight size={16} /></button><button className="icon-button" onClick={() => setDemoStep(0)} aria-label="Close demo guide"><X size={17} /></button></div>}

      <AnimatePresence mode="wait"><motion.div key={`${activeView}-${scenarioId}`} className="view-wrap" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.22 }}>
        {activeView === "scanner" && <ScannerView nativeAvailable={nativeState === "native"} fallbackTools={fallbackTools} onScanned={(result: AuditResult) => recordActivity("scan_agent_experience", `${result.label} · ${result.score}/100 · ${result.toolCount} tools`, "demo")} />}
        {activeView === "overview" && <Overview scenario={scenario} repaired={repaired} scanning={scanning} showExplanation={showExplanation} onScan={() => { setRepaired(false); runScan(); }} onExplain={() => handleToolAction("explain_ax_score")} onOpen={(view) => setActiveView(view)} />}
        {activeView === "xray" && <XRay scenario={scenario} onOpenSurgeon={() => setActiveView("surgeon")} />}
        {activeView === "surgeon" && <Surgeon scenario={scenario} repaired={repaired} onRepair={() => handleToolAction("simulate_tool_change")} />}
        {activeView === "twin" && <DigitalTwin scenario={scenario} />}
        {activeView === "tools" && <ToolLab nativeState={nativeState} activities={activities} scenario={scenario} onInvoke={(name) => handleToolAction(name)} />}
      </motion.div></AnimatePresence>
    </main>
    <nav className="mobile-nav">{views.map((view) => { const Icon = view.icon; return <button key={view.id} className={activeView === view.id ? "active" : ""} onClick={() => setActiveView(view.id)}><Icon size={18} /><span>{view.label.split(" ")[0]}</span></button>; })}</nav>
  </div>;
}

function ViewHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="view-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Overview({ scenario, repaired, scanning, showExplanation, onScan, onExplain, onOpen }: { scenario: Scenario; repaired: boolean; scanning: boolean; showExplanation: boolean; onScan: () => void; onExplain: () => void; onOpen: (view: View) => void }) {
  const [showFullAudit, setShowFullAudit] = useState(false);
  const score = repaired ? scenario.repairedScore : scenario.score;
  const audit = auditScenario(scenario);
  return <>
    <ViewHeading eyebrow="AGENT EXPERIENCE AUDIT" title="Is this website ready for agents?" description="Measure what an agent can discover, understand, execute, and recover from—not just whether a tool exists." action={<button className="button button-primary button-scan" onClick={onScan} disabled={scanning}>{scanning ? <RefreshCw size={16} className="spin" /> : <Radar size={17} />}{scanning ? "Running 42 checks…" : "Run AX scan"}</button>} />
    <div className="overview-hero">
      <Panel className="score-panel"><div className="score-copy"><div className="mini-label">AX HEALTH SCORE</div><h2>{scenario.company}</h2><p>{scenario.goal}</p><div className="score-meta"><SeverityBadge severity={repaired ? "passed" : scenario.severity} /><span>{repaired ? "Repaired contract" : `${scenario.findings.length} contract risks found`}</span></div></div><div className="score-visual"><ScoreRing score={score} /><button onClick={onExplain}>How is this calculated? <ArrowRight size={13} /></button></div>{scanning && <div className="scan-overlay"><div className="scan-line" /><Radar size={36} /><strong>Auditing the agent surface</strong><span>schemas · semantics · side effects · recovery</span></div>}</Panel>
      <Panel className="root-cause-preview"><div className="panel-heading"><span className="mini-label"><Zap size={13} /> TOP FAILURE</span><SeverityBadge severity={scenario.severity} /></div><h3>{scenario.rootCause}</h3><p>{scenario.impact}</p><button className="text-button" onClick={() => onOpen("xray")}>Open Failure X-Ray <ArrowRight size={14} /></button></Panel>
    </div>
    {showExplanation && <Panel className="explanation-panel"><div className="explanation-icon"><Info size={19} /></div><div><strong>Why {score}/100?</strong><p>The AX score is a transparent weighted audit: discoverability 25%, clarity 30%, reliability and recovery 25%, and safety 20%. Every point maps to a visible check below—there is no model-generated mystery number.</p></div></Panel>}
    <div className="metric-grid">{scenario.metrics.map((metric) => <MetricCard key={metric.key} metric={metric} repaired={repaired} />)}</div>
    <div className="overview-lower">
      <Panel><div className="panel-title-row"><div><span className="mini-label">EVIDENCE</span><h2>Priority findings</h2></div><button className="audit-toggle" onClick={() => setShowFullAudit((value) => !value)}>{showFullAudit ? "Hide rubric" : "View all 42 checks"}</button></div><div className="findings-list">{scenario.findings.map((finding, index) => <button key={finding.title} onClick={() => onOpen("surgeon")}><span className={`finding-index finding-${finding.severity}`}>0{index + 1}</span><div><strong>{finding.title}</strong><p>{finding.detail}</p></div><ArrowRight size={16} /></button>)}</div>{showFullAudit && <div className="embedded-audit"><AuditChecklist result={audit} compact /></div>}</Panel>
    </div>
  </>;
}

function XRay({ scenario, onOpenSurgeon }: { scenario: Scenario; onOpenSurgeon: () => void }) {
  const failedStep = scenario.trace.find((step) => step.state === "failed");
  const [selectedId, setSelectedId] = useState("execute");
  const selectedStep = scenario.trace.find((step) => step.id === selectedId) ?? scenario.trace[0];
  const selectedIndex = scenario.trace.findIndex((step) => step.id === selectedStep.id);
  const tracePayload = selectedStep.id === "input"
    ? { tool: scenario.toolBefore.name, arguments: Object.fromEntries(Object.keys((scenario.toolBefore.inputSchema as { properties?: Record<string, unknown> }).properties ?? {}).map((key) => [key, key.toLowerCase().includes("where") ? "prod-eu" : "demo-value"])) }
    : selectedStep.id === "execute"
      ? { ok: false, error: scenario.impact, recoverable: false }
      : { stage: selectedStep.id, observation: selectedStep.detail };
  return <>
    <ViewHeading eyebrow="AGENT FAILURE X-RAY" title="See exactly where the agent broke" description="A causal trace connects the user’s goal to discovery, selection, input, execution, and the underlying contract defect." action={<div className="trace-run"><span className="pulse-dot" /> Trace replayed · 1.8s</div>} />
    <Panel className="xray-stage"><div className="trace-head"><div><span className="mini-label">REPLAYING CONTROLLED ATTEMPT</span><h2>“{scenario.goal}”</h2></div><div className="legend"><span><i className="dot-good" />Passed</span><span><i className="dot-warn" />Risk introduced</span><span><i className="dot-bad" />Failed</span></div></div><div className="trace-workbench"><TraceFlow trace={scenario.trace} selectedId={selectedId} onStepSelect={setSelectedId} /><aside className="trace-inspector"><div className="inspector-head"><div><span className={`trace-state trace-state-${selectedStep.state}`}>{selectedStep.state}</span><strong>{selectedStep.label}</strong></div><span className="mono-badge">+{(selectedIndex * 0.31).toFixed(2)}s</span></div><div className="inspector-section"><span>AGENT REASONING</span><p>{selectedStep.state === "passed" ? `The available evidence supported this step: ${selectedStep.detail}.` : selectedStep.state === "warning" ? `The agent proceeded with incomplete evidence. ${selectedStep.detail} introduced ambiguity.` : `Execution diverged from the user goal. ${scenario.rootCause}`}</p></div><div className="inspector-section"><span>PAYLOAD</span><pre><code>{JSON.stringify(tracePayload, null, 2)}</code></pre></div><div className="inspector-section inspector-recovery"><span>RECOVERY</span><p>{selectedStep.state === "failed" ? "No rollback, retry classification, or compensating tool was exposed." : "Continue to the next trace stage."}</p></div></aside></div></Panel>
    <div className="xray-grid">
      <Panel className="root-cause-card"><div className="cause-icon"><ShieldAlert size={23} /></div><span className="mini-label">ROOT CAUSE · CONTRACT LEVEL</span><h2>{scenario.rootCause}</h2><p>{scenario.impact}</p><button className="button button-danger" onClick={onOpenSurgeon}><Stethoscope size={16} /> Send to Tool Surgeon</button></Panel>
      <Panel><div className="panel-title-row"><div><span className="mini-label">TRACE EVIDENCE</span><h2>What the agent saw</h2></div><span className="mono-badge">run_ax_04</span></div><div className="evidence-table"><div><span>Selected tool</span><code>{scenario.toolBefore.name}</code></div><div><span>Confidence</span><strong className="text-warn">0.61 · ambiguous</strong></div><div><span>First failure</span><strong>{failedStep?.label}</strong></div><div><span>Recovery options</span><strong className="text-bad">None exposed</strong></div><div><span>Reproducibility</span><strong className="text-good">12 / 12 runs</strong></div></div></Panel>
    </div>
  </>;
}

function Surgeon({ scenario, repaired, onRepair }: { scenario: Scenario; repaired: boolean; onRepair: () => void }) {
  const [copied, setCopied] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const repairedJson = JSON.stringify(scenario.toolAfter, null, 2);
  const copyRepair = async () => {
    await navigator.clipboard.writeText(repairedJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const downloadRepair = () => {
    const url = URL.createObjectURL(new Blob([repairedJson], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${scenario.toolAfter.name}.webmcp.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const testNames = ["Goal match", "Schema-valid input", "Unknown target", "Missing required input", "Duplicate retry", "Preview path", "Explicit consent", "Partial failure", "Recovery handle", "Concurrent change", "Cancellation", "Result grounding"];
  return <>
    <ViewHeading eyebrow="WEBMCP TOOL SURGEON" title="Repair the contract, then prove it" description="Diagnose semantic and safety defects, generate a constrained definition, and replay identical tests before shipping." action={<div className="surgeon-actions"><button className="button button-ghost" onClick={copyRepair}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy repair"}</button><button className="button button-ghost" onClick={downloadRepair}><Download size={16} /> Export JSON</button><button className="button button-primary" onClick={onRepair} disabled={repaired}>{repaired ? <Check size={16} /> : <Sparkles size={16} />}{repaired ? "Repair simulated" : "Apply in sandbox"}</button></div>} />
    <Panel className="diagnosis-strip"><div className="diagnosis-mark"><Stethoscope size={20} /></div><div><span className="mini-label">SURGEON’S NOTE</span><strong>{scenario.fixSummary}</strong></div><SeverityBadge severity={scenario.severity} /></Panel>
    <div className="code-compare"><CodeBlock definition={scenario.toolBefore} /><div className="compare-arrow"><ArrowRight size={20} /></div><CodeBlock definition={scenario.toolAfter} after /></div>
    <div className="surgeon-lower">
      <Panel><div className="panel-title-row"><div><span className="mini-label">PRESCRIPTION</span><h2>Contract changes</h2></div><span className="change-count">+4 safeguards</span></div><div className="prescription-list"><div><CheckCircle2 size={17} /><span><strong>Explicit intent</strong> names the real side effect</span></div><div><CheckCircle2 size={17} /><span><strong>Constrained inputs</strong> prevent unsafe inference</span></div><div><CheckCircle2 size={17} /><span><strong>Preview boundary</strong> separates inspection from mutation</span></div><div><CheckCircle2 size={17} /><span><strong>Recovery contract</strong> makes retries and rollback safe</span></div></div></Panel>
      <Panel className={`test-results ${repaired ? "tests-repaired" : ""}`}><div className="panel-title-row"><div><span className="mini-label">CONTROLLED REPLAY</span><h2>Before / after</h2></div><button className="test-detail-toggle" onClick={() => setShowTests((value) => !value)}>{showTests ? "Hide cases" : "Show 12 cases"}</button></div><div className="result-compare"><div><span>BEFORE</span><strong>{scenario.beforeTests.successRate}%</strong><small>{scenario.beforeTests.passed}/{scenario.beforeTests.total} pass · {scenario.beforeTests.median}</small></div><ArrowRight size={18} /><div><span>AFTER</span><strong className={repaired ? "text-good" : "muted-result"}>{repaired ? `${scenario.afterTests.successRate}%` : "—"}</strong><small>{repaired ? `${scenario.afterTests.passed}/${scenario.afterTests.total} pass · ${scenario.afterTests.median}` : "Apply repair to run"}</small></div></div><div className="result-meter"><span className="result-before" style={{ width: `${scenario.beforeTests.successRate}%` }} /><motion.span className="result-after" animate={{ width: repaired ? `${scenario.afterTests.successRate}%` : "0%" }} /></div>{showTests && <div className="test-case-table"><div><span>Test case</span><span>Before</span><span>After</span></div>{testNames.map((name, index) => <div key={name}><strong>{name}</strong><span className={index < scenario.beforeTests.passed ? "case-pass" : "case-fail"}>{index < scenario.beforeTests.passed ? "Pass" : "Fail"}</span><span className={!repaired ? "case-wait" : index < scenario.afterTests.passed ? "case-pass" : "case-fail"}>{!repaired ? "—" : index < scenario.afterTests.passed ? "Pass" : "Fail"}</span></div>)}</div>}</Panel>
    </div>
  </>;
}

function DigitalTwin({ scenario }: { scenario: Scenario }) {
  const maxRows = Math.max(scenario.humanPath.length, scenario.agentPath.length);
  return <>
    <ViewHeading eyebrow="HUMAN × AGENT DIGITAL TWIN" title="Same goal. Two very different products." description="Compare capabilities—not clicks—to catch agent paths that are technically possible but functionally incomplete." action={<div className="gap-pill"><CircleAlert size={15} /> {maxRows - Math.min(scenario.humanPath.length, scenario.agentPath.length) + 2} capability gaps</div>} />
    <div className="twin-grid">
      <Panel className="path-panel human-panel"><div className="path-header"><div className="path-icon"><UserRound size={20} /></div><div><span className="mini-label">HUMAN UI</span><h2>Visible workflow</h2></div><span className="path-score">Complete</span></div><div className="path-list">{scenario.humanPath.map((step, index) => <div className="path-step" key={step.label}><span className="path-number">{index + 1}</span><div><strong>{step.label}</strong><p>{step.detail}</p></div><Check size={16} /></div>)}</div></Panel>
      <div className="twin-axis"><span>GOAL</span><i /><span>OUTCOME</span></div>
      <Panel className="path-panel agent-panel"><div className="path-header"><div className="path-icon"><Bot size={20} /></div><div><span className="mini-label">AGENT / WEBMCP</span><h2>Exposed workflow</h2></div><span className="path-score path-score-bad">Incomplete</span></div><div className="path-list">{scenario.agentPath.map((step, index) => <div className={`path-step path-${step.state}`} key={step.label}><span className="path-number">{index + 1}</span><div><strong>{step.label}</strong><p>{step.detail}</p></div>{step.state === "passed" ? <Check size={16} /> : <CircleAlert size={16} />}</div>)}</div></Panel>
    </div>
    <Panel className="gap-callout"><div className="gap-icon"><GitCompareArrows size={23} /></div><div><span className="mini-label">CAPABILITY GAP</span><h2>{scenario.gap}</h2></div><div className="coverage"><span>Capability parity</span><strong>{Math.round((scenario.agentPath.filter((step) => step.state === "passed").length / scenario.humanPath.length) * 100)}%</strong></div></Panel>
    <Panel className="matrix-panel"><div className="panel-title-row"><div><span className="mini-label">PARITY MATRIX</span><h2>What exists for humans but not agents?</h2></div></div><div className="parity-matrix"><div className="matrix-head"><span>Capability</span><span>Human</span><span>Agent</span><span>Gap</span></div>{["Understand current state", "Preview consequences", "Confirm risky action", "Recover from failure"].map((label, index) => <div className="matrix-row" key={label}><strong>{label}</strong><span><CheckCircle2 size={16} /> Available</span><span className={index === 0 ? "matrix-partial" : "matrix-missing"}>{index === 0 ? <CircleAlert size={16} /> : <X size={16} />}{index === 0 ? "Partial" : "Missing"}</span><span>{index === 0 ? "Context" : index === 1 ? "Preview" : index === 2 ? "Consent" : "Recovery"}</span></div>)}</div></Panel>
  </>;
}

function ToolLab({ nativeState, activities, scenario, onInvoke }: { nativeState: NativeState; activities: ActivityItem[]; scenario: Scenario; onInvoke: (name: string) => void }) {
  const samplePayload = JSON.stringify({ tool: "trace_agent_failure", arguments: { scenarioId: scenario.id } }, null, 2);
  const [selfTest, setSelfTest] = useState<{ count: number; mode: "native" | "mirror" } | null>(null);
  const runRegistryProof = async () => {
    const tools = document.modelContext?.getTools ? await document.modelContext.getTools() : webMcpTools;
    setSelfTest({ count: tools.length, mode: document.modelContext?.getTools ? "native" : "mirror" });
  };
  return <>
    <ViewHeading eyebrow="NATIVE WEBMCP LAB" title="The diagnostic app is agent-operable" description="WebMCP Doctor does not merely inspect WebMCP—it exposes its own meaningful tools and synchronizes every call with the visible interface." action={<div className={`native-badge native-${nativeState}`}><span className="pulse-dot" />{nativeState === "native" ? "document.modelContext connected" : "Progressive demo bridge"}</div>} />
    <div className="lab-grid">
      <Panel className="tool-registry"><div className="panel-title-row"><div><span className="mini-label">REGISTERED ON THIS PAGE</span><h2>7 WebMCP tools</h2></div><span className="mono-badge">document.modelContext</span></div><div className="tool-list">{webMcpTools.map((tool) => { const Icon = tool.icon; return <div className="tool-row" key={tool.name}><div className="tool-icon"><Icon size={17} /></div><div><code>{tool.name}</code><p>{tool.description}</p></div><button onClick={() => onInvoke(tool.name)}><Play size={12} fill="currentColor" /> Invoke</button></div>; })}</div></Panel>
      <div className="lab-side">
        <Panel className="native-proof-panel"><div className="panel-title-row"><div><span className="mini-label">CAPABILITY PROOF</span><h2>WebMCP readiness</h2></div><button className="proof-run" onClick={runRegistryProof}><ScanLine size={13} /> Self-test</button></div><div className="proof-rows"><div><span>Secure context</span><strong className={typeof window !== "undefined" && window.isSecureContext ? "text-good" : "text-warn"}>{typeof window !== "undefined" && window.isSecureContext ? "Available" : "Local preview"}</strong></div><div><span>Imperative API</span><strong className={nativeState === "native" ? "text-good" : "text-warn"}>{nativeState === "native" ? "Native" : "Progressive fallback"}</strong></div><div><span>Tool registration</span><strong className="text-good">7 declared</strong></div><div><span>Registry readback</span><strong className={selfTest ? "text-good" : ""}>{selfTest ? `${selfTest.count} found · ${selfTest.mode}` : "Not tested"}</strong></div></div>{selfTest && <div className="proof-success"><CheckCircle2 size={15} /><span>Round-trip verified. The scanner can inspect the same registry an agent sees.</span></div>}</Panel>
        <Panel className="activity-panel"><div className="panel-title-row"><div><span className="mini-label">LIVE ACTIVITY</span><h2>Agent → interface</h2></div><span className="live-label"><i /> LIVE</span></div>{activities.length === 0 ? <div className="activity-empty"><Bot size={27} /><strong>No tool calls yet</strong><p>Invoke a tool to watch it navigate and update the dashboard.</p></div> : <div className="activity-list">{activities.map((item) => <div key={item.id}><span className={`source-icon source-${item.source}`}>{item.source === "agent" ? <Bot size={13} /> : <Play size={11} />}</span><div><code>{item.tool}</code><p>{item.detail}</p></div><time>now</time></div>)}</div>}</Panel>
        <Panel className="payload-panel"><div className="panel-title-row"><div><span className="mini-label">SAMPLE INVOCATION</span><h2>Try from an agent</h2></div><ClipboardCheck size={17} /></div><pre><code>{samplePayload}</code></pre><p>Result includes <code>uiUpdated: true</code>, and opens the matching visual trace for shared human-agent context.</p></Panel>
      </div>
    </div>
  </>;
}
