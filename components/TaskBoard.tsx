"use client";

import { useEffect, useState } from "react";

type Status = "todo" | "doing" | "done";
interface Task {
  id: string;
  title: string;
  status: Status;
}
interface BoardAgent {
  id: string;
  name: string;
  accent: string;
  tasks: Task[];
}

const ACCENTS: Record<string, string> = {
  cyan: "#37E2D5",
  magenta: "#FF3D8B",
  gold: "#FFC24B",
  amnesia: "#9a96b8",
};

const STATUS: Record<Status, { label: string; color: string; next: Status }> = {
  todo: { label: "To do", color: "#8580B0", next: "doing" },
  doing: { label: "Doing", color: "#0072ff", next: "done" },
  done: { label: "Done", color: "#37E2D5", next: "todo" },
};

export default function TaskBoard({
  onClose,
  onChange,
}: {
  onClose: () => void;
  onChange?: () => void;
}) {
  const [agents, setAgents] = useState<BoardAgent[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/tasks", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Persist one agent's task list and refresh the in-world desk tags.
  const save = (agentId: string, tasks: Task[]) => {
    setAgents((prev) => prev?.map((a) => (a.id === agentId ? { ...a, tasks } : a)) ?? prev);
    fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, tasks }),
    })
      .then(() => onChange?.())
      .catch(() => {});
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-[min(820px,96vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-2xl text-white" style={{ fontFamily: '"Bitcount Prop Single", monospace' }}>
              Task Board
            </h2>
            <p className="mt-0.5 font-geist text-[11px] text-white/40">
              Assign work to each agent — click a status to cycle it, + to add, × to remove.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-lg text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 font-geist sm:grid-cols-3">
          {error && <p className="text-sm text-red-400">Couldn&apos;t load the board.</p>}
          {!agents && !error && <p className="text-sm text-white/40">Loading…</p>}
          {agents?.map((a) => (
            <AgentColumn key={a.id} agent={a} onSave={(tasks) => save(a.id, tasks)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentColumn({ agent, onSave }: { agent: BoardAgent; onSave: (tasks: Task[]) => void }) {
  const [draft, setDraft] = useState("");
  const accent = ACCENTS[agent.accent] ?? "#8580B0";

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    onSave([...agent.tasks, { id: `t-${Date.now()}`, title, status: "todo" }]);
    setDraft("");
  };
  const cycle = (id: string) =>
    onSave(agent.tasks.map((t) => (t.id === id ? { ...t, status: STATUS[t.status].next } : t)));
  const remove = (id: string) => onSave(agent.tasks.filter((t) => t.id !== id));

  return (
    <div className="flex flex-col rounded-xl border border-white/10 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: accent }} />
        <span className="text-sm font-semibold text-white">{agent.name}</span>
      </div>

      <ul className="flex flex-col gap-2">
        {agent.tasks.length === 0 && (
          <li className="rounded-lg border border-dashed border-white/10 px-2.5 py-3 text-center text-[11px] text-white/30">
            No tasks yet
          </li>
        )}
        {agent.tasks.map((t) => {
          const st = STATUS[t.status];
          return (
            <li key={t.id} className="flex items-start gap-2 rounded-lg bg-white/[0.04] p-2.5">
              <button
                onClick={() => cycle(t.id)}
                title="Click to change status"
                className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition hover:brightness-125"
                style={{ color: st.color, background: `${st.color}1f` }}
              >
                {st.label}
              </button>
              <span className="min-w-0 flex-1 text-[13px] leading-snug text-white/85">{t.title}</span>
              <button
                onClick={() => remove(t.id)}
                aria-label="Delete task"
                className="shrink-0 text-white/30 transition hover:text-red-400"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          maxLength={120}
          placeholder="Add a task…"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[12px] text-white placeholder:text-white/30 focus:border-[#0072ff] focus:outline-none"
        />
        <button
          onClick={add}
          disabled={!draft.trim()}
          className="shrink-0 rounded-md bg-[#0072ff] px-2.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
