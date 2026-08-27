"use client";

import { useRef, useState } from "react";
import { Activity, Braces, CheckCircle2, FileJson, LockKeyhole, Radar, ScanLine, Upload, WandSparkles } from "lucide-react";
import { AuditChecklist } from "@/components/audit-checklist";
import { auditTools, parseToolManifest, type AuditableTool, type AuditResult } from "@/lib/audit";

const sampleManifest = JSON.stringify({
  tools: [{
    name: "finalizeCart",
    description: "Finalizes the current shopping cart.",
    inputSchema: {
      type: "object",
      properties: { shipping: { type: "string" } },
    },
  }],
}, null, 2);

type NativeContext = {
  getTools?: () => Promise<Array<{ name: string; title?: string; description: string; inputSchema?: string | Record<string, unknown>; annotations?: AuditableTool["annotations"] }>>;
};

function scoreTone(score: number) {
  return score >= 85 ? "good" : score >= 65 ? "warn" : "bad";
}

function normalizeNativeTools(tools: Awaited<ReturnType<NonNullable<NativeContext["getTools"]>>>): AuditableTool[] {
  return tools.map((tool) => ({
    ...tool,
    inputSchema: typeof tool.inputSchema === "string" ? JSON.parse(tool.inputSchema) : (tool.inputSchema ?? { type: "object" }),
  }));
}

export function ScannerView({ nativeAvailable, fallbackTools, onScanned }: { nativeAvailable: boolean; fallbackTools: AuditableTool[]; onScanned: (result: AuditResult) => void }) {
  const [manifest, setManifest] = useState(sampleManifest);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const finish = (next: AuditResult) => {
    setResult(next);
    setError("");
    onScanned(next);
  };

  const auditManifest = () => {
    setScanning(true);
    window.setTimeout(() => {
      try {
        finish(auditTools(parseToolManifest(manifest), { source: "manifest", label: "Imported manifest" }));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The manifest could not be parsed.");
      } finally {
        setScanning(false);
      }
    }, 450);
  };

  const selfScan = async () => {
    setScanning(true);
    try {
      const context = document.modelContext as NativeContext | undefined;
      const nativeTools = context?.getTools ? normalizeNativeTools(await context.getTools()) : fallbackTools;
      finish(auditTools(nativeTools, { source: context?.getTools ? "native" : "manifest", label: context?.getTools ? "This page · native registry" : "This page · demo bridge" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Self-scan failed.");
    } finally {
      setScanning(false);
    }
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      parseToolManifest(text);
      setManifest(text);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected file is not a valid tool manifest.");
    }
  };

  return <>
    <div className="view-heading scanner-heading"><div><span className="eyebrow">LIVE AX SCANNER</span><h1>Bring your own WebMCP tools</h1><p>Self-scan this document or import a tool manifest. Everything is parsed and scored locally in your browser.</p></div><div className="scanner-trust"><LockKeyhole size={15} /><div><strong>Private by design</strong><span>No uploads · no paid API</span></div></div></div>
    <div className="scanner-layout">
      <section className="panel manifest-panel">
        <div className="panel-title-row"><div><span className="mini-label">INPUT</span><h2>Tool manifest</h2></div><span className="mono-badge">JSON</span></div>
        <div className="scan-mode-grid">
          <button onClick={selfScan}><span><ScanLine size={18} /></span><div><strong>Scan this page</strong><p>{nativeAvailable ? "Read the native WebMCP registry" : "Audit the progressive registry mirror"}</p></div><CheckCircle2 size={15} /></button>
          <button onClick={() => fileRef.current?.click()}><span><Upload size={18} /></span><div><strong>Open JSON file</strong><p>Load an array or {`{ tools: [] }`}</p></div><FileJson size={15} /></button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => loadFile(event.target.files?.[0])} />
        </div>
        <label className="manifest-editor"><span><Braces size={14} /> PASTE OR EDIT MANIFEST</span><textarea value={manifest} onChange={(event) => setManifest(event.target.value)} spellCheck={false} aria-label="WebMCP tool manifest" /></label>
        {error && <div className="manifest-error">{error}</div>}
        <button className="button button-primary scan-manifest-button" onClick={auditManifest} disabled={scanning}>{scanning ? <Activity size={16} className="spin" /> : <Radar size={16} />}{scanning ? "Running AX rubric…" : "Audit manifest"}</button>
      </section>

      <section className="panel scan-result-panel">
        {!result ? <div className="scan-empty"><div className="scan-empty-icon"><WandSparkles size={26} /></div><span className="mini-label">READY TO SCAN</span><h2>42 checks. Zero mystery.</h2><p>Run a scan to inspect discoverability, clarity, reliability and recovery, plus WebMCP-specific safety boundaries.</p><div className="empty-categories"><span>11 Discoverability</span><span>11 Clarity</span><span>12 Reliability</span><span>8 Safety</span></div></div> : <>
          <div className="scan-result-hero"><div className={`scan-score scan-score-${scoreTone(result.score)}`}><strong>{result.score}</strong><span>/100</span></div><div><span className="mini-label">AX HEALTH RESULT</span><h2>{result.label}</h2><p>{result.toolCount} tool{result.toolCount === 1 ? "" : "s"} · {result.source === "native" ? "native registry" : result.source === "manifest" ? "local manifest" : "demo fixture"}</p></div></div>
          <div className="category-score-grid">{Object.entries(result.categoryScores).map(([category, score]) => <div key={category}><span>{category === "reliability" ? "Reliability" : category}</span><strong>{score}</strong><i><b style={{ width: `${score}%` }} /></i></div>)}</div>
          <AuditChecklist result={result} />
        </>}
      </section>
    </div>
  </>;
}
