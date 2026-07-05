"use client";

import { useEffect, useRef, useState } from "react";
import type { TurnLine } from "@/lib/types";

// Per-agent identity: chat name colour + which pixel spritesheet to crop a
// portrait from (same mapping the game scene uses).
const ACCENTS: Record<string, string> = {
  nova: "#37E2D5",
  atlas: "#FF3D8B",
  biff: "#9a96b8",
};
const SPRITE: Record<string, string> = { nova: "ash", atlas: "lucy", biff: "nancy" };

interface Props {
  lines: TurnLine[];
  /** Ids of lines already typed out (lives in the parent, survives tab switches). */
  typedIds: Set<string>;
  onTyped: (id: string) => void;
}

export default function ChatFeed({ lines, typedIds, onTyped }: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length]);

  if (lines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-center font-geist text-xs text-white/40">
          No messages yet. Flip the team to <span className="text-[#0072ff]">Meet</span> to start
          the conversation.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="neon-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {lines.map((l, i) => (
          <Message
            key={l.id}
            line={l}
            // Only the newest line animates, and only if it hasn't been typed yet.
            animate={i === lines.length - 1 && !typedIds.has(l.id)}
            onGrow={() => endRef.current?.scrollIntoView({ block: "end" })}
            onDone={() => onTyped(l.id)}
          />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

/** Pixel-art portrait cropped from the character's spritesheet (front frame). */
function Avatar({ agentId, color }: { agentId: string; color: string }) {
  const key = SPRITE[agentId] ?? "adam";
  return (
    <div
      className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border"
      style={{ borderColor: color, background: "#11121b" }}
    >
      <div
        style={{
          width: 32,
          height: 48,
          transform: "scale(1.5)",
          transformOrigin: "top left",
          backgroundImage: `url(/assets/character/${key}.png)`,
          backgroundPosition: "0px -1px",
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

function Message({
  line,
  animate,
  onGrow,
  onDone,
}: {
  line: TurnLine;
  animate: boolean;
  onGrow: () => void;
  onDone: () => void;
}) {
  const color = ACCENTS[line.agentId] ?? "#8580B0";
  const shown = useTypewriter(line.text, animate, onGrow, onDone);

  return (
    <div className="flex items-start gap-3 font-geist">
      <Avatar agentId={line.agentId} color={color} />
      <div className="min-w-0 flex-1">
        <span className="text-[13px] font-semibold" style={{ color }}>
          {line.agentName}
        </span>
        <div className="mt-1 inline-block rounded-2xl rounded-tl-sm bg-white/[0.06] px-3 py-2 text-[13px] leading-relaxed text-white/90">
          {shown}
          {animate && shown.length < line.text.length && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-[#0072ff] align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}

/** Reveals `text` character-by-character when `enabled`; calls `onDone` once the
 * animation completes so the parent can mark it typed (and never replay it). */
function useTypewriter(
  text: string,
  enabled: boolean,
  onGrow: () => void,
  onDone: () => void
): string {
  const [n, setN] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) {
      setN(text.length);
      return;
    }
    setN(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      onGrow();
      if (i >= text.length) {
        clearInterval(id);
        onDone();
      }
    }, 22);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, enabled]);
  return text.slice(0, n);
}
