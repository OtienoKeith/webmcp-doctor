"use client";

import { useRef, useState, type FormEvent } from "react";
import { Activity, Braces, CheckCircle2, ExternalLink, FileJson, Globe2, LockKeyhole, Radar, ScanLine, Server, ShieldCheck, Upload, WandSparkles } from "lucide-react";
import { AuditChecklist } from "@/components/audit-checklist";
import { auditTools, parseToolManifest, type AuditableTool, type AuditResult } from "@/lib/audit";

type NativeContext = {
  getTools?: () => Promise<Array<{ name: string; title?: string; description: string; inputSchema?: string | Record<string, unknown>; annotations?: AuditableTool["annotations"] }>>;
};

type RemoteScanResponse = {
  title: string;
  finalUrl: string;
  requestedUrl: string;
  tools: AuditableTool[];
  scannedAt: string;
  cached: boolean;
  signals: {
    nativeApi: boolean;
    capturedRegistrations: number;
    declarativeForms: number;
  };
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
  const [siteUrl, setSiteUrl] = useState("");
  const [manifest, setManifest] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [siteScan, setSiteScan] = useState<RemoteScanResponse | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const finish = (next: AuditResult) => {
    setResult(next);
    setError("");
    onScanned(next);
  };

  const auditManifest = () => {
    if (!manifest.trim()) {
      setError("Paste a WebMCP tool manifest or open a JSON file first.");
      return;
    }
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

  const scanSite = async (event: FormEvent) => {
    event.preventDefault();
    setScanning(true);
    setError("");
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: siteUrl }),
      });
      const payload = await response.json() as RemoteScanResponse | { error?: string };
      if (!response.ok || !("tools" in payload)) throw new Error("error" in payload && payload.error ? payload.error : "The website could not be scanned.");
      setSiteScan(payload);
      finish(auditTools(payload.tools, { source: "remote", label: payload.title }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The website could not be scanned.");
    } finally {
      setScanning(false);
    }
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
    <div className="view-heading scanner-heading"><div><span className="eyebrow">REAL-SITE AX SCANNER</span><h1>Audit a live WebMCP website</h1><p>Enter any public URL. WebMCP Doctor renders the real page, captures its registered tools, and runs the complete 42-check AX audit.</p></div><div className="scanner-trust"><LockKeyhole size={15} /><div><strong>Read-only inspection</strong><span>Tools are discovered, never executed</span></div></div></div>
    <div className="scanner-layout">
      <section className="panel manifest-panel">
        <div className="panel-title-row"><div><span className="mini-label">PRIMARY INPUT</span><h2>Public website URL</h2></div><span className="live-label"><i /> LIVE</span></div>
        <form className="site-scan-form" onSubmit={scanSite}>
          <label htmlFor="site-url"><Globe2 size={15} /> WEBSITE TO AUDIT</label>
          <div><input id="site-url" type="url" value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="https://your-webmcp-site.com" required autoComplete="url" /><button className="button button-primary" disabled={scanning}>{scanning ? <Activity size={16} className="spin" /> : <Radar size={16} />}{scanning ? "Rendering site…" : "Scan live site"}</button></div>
          <p><ShieldCheck size={13} /> Public HTTP(S) pages only. Private networks are blocked and discovered tools are not invoked.</p>
        </form>
        <div className="input-divider"><span>Alternative inputs</span></div>
        <div className="scan-mode-grid">
          <button onClick={selfScan}><span><ScanLine size={18} /></span><div><strong>Scan this page</strong><p>{nativeAvailable ? "Read the native WebMCP registry" : "Audit the progressive registry mirror"}</p></div><CheckCircle2 size={15} /></button>
          <button onClick={() => fileRef.current?.click()}><span><Upload size={18} /></span><div><strong>Open JSON file</strong><p>Load an array or {`{ tools: [] }`}</p></div><FileJson size={15} /></button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => loadFile(event.target.files?.[0])} />
        </div>
        <label className="manifest-editor"><span><Braces size={14} /> OPTIONAL JSON MANIFEST</span><textarea value={manifest} onChange={(event) => setManifest(event.target.value)} spellCheck={false} aria-label="WebMCP tool manifest" placeholder={'{\n  "tools": []\n}'} /></label>
        {error && <div className="manifest-error">{error}</div>}
        <button className="button button-primary scan-manifest-button" onClick={auditManifest} disabled={scanning}>{scanning ? <Activity size={16} className="spin" /> : <Radar size={16} />}{scanning ? "Running AX rubric…" : "Audit manifest"}</button>
      </section>

      <section className="panel scan-result-panel">
        {!result ? <div className="scan-empty"><div className="scan-empty-icon"><WandSparkles size={26} /></div><span className="mini-label">READY FOR A REAL URL</span><h2>42 checks. Zero guesswork.</h2><p>Scan a deployed site to inspect the tool contracts its page actually registers after JavaScript runs.</p><div className="empty-categories"><span>11 Discoverability</span><span>11 Clarity</span><span>12 Reliability</span><span>8 Safety</span></div></div> : <>
          {siteScan && result.source === "remote" && <div className="site-scan-proof"><Server size={17} /><div><strong>Rendered at the edge</strong><a href={siteScan.finalUrl} target="_blank" rel="noreferrer">{siteScan.finalUrl} <ExternalLink size={11} /></a></div><span>{siteScan.signals.capturedRegistrations} imperative · {siteScan.signals.declarativeForms} declarative{siteScan.cached ? " · cached" : ""}</span></div>}
          <div className="scan-result-hero"><div className={`scan-score scan-score-${scoreTone(result.score)}`}><strong>{result.score}</strong><span>/100</span></div><div><span className="mini-label">AX HEALTH RESULT</span><h2>{result.label}</h2><p>{result.toolCount} tool{result.toolCount === 1 ? "" : "s"} · {result.source === "native" ? "native registry" : result.source === "remote" ? "live website" : result.source === "manifest" ? "local manifest" : "demo fixture"}</p></div></div>
          <div className="category-score-grid">{Object.entries(result.categoryScores).map(([category, score]) => <div key={category}><span>{category === "reliability" ? "Reliability" : category}</span><strong>{score}</strong><i><b style={{ width: `${score}%` }} /></i></div>)}</div>
          <AuditChecklist result={result} />
        </>}
      </section>
    </div>
  </>;
}
