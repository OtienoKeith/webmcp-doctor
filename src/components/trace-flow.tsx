"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
export type TraceStep = {
  id: string;
  label: string;
  detail: string;
  state: "passed" | "warning" | "failed";
};

const stateColor = {
  passed: "#22c55e",
  warning: "#f59e0b",
  failed: "#f05252",
};

export function TraceFlow({ trace, selectedId, onStepSelect }: { trace: TraceStep[]; selectedId?: string; onStepSelect?: (id: string) => void }) {
  const nodes = useMemo<Node[]>(
    () =>
      trace.map((step, index) => ({
        id: step.id,
        position: { x: index * 218, y: index % 2 === 0 ? 30 : 118 },
        data: {
          label: (
            <div className="trace-node-copy">
              <span className={`trace-state trace-state-${step.state}`}>
                {step.state === "passed" ? "PASS" : step.state === "warning" ? "RISK" : "FAIL"}
              </span>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </div>
          ),
        },
        className: `trace-node trace-node-${step.state}`,
        selected: selectedId === step.id,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      })),
    [selectedId, trace],
  );

  const edges = useMemo<Edge[]>(
    () =>
      trace.slice(0, -1).map((step, index) => {
        const next = trace[index + 1];
        return {
          id: `${step.id}-${next.id}`,
          source: step.id,
          target: next.id,
          animated: next.state !== "passed",
          type: "smoothstep",
          style: { stroke: stateColor[next.state], strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: stateColor[next.state] },
        };
      }),
    [trace],
  );

  return (
    <div className="trace-canvas" aria-label="Agent failure trace visualization">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.55}
        maxZoom={1.2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => onStepSelect?.(node.id)}
        panOnScroll={false}
        zoomOnScroll={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(148,163,184,.15)" />
        <Controls showInteractive={false} className="flow-controls" />
      </ReactFlow>
    </div>
  );
}
