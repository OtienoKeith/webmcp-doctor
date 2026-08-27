"use client";

import { useState, type FormEvent } from "react";
import { Activity, Globe2, LockKeyhole, Radar, ShieldCheck } from "lucide-react";
import { auditTools, type AuditableTool } from "@/lib/audit";
import type { HumanCapability, ScanArtifact } from "@/lib/scan-analysis";

type RemoteScanResponse = {
  title: string;
  finalUrl: string;
  requestedUrl: string;
  tools: AuditableTool[];
  humanCapabilities: HumanCapability[];
  scannedAt: string;
  cached: boolean;
  signals: {
    nativeApi: boolean;
    capturedRegistrations: number;
    declarativeForms: number;
  };
};

export function ScannerView({ onScanned }: { onScanned: (artifact: ScanArtifact) => void }) {
  const [siteUrl, setSiteUrl] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

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
      if (!response.ok || !("tools" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "The website could not be scanned.");
      }
      const result = auditTools(payload.tools, { source: "remote", label: payload.title });
      onScanned({
        result,
        tools: payload.tools,
        humanCapabilities: payload.humanCapabilities,
        site: {
          requestedUrl: payload.requestedUrl,
          finalUrl: payload.finalUrl,
          scannedAt: payload.scannedAt,
          cached: payload.cached,
          signals: payload.signals,
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The website could not be scanned.");
    } finally {
      setScanning(false);
    }
  };

  return <section className="scan-hero" id="scan">
    <div className="scan-hero-copy">
      <span className="eyebrow">WEBMCP AGENT EXPERIENCE AUDIT</span>
      <h1>See what an agent sees.</h1>
      <p>Enter a public website. WebMCP Doctor renders the live page, discovers its WebMCP tools, and shows the contract risks and capability gaps that matter.</p>
      <div className="scanner-trust"><LockKeyhole size={15} /><div><strong>Read-only inspection</strong><span>Discovered tools are never executed</span></div></div>
    </div>
    <form className="panel essential-scan-card" onSubmit={scanSite}>
      <label htmlFor="site-url"><Globe2 size={15} /> WEBSITE URL</label>
      <div className="essential-scan-input">
        <input id="site-url" type="url" value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="https://your-webmcp-site.com" required autoComplete="url" />
        <button className="button button-primary" disabled={scanning}>{scanning ? <Activity size={16} className="spin" /> : <Radar size={16} />}{scanning ? "Scanning…" : "Scan site"}</button>
      </div>
      <p><ShieldCheck size={13} /> Public HTTP(S) pages only. Private networks are blocked.</p>
      {error && <div className="manifest-error">{error}</div>}
    </form>
  </section>;
}
