"use client";

import { useCallback, useEffect, useState } from "react";

interface Entry {
  index: number;
  text: string;
  topic: string;
  ts: number;
}
interface Bank {
  id: string;
  name: string;
  accent: string;
  remembers: boolean;
  dataset: string;
  entries: Entry[];
  nodeCount: number;
}
interface Data {
  live: boolean;
  agents: Bank[];
  shared: { dataset: string; entries: Entry[]; nodeCount: number };
}

const ACCENTS: Record<string, string> = {
  cyan: "#37E2D5",
  magenta: "#FF3D8B",
  gold: "#FFC24B",
  amnesia: "#9a96b8",
};

export default function MemoryAdmin({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const d = await fetch("/api/admin/memory", { cache: "no-store" }).then((r) => r.json());
    setData(d);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const act = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      try {
        await fetch("/api/admin/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const banks = [
    ...(data?.agents ?? []),
    ...(data
      ? [{ id: "shared", name: "Company brain (shared)", accent: "gold", remembers: true, ...data.shared }]
      : []),
  ] as Bank[];

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[min(760px,96vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-2xl text-white" style={{ fontFamily: '"Bitcount Prop Single", monospace' }}>
              Memory Manager
            </h2>
            <p className="mt-0.5 font-geist text-[11px] text-white/40">
              {data
                ? `${data.live ? "Live Cognee + " : ""}local mirror — what each character has stored.`
                : "Loading…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => confirm("Delete ALL memories for every character?") && act({ action: "clearAll" })}
              disabled={busy}
              className="rounded-md border border-red-500/40 px-3 py-1.5 font-geist text-[11px] font-semibold uppercase tracking-wide text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
            >
              Delete all
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-md text-lg text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 font-geist">
          {!data && <p className="text-sm text-white/40">Loading…</p>}
          {banks.map((b) => (
            <Section key={b.dataset} bank={b} busy={busy} act={act} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({
  bank,
  busy,
  act,
}: {
  bank: Bank;
  busy: boolean;
  act: (p: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState("");
  const accent = ACCENTS[bank.accent] ?? "#8580B0";

  return (
    <div className="rounded-xl border border-white/10 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: accent }} />
          <span className="text-sm font-semibold text-white">{bank.name}</span>
          <span className="text-[10px] uppercase tracking-wider text-white/30">
            {bank.entries.length} memories · {bank.nodeCount} nodes
          </span>
        </div>
        {bank.entries.length > 0 && (
          <button
            onClick={() =>
              confirm(`Clear all of ${bank.name}'s memory?`) &&
              act({ action: "clearAgent", dataset: bank.dataset })
            }
            disabled={busy}
            className="text-[11px] font-semibold uppercase tracking-wide text-white/40 transition hover:text-red-400 disabled:opacity-40"
          >
            Clear
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {bank.entries.length === 0 && (
          <li className="rounded-lg border border-dashed border-white/10 px-2.5 py-3 text-center text-[11px] text-white/30">
            No memories
          </li>
        )}
        {bank.entries.map((e) => (
          <EntryRow
            key={`${bank.dataset}-${e.index}`}
            entry={e}
            busy={busy}
            onSave={(text) => act({ action: "edit", dataset: bank.dataset, index: e.index, text })}
            onDelete={() => act({ action: "delete", dataset: bank.dataset, index: e.index })}
          />
        ))}
      </ul>

      <div className="mt-3 flex gap-1.5">
        <input
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && draft.trim()) {
              act({ action: "add", dataset: bank.dataset, text: draft.trim() });
              setDraft("");
            }
          }}
          maxLength={240}
          placeholder="Add a memory for this character…"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[12px] text-white placeholder:text-white/30 focus:border-[#0072ff] focus:outline-none"
        />
        <button
          onClick={() => {
            if (!draft.trim()) return;
            act({ action: "add", dataset: bank.dataset, text: draft.trim() });
            setDraft("");
          }}
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-md bg-[#0072ff] px-2.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  busy,
  onSave,
  onDelete,
}: {
  entry: Entry;
  busy: boolean;
  onSave: (text: string) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(entry.text);
  const dirty = text.trim() !== entry.text;

  return (
    <li className="flex items-start gap-2 rounded-lg bg-white/[0.04] p-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && dirty && onSave(text.trim())}
        className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-[13px] text-white/85 focus:bg-black/30 focus:outline-none"
      />
      {dirty && (
        <button
          onClick={() => onSave(text.trim())}
          disabled={busy}
          className="shrink-0 rounded bg-[#0072ff] px-2 py-0.5 text-[10px] font-semibold uppercase text-white transition hover:brightness-110 disabled:opacity-40"
        >
          Save
        </button>
      )}
      <button
        onClick={onDelete}
        disabled={busy}
        aria-label="Delete memory"
        className="shrink-0 text-white/30 transition hover:text-red-400 disabled:opacity-40"
      >
        ×
      </button>
    </li>
  );
}
