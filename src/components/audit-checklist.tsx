"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, CircleAlert, ShieldX } from "lucide-react";
import type { AuditResult, AuditStatus, MetricKey } from "@/lib/audit";

const categoryLabels: Record<MetricKey, string> = {
  discoverability: "Discoverability",
  clarity: "Tool clarity",
  reliability: "Reliability & recovery",
  safety: "Safety",
};

const statusIcons = {
  passed: CheckCircle2,
  warning: CircleAlert,
  failed: ShieldX,
};

export function AuditChecklist({ result, compact = false }: { result: AuditResult; compact?: boolean }) {
  const [filter, setFilter] = useState<"all" | AuditStatus>(compact ? "failed" : "all");
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = useMemo(() => result.checks.filter((check) => filter === "all" || check.status === filter), [filter, result.checks]);
  const counts = useMemo(() => ({
    passed: result.checks.filter((check) => check.status === "passed").length,
    warning: result.checks.filter((check) => check.status === "warning").length,
    failed: result.checks.filter((check) => check.status === "failed").length,
  }), [result.checks]);

  return <div className="audit-checklist">
    <div className="checklist-toolbar">
      <div className="check-filters">
        {(["all", "failed", "warning", "passed"] as const).map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status}<span>{status === "all" ? result.checks.length : counts[status]}</span></button>)}
      </div>
      <span className="rubric-version">AX rubric v1.0 · 42 checks</span>
    </div>
    <div className={`checklist-rows ${compact ? "checklist-compact" : ""}`}>
      {visible.map((check) => {
        const Icon = statusIcons[check.status];
        const open = openId === check.id;
        return <div className={`check-row check-${check.status}`} key={check.id}>
          <button onClick={() => setOpenId(open ? null : check.id)} aria-expanded={open}>
            <span className="check-icon"><Icon size={16} /></span>
            <span className="check-copy"><small>{categoryLabels[check.category]}</small><strong>{check.label}</strong></span>
            <span className={`check-status status-${check.status}`}>{check.status}</span>
            <ChevronDown size={15} className={open ? "chevron-open" : ""} />
          </button>
          {open && <div className="check-detail"><div><span>EVIDENCE</span><p>{check.evidence}</p></div><div><span>REMEDIATION</span><p>{check.remediation}</p></div></div>}
        </div>;
      })}
      {visible.length === 0 && <div className="no-checks">No checks match this filter.</div>}
    </div>
  </div>;
}
