"use client";

import { useEffect, useRef } from "react";
import type { AgentSnapshot, MemoryNode } from "@/lib/types";

// Colour a node by what kind of thing Cognee extracted it as.
const KIND_COLOR: Record<MemoryNode["kind"], string> = {
  person: "#37E2D5",
  project: "#FFC24B",
  decision: "#FF3D8B",
  fact: "#8580B0",
};
const ACCENTS: Record<string, string> = {
  cyan: "#37E2D5",
  magenta: "#FF3D8B",
  gold: "#FFC24B",
  amnesia: "#9a96b8",
};

export default function MemoryPanel({ agents }: { agents: AgentSnapshot[] }) {
  return (
    <div className="flex flex-col gap-3 font-geist">
      {agents.map((a) => (
        <MemoryBank key={a.persona.id} snapshot={a} />
      ))}
    </div>
  );
}

function MemoryBank({ snapshot }: { snapshot: AgentSnapshot }) {
  const { persona, memory, meetingsRetained, tokens } = snapshot;
  const accent = ACCENTS[persona.accent] ?? "#8580B0";
  const nodes = (memory?.nodes ?? []).slice(-12);
  const usedPct = Math.min(100, (tokens.used / tokens.budget) * 100);
  const empty = tokens.remaining <= 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: accent }} />
          <span className="text-sm font-medium text-white">{persona.name}</span>
        </div>
        {persona.remembers ? (
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70">
            {meetingsRetained} retained
          </span>
        ) : (
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/35">
            no memory
          </span>
        )}
      </div>

      {/* token budget meter */}
      <div className="mb-2">
        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-white/40">
          <span>tokens</span>
          <span className={empty ? "text-danger" : "text-white/50"}>
            {tokens.used} / {tokens.budget}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${usedPct}%`, background: empty ? "#FF5470" : accent }}
          />
        </div>
      </div>

      {persona.remembers ? (
        <Graph3D nodes={nodes} accent={accent} />
      ) : (
        <div className="flex h-[150px] items-center justify-center rounded-lg bg-black/40">
          <span className="text-[11px] text-white/30">— no graph · nothing stored —</span>
        </div>
      )}
    </div>
  );
}

/** A tiny animated 3D knowledge graph: agent hub at the centre, memory nodes on
 * a slowly rotating sphere, edges drawn hub→node. Pure canvas, no libraries. */
function Graph3D({ nodes, accent }: { nodes: MemoryNode[]; accent: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 150;
    const resize = () => {
      W = canvas.clientWidth;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Distribute nodes on a sphere (fibonacci) for an even 3D cloud.
    const R = 52;
    const focal = 240;
    const pts = nodes.map((node, i) => {
      const k = nodes.length > 1 ? i / (nodes.length - 1) : 0.5;
      const phi = Math.acos(1 - 2 * (k * 0.86 + 0.07)); // avoid exact poles
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      return {
        node,
        x: R * Math.sin(phi) * Math.cos(theta),
        y: R * Math.cos(phi),
        z: R * Math.sin(phi) * Math.sin(theta),
      };
    });

    let angle = 0;
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const frame = () => {
      const cx = W / 2;
      const cy = H / 2;
      ctx.clearRect(0, 0, W, H);

      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      const proj = pts
        .map((p) => {
          const x = p.x * cos - p.z * sin;
          const z = p.x * sin + p.z * cos;
          const scale = focal / (focal - z);
          return { node: p.node, sx: cx + x * scale, sy: cy + p.y * scale, z, scale };
        })
        .sort((a, b) => a.z - b.z); // back-to-front

      // edges hub → node
      for (const p of proj) {
        const depth = (p.z + R) / (2 * R); // 0 back … 1 front
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.12 + depth * 0.28;
        ctx.lineWidth = 0.6 + depth;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(p.sx, p.sy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // nodes
      for (const p of proj) {
        const depth = (p.z + R) / (2 * R);
        const r = 2.5 + depth * 4;
        const color = KIND_COLOR[p.node.kind];
        ctx.globalAlpha = 0.45 + depth * 0.55;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 6 + depth * 10;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // label for front-facing nodes only
        if (depth > 0.62) {
          ctx.globalAlpha = (depth - 0.62) / 0.38;
          ctx.fillStyle = "#cbd5f5";
          ctx.font = "9px monospace";
          ctx.textAlign = "center";
          ctx.fillText(trunc(p.node.label, 14), p.sx, p.sy - r - 3);
        }
      }
      ctx.globalAlpha = 1;

      // central hub (the agent)
      ctx.fillStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (!reduce) angle += 0.006;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [nodes, accent]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-[150px] items-center justify-center rounded-lg bg-black/40">
        <span className="text-[11px] text-white/30">empty — hold a meeting to build the graph</span>
      </div>
    );
  }

  return (
    <canvas
      ref={ref}
      className="h-[150px] w-full rounded-lg bg-black/40"
      role="img"
      aria-label={`Knowledge graph with ${nodes.length} nodes`}
    />
  );
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
