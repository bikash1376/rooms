"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import MemoryPanel from "@/components/MemoryPanel";
import ChatFeed from "@/components/ChatFeed";
import TaskBoard from "@/components/TaskBoard";
import MemoryAdmin from "@/components/MemoryAdmin";
import type OfficeScene from "@/components/game/OfficeScene";
import type { AgentId, AgentSnapshot, TurnLine } from "@/lib/types";

const PhaserGame = dynamic(() => import("@/components/game/PhaserGame"), { ssr: false });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const PLAYER_NAME = "Bikash";
const DEFAULT_TOPIC = "Weekly sync — what should we focus on this sprint?";

interface Status {
  memoryLive: boolean;
  dialogueLive: boolean;
  memoryAgents: string[];
}
interface AgentConfig {
  id: AgentId;
  name: string;
  persona: string;
  role: string;
  remembers: boolean;
  accent: string;
}
type Tab = "chat" | "memory" | "settings";
type Mode = "work" | "meet";

export default function Room() {
  const sceneRef = useRef<OfficeScene | null>(null);
  const [loading, setLoading] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const [minDone, setMinDone] = useState(false);
  const [agents, setAgents] = useState<AgentSnapshot[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [config, setConfig] = useState<AgentConfig[]>([]);
  const [topic, setTopic] = useState("");
  const [running, setRunning] = useState(false);
  const [feed, setFeed] = useState<TurnLine[]>([]);
  const [sidebar, setSidebar] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [mode, setMode] = useState<Mode>("work");
  const [boardNear, setBoardNear] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [memoryAdminOpen, setMemoryAdminOpen] = useState(false);
  // Mirrors for use inside the async meeting loop without stale closures.
  const modeRef = useRef<Mode>("work");
  const runningRef = useRef(false);
  // Chat lines already typed out — so switching tabs doesn't replay the animation.
  const typedRef = useRef<Set<string>>(new Set());

  const refreshTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      const data = await res.json();
      for (const a of data.agents ?? []) {
        const doing = a.tasks?.find((t: { status: string }) => t.status === "doing") ?? a.tasks?.[0];
        sceneRef.current?.setAgentTask(a.id, doing ? doing.title : "");
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  const refreshMemory = useCallback(async () => {
    try {
      const res = await fetch("/api/memory", { cache: "no-store" });
      const data = await res.json();
      setAgents(data.agents);
      setStatus(data.status);
    } catch {
      /* keep prior */
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      const data = await res.json();
      setConfig(data.agents);
    } catch {
      /* keep prior */
    }
  }, []);

  useEffect(() => {
    refreshMemory();
    refreshConfig();
    const t1 = setTimeout(() => setMinDone(true), 3000);
    const t2 = setTimeout(() => setLoading(false), 10000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [refreshMemory, refreshConfig]);

  useEffect(() => {
    if (minDone && sceneReady) setLoading(false);
  }, [minDone, sceneReady]);

  const onReady = useCallback((scene: OfficeScene) => {
    sceneRef.current = scene;
    scene.setPlayerName(PLAYER_NAME);
    scene.setBoardHandlers(
      (near) => setBoardNear(near),
      () => setBoardOpen(true)
    );
    setSceneReady(true);
  }, []);

  // Push agent names into the game once both the scene and config are ready.
  useEffect(() => {
    if (!sceneReady) return;
    for (const c of config) sceneRef.current?.setAgentName(c.id, c.name);
  }, [sceneReady, config]);

  // Feed each agent's current task into the game (desk "doing X" tags).
  useEffect(() => {
    if (sceneReady) refreshTasks();
  }, [sceneReady, refreshTasks]);

  // Freeze WASD/board input while a modal (task board or memory manager) is open.
  useEffect(() => {
    sceneRef.current?.setInputEnabled(!(boardOpen || memoryAdminOpen));
  }, [boardOpen, memoryAdminOpen]);

  // When the sidebar opens/closes it resizes the game area; nudge Phaser to refit
  // the canvas (its RESIZE scale mode listens for window resize).
  useEffect(() => {
    const fire = () => window.dispatchEvent(new Event("resize"));
    const raf = requestAnimationFrame(fire);
    const t = setTimeout(fire, 260); // after the width transition settles
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [sidebar]);

  // Run one meeting: the agents (already seated) discuss the topic. Bubbles play
  // out live; bail early if the admin flips back to WORK mid-session.
  const runDiscussion = useCallback(
    async (t: string) => {
      const scene = sceneRef.current;
      if (!scene || runningRef.current) return;
      runningRef.current = true;
      setRunning(true);
      setFeed([]);
      setSidebar(true);
      setTab("chat");
      scene.clearAllBubbles();
      const transcript: TurnLine[] = [];
      await sleep(1600); // let everyone reach their chair first
      try {
        let i = 0;
        let done = false;
        // Drive the meeting one turn at a time. Each turn is a separate API call,
        // and we wait 5s after showing a line before requesting the next — this
        // spaces out the calls and plays the dialogue live.
        while (!done && modeRef.current === "meet") {
          const res = await fetch("/api/turn", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: t, transcript, turnIndex: i }),
          });
          if (!res.ok) throw new Error("turn failed");
          const data = await res.json();
          const line: TurnLine = data.line;
          transcript.push(line);
          setFeed([...transcript]);
          scene.setActiveSpeaker(line.agentId);
          scene.showBubble(line.agentId, truncate(line.text, 140));
          await refreshMemory(); // live knowledge graph + token meters, every request
          done = data.done;
          i += 1;
          if (!done && modeRef.current === "meet") await sleep(5000);
        }
        scene.setActiveSpeaker(null);
      } catch {
        scene.showBubble("nova", "The meeting fell apart — check the server.");
      } finally {
        runningRef.current = false;
        setRunning(false);
      }
    },
    [refreshMemory]
  );

  // Sidebar toggle: MEET gathers the team and starts them talking; WORK sends
  // them back to their desks in silence.
  const goMeet = useCallback(
    (t?: string) => {
      setMode("meet");
      modeRef.current = "meet";
      sceneRef.current?.enterMeet();
      const topicToUse = (t ?? topic).trim() || DEFAULT_TOPIC;
      runDiscussion(topicToUse);
    },
    [topic, runDiscussion]
  );

  const goWork = useCallback(() => {
    setMode("work");
    modeRef.current = "work";
    sceneRef.current?.enterWork();
    sceneRef.current?.setActiveSpeaker(null);
    sceneRef.current?.clearAllBubbles();
  }, []);

  const freeze = (on: boolean) => sceneRef.current?.setInputEnabled(!on);

  return (
    <main className="relative flex h-screen w-screen overflow-hidden bg-[#5b9d55]">
      <div className="relative min-w-0 flex-1">
        <PhaserGame onReady={onReady} />

      {/* sidebar toggle (only chrome left on top) */}
      <button
        onClick={() => setSidebar((s) => !s)}
        aria-label={sidebar ? "Close panel" : "Open panel"}
        className="absolute right-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-[#0c1622]/85 text-white backdrop-blur transition hover:bg-[#0c1622]"
      >
        <span className="font-geist text-lg leading-none">{sidebar ? "×" : "☰"}</span>
      </button>

      {/* controls hint */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-lg bg-[#0c1622]/70 px-3 py-1.5 font-geist text-[11px] text-white/70 backdrop-blur">
        WASD / arrows to walk · you are <span className="text-[#0072ff]">{PLAYER_NAME}</span>
        <span className="ml-2 text-white/40">
          · office is in <span className="text-white/70">{mode === "meet" ? "MEET" : "WORK"}</span> mode
        </span>
      </div>

      {/* topic bar — always available; type a topic in WORK mode and Call Meeting
          gathers the team and starts them talking about it. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Drop focus so keyboard control returns to the player — otherwise the
          // input stays focused and WASD won't move Bikash after calling a meeting.
          (document.activeElement as HTMLElement | null)?.blur();
          const t = topic.trim();
          if (t) goMeet(t);
        }}
        className="absolute bottom-3 left-1/2 z-20 flex w-[min(680px,92vw)] -translate-x-1/2 items-center gap-2 rounded-xl bg-[#0c1622]/85 p-2 backdrop-blur"
      >
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onFocus={() => freeze(true)}
          onBlur={() => freeze(false)}
          disabled={running}
          maxLength={140}
          placeholder="Give the team a topic to meet about…"
          className="min-w-0 flex-1 rounded-lg bg-black/30 px-3 py-2 font-geist text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#0072ff] disabled:opacity-50"
        />
        {running ? (
          <button
            type="button"
            onClick={goWork}
            className="whitespace-nowrap rounded-lg bg-red-500/90 px-4 py-2 font-geist text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-red-600"
          >
            ■ Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!topic.trim()}
            className="whitespace-nowrap rounded-lg bg-[#0072ff] px-4 py-2 font-geist text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mode === "meet" ? "New topic" : "Call meeting"}
          </button>
        )}
      </form>
      </div>

      {/* sidebar — a flex sibling, so opening it narrows the office instead of
          covering it. */}
      <aside
        className="z-30 flex h-full flex-col overflow-hidden border-l border-white/10 bg-[#0c1622]/95 backdrop-blur transition-[width] duration-200"
        style={{ width: sidebar ? "min(400px, 92vw)" : 0 }}
      >
        {/* Admin office-mode switch — the human (Bikash) drives the whole team. */}
        <div className="border-b border-white/10 p-3 pr-14">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-geist text-[10px] uppercase tracking-wider text-white/40">
              Office mode
            </span>
            {running && (
              <button
                onClick={goWork}
                className="flex items-center gap-1.5 rounded-md bg-red-500/20 px-2.5 py-1 font-geist text-[10px] font-semibold uppercase tracking-wider text-red-400 transition hover:bg-red-500/30 hover:text-red-300"
              >
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                Stop meeting
              </button>
            )}
          </div>
          <div className="flex gap-1 rounded-lg bg-black/30 p-1">
            <button
              onClick={goWork}
              disabled={mode === "work"}
              className={`flex-1 rounded-md px-3 py-2 font-geist text-xs font-semibold uppercase tracking-wide transition ${
                mode === "work"
                  ? "bg-[#0072ff] text-white"
                  : "text-white/60 hover:text-white disabled:opacity-40"
              }`}
            >
              Work
            </button>
            <button
              onClick={() => goMeet()}
              disabled={mode === "meet"}
              className={`flex-1 rounded-md px-3 py-2 font-geist text-xs font-semibold uppercase tracking-wide transition ${
                mode === "meet"
                  ? "bg-[#0072ff] text-white"
                  : "text-white/60 hover:text-white disabled:opacity-40"
              }`}
            >
              Meet
            </button>
          </div>
          <p className="mt-2 font-geist text-[11px] leading-snug text-white/40">
            {mode === "meet"
              ? "Everyone's at the table talking it out — memory-backed agents recall past decisions."
              : "Everyone's heads-down at their desk. Flip to Meet to gather the team."}
          </p>
        </div>

        <div className="flex items-center gap-1 border-b border-white/10 p-2 pr-4">
          {(["chat", "memory", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-3 py-2 font-geist text-xs font-semibold capitalize tracking-wide transition ${
                tab === t ? "bg-white/15 text-white" : "text-white/55 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 font-geist">
          {tab === "chat" && (
            <ChatFeed
              lines={feed}
              typedIds={typedRef.current}
              onTyped={(id) => typedRef.current.add(id)}
            />
          )}
          {tab === "memory" && <MemoryPanel agents={agents} />}
          {tab === "settings" && (
            <Settings
              config={config}
              onSaved={(id, name) => {
                sceneRef.current?.setAgentName(id, name);
                refreshConfig();
                refreshMemory();
              }}
              onManageMemory={() => setMemoryAdminOpen(true)}
              freeze={freeze}
            />
          )}
        </div>
      </aside>

      {/* "Press C" board prompt — only when Bikash is standing at the board */}
      {boardNear && !boardOpen && !loading && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-lg bg-[#0c1622]/90 px-4 py-2 font-geist text-sm text-white shadow-lg backdrop-blur">
          Press <kbd className="rounded bg-[#0072ff] px-1.5 py-0.5 text-xs font-bold">C</kbd> to open
          the task board
        </div>
      )}

      {boardOpen && <TaskBoard onClose={() => setBoardOpen(false)} onChange={refreshTasks} />}

      {memoryAdminOpen && (
        <MemoryAdmin
          onClose={() => {
            setMemoryAdminOpen(false);
            refreshMemory();
          }}
        />
      )}

      {loading && <Loader status={status} />}
    </main>
  );
}

function Settings({
  config,
  onSaved,
  onManageMemory,
  freeze,
}: {
  config: AgentConfig[];
  onSaved: (id: AgentId, name: string) => void;
  onManageMemory: () => void;
  freeze: (on: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="font-geist text-xs text-white/50">
        You&apos;re the admin. Change any agent&apos;s name, designation, or prompt — changes apply
        to the next meeting. Memory is keyed by a stable id, so edits never lose history.
      </p>

      {/* Admin memory manager — view / add / edit / delete what Cognee has stored. */}
      <button
        onClick={onManageMemory}
        className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 font-geist text-sm text-white transition hover:border-[#0072ff]/50 hover:bg-white/[0.06]"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden>🧠</span> Manage memory
        </span>
        <span className="text-[11px] text-white/40">view · add · edit · delete →</span>
      </button>

      {config.map((a) => (
        <AgentSettings key={a.id} agent={a} onSaved={onSaved} freeze={freeze} />
      ))}
    </div>
  );
}

function AgentSettings({
  agent,
  onSaved,
  freeze,
}: {
  agent: AgentConfig;
  onSaved: (id: AgentId, name: string) => void;
  freeze: (on: boolean) => void;
}) {
  const [name, setName] = useState(agent.name);
  const [role, setRole] = useState(agent.role);
  const [persona, setPersona] = useState(agent.persona);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(agent.name);
    setRole(agent.role);
    setPersona(agent.persona);
  }, [agent.name, agent.role, agent.persona]);

  const dirty = name !== agent.name || role !== agent.role || persona !== agent.persona;

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agent.id, name, role, persona }),
      });
      onSaved(agent.id, name);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-geist text-[10px] uppercase tracking-wider text-white/40">
          {agent.remembers ? "remembers" : "amnesiac"}
        </span>
      </div>
      <label className="mb-1 block font-geist text-[11px] text-white/50">Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onFocus={() => freeze(true)}
        onBlur={() => freeze(false)}
        maxLength={40}
        className="mb-3 w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 font-geist text-sm text-white focus:border-[#0072ff] focus:outline-none"
      />
      <label className="mb-1 block font-geist text-[11px] text-white/50">Designation</label>
      <input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        onFocus={() => freeze(true)}
        onBlur={() => freeze(false)}
        maxLength={40}
        placeholder="e.g. Product Lead"
        className="mb-3 w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 font-geist text-sm text-white placeholder:text-white/30 focus:border-[#0072ff] focus:outline-none"
      />
      <label className="mb-1 block font-geist text-[11px] text-white/50">Initial prompt</label>
      <textarea
        value={persona}
        onChange={(e) => setPersona(e.target.value)}
        onFocus={() => freeze(true)}
        onBlur={() => freeze(false)}
        rows={4}
        maxLength={800}
        className="w-full resize-y rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 font-geist text-[13px] leading-snug text-white focus:border-[#0072ff] focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {saved && <span className="font-geist text-[11px] text-[#0072ff]">Saved</span>}
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-md bg-[#0072ff] px-3 py-1.5 font-geist text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function Loader({ status }: { status: Status | null }) {
  const [step, setStep] = useState(0);
  const lines = [
    "Booting the office…",
    "Waking the team…",
    status?.memoryLive ? "Cognee Cloud memory: online" : "Cognee memory (mock): online",
    "Two agents remember. One doesn't.",
  ];
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, lines.length - 1)), 750);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black">
      <h1 className="text-6xl text-white sm:text-7xl" style={{ fontFamily: '"Bitcount Prop Single", monospace', textShadow: "0 0 40px rgba(0,114,255,0.35)" }}>
        Rooms
      </h1>
      <div className="mt-8 h-1 w-56 overflow-hidden rounded-full bg-white/10">
        <div className="h-full animate-[grow_3s_linear_forwards] bg-[#0072ff]" style={{ width: "100%", transformOrigin: "left" }} />
      </div>
      <p className="mt-6 h-5 font-geist text-sm text-white/70">{lines[step]}</p>
      <style>{`@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
    </div>
  );
}
