# Rooms — AI Agents in a Pixel Office with Persistent Memory

> Walk into a **Gather.town-style pixel office** as **Bikash**. Three AI coworkers live here — two remember everything across sessions using **Cognee Cloud**, one woke up with no memory at all. Convene a meeting, restart the app, and watch who still knows your name.

Built by **Kataaksh** (Bikash & Divyansh) for the **WeMakeDevs × Cognee** hackathon — *"The Hangover Part AI: Where's My Context?"* · Track: **Best Use of Cognee Cloud**.

---

## 🧠 What is this?

**Rooms** is an interactive pixel-art office simulator where AI agents hold live meetings, remember past decisions, and build a shared knowledge graph — all powered by **Cognee Cloud's** hybrid graph + vector memory layer.

The key insight: **memory is what separates a useful AI teammate from a goldfish**. This project makes that difference impossible to miss by putting a memory-backed agent and an amnesiac in the same room.

### The Core Demo

1. **You are Bikash** — walk around the office with WASD/arrow keys.
2. **Call a meeting** — type a topic, and the three AI agents gather at the table to discuss it with real LLM-generated dialogue.
3. **Restart the app** — Ctrl-C, `npm run dev`. Call another meeting.
4. **Watch the difference** — agents with Cognee memory reference last meeting's decisions by name. The amnesiac asks *"who are you? what project is this?"* every single time.

---

## 🏗️ Architecture

```
Browser (Next.js client)
├── app/page.tsx              Landing page (animated title, Enter button)
├── app/room/page.tsx         The office: Phaser canvas + sidebar (chat, memory, settings)
├── components/game/          Phaser 3 scene — Tiled map, walkable player, AI sprites, bubbles
│
Next.js API Routes (server-side, no keys in the browser)
├── /api/turn                 One agent turn: recall → generate → remember
├── /api/meeting              Full meeting (batch mode)
├── /api/memory               Agent memory snapshots + service status
├── /api/agents               Agent config (admin edits names, roles, prompts)
├── /api/tasks                Task board data
├── /api/reset                Wipe mock memory store
│
Core Libraries
├── lib/orchestrator.ts       Meeting turn loop (live + mock), memory recall/store
├── lib/openrouter.ts         LLM dialogue (Groq / OpenRouter / any OpenAI-compatible)
├── lib/cognee.ts             Cognee Cloud REST client (remember, recall, cognify)
├── lib/store.ts              Disk-backed mock memory (JSON file persistence)
├── lib/agents.ts             Agent personas (name, role, model, memory flag)
└── lib/tokens.ts             Per-agent token budget tracking
```

## 🤖 The Agents

| Agent | Role | Memory | What happens |
|-------|------|--------|-------------|
| **Divyansh** (Nova) | Design Engineer | ✅ Cognee | Recalls past decisions, references coworkers by name, builds on prior context |
| **Maaz** (Atlas) | AI Engineer | ✅ Cognee | Same — full recall, picks up where the team left off |
| **Harsh** (Biff) | Web Developer | ❌ None | No recall, no remember. Every meeting is day one. The control variable. |

The admin (you) can rename agents, change their roles, and edit their system prompts from the **Settings** tab — changes apply to the next meeting without losing memory history.

---

## 🔌 How Cognee is Used

Every agent turn follows a three-step loop:

| Step | What happens | Cognee endpoint |
|------|-------------|-----------------|
| **Recall** | Memory-backed agents query past decisions + coworker roster | `POST /api/v1/search` · `search_type: CHUNKS` |
| **Generate** | Persona + role + recalled memory + conversation → a 1–2 sentence spoken line | Groq / OpenRouter (Cognee doesn't generate chat) |
| **Remember** | The spoken line + extracted facts (people, projects, decisions) are ingested | `POST /api/v1/remember` |

After each meeting, `cognify` is called on all datasets so the knowledge graph is built and searchable for the next session.

**Memory is split into:**
- **Per-agent datasets** (`agent_nova`, `agent_atlas`) — private history
- **Shared `company_brain`** — cross-agent decisions, coworker roster, project nodes

The **Memory** panel renders each agent's knowledge graph as a live constellation; the amnesiac's flatlines to `NO SIGNAL`.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- A **Groq API key** (free tier at [console.groq.com](https://console.groq.com)) — or any OpenAI-compatible LLM endpoint
- *(Optional)* A **Cognee Cloud** tenant for live memory — works offline in mock mode without it

### Installation

```bash
git clone <your-repo-url>
cd cognee-proj
npm install
```

### Configuration

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

**Minimum setup** (dialogue only, mock memory):
```env
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEYS=your_groq_key_here
LLM_MODEL=llama-3.1-8b-instant
```

**Full setup** (live Cognee memory + dialogue):
```env
COGNEE_BASE_URL=https://your-tenant.aws.cognee.ai
COGNEE_API_KEY=your_cognee_key

LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEYS=your_groq_key_here
LLM_MODEL=llama-3.1-8b-instant
```

### Run

```bash
npm run dev        # http://localhost:3000
```

---

## 🎮 Usage

1. **Landing page** → click **Enter Room** → a 3-second loader boots the office.
2. **Walk around** with WASD / arrow keys — you are Bikash (the blue character).
3. **Type a topic** in the bottom bar and click **Call Meeting** — agents gather and discuss in real-time speech bubbles.
4. **Stop a meeting** — click the red **■ Stop** button in the topic bar or **Stop meeting** in the sidebar to end the session early.
5. **Open the sidebar** (☰ button) to switch between:
   - **Chat** — full meeting transcript with typewriter animation
   - **Memory** — live knowledge graphs per agent (constellations vs NO SIGNAL)
   - **Settings** — rename agents, edit roles/prompts, manage stored memory
6. **Walk to the task board** and press **C** to open it — drag-and-drop kanban for assigning work.

### Mock mode vs. Live mode

The app runs **with zero API keys** in full mock mode. A disk-backed store (`.data/memory.json`) provides persistence, and template dialogue fills in for the LLM. Badges show `MOCK`.

Fill in `COGNEE_*` and `LLM_*` env vars to go live — Cognee and the LLM are independent, so you can mix real memory with mock dialogue or vice versa.

### The Restart-Persistence Demo (the money shot)

1. Call a meeting on any topic → the agents reach a decision.
2. **Restart the app** (`Ctrl-C`, `npm run dev`). Memory lives in Cognee (or `.data/` in mock mode).
3. Call another meeting → Nova & Atlas reference the prior decision; Biff is lost.
4. Open the **Memory** panel to see the knowledge graph differences.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | **Next.js 14** (App Router) |
| Language | **TypeScript** |
| UI | **React 18** · **Tailwind CSS** |
| Game Engine | **Phaser 3** (Tiled tilemap + arcade physics) |
| Memory Layer | **Cognee Cloud** REST API (graph + vector memory) |
| LLM Dialogue | **Groq** (default) / OpenRouter / any OpenAI-compatible endpoint |
| Persistence | Cognee Cloud (live) or disk-backed JSON store (mock) |

---

## 📁 Project Structure

```
cognee-proj/
├── app/
│   ├── page.tsx                 # Landing page
│   ├── room/page.tsx            # Main office room (Phaser + sidebar)
│   ├── layout.tsx               # Root layout with fonts
│   ├── globals.css              # Global styles + animations
│   └── api/                     # Server-side API routes
│       ├── turn/route.ts        # Single meeting turn
│       ├── meeting/route.ts     # Full meeting (batch)
│       ├── memory/route.ts      # Memory snapshots
│       ├── agents/route.ts      # Agent config CRUD
│       ├── tasks/route.ts       # Task board data
│       ├── admin/route.ts       # Admin operations
│       └── reset/route.ts       # Memory wipe
├── components/
│   ├── ChatFeed.tsx             # Meeting transcript with typewriter
│   ├── MemoryPanel.tsx          # Knowledge graph constellations
│   ├── MemoryAdmin.tsx          # Memory CRUD manager
│   ├── TaskBoard.tsx            # Kanban task board
│   ├── better/                  # Reusable UI primitives
│   └── game/                    # Phaser scene, sprites, map
├── lib/
│   ├── orchestrator.ts          # Meeting turn loop
│   ├── openrouter.ts            # LLM client (Groq/OpenRouter)
│   ├── cognee.ts                # Cognee Cloud REST client
│   ├── store.ts                 # Disk-backed mock memory
│   ├── agents.ts                # Agent personas
│   ├── agentConfig.ts           # Admin overrides
│   ├── tokens.ts                # Token budget tracking
│   ├── tasks.ts                 # Task definitions
│   ├── types.ts                 # Shared TypeScript types
│   └── utils.ts                 # Utilities
├── public/                      # Static assets (tilesets, sprites)
├── .env.example                 # Environment template
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

---

## 🎨 Assets & Credits

The pixel office uses the **LimeZu "Modern Interiors / Modern Office"** tileset, characters, and item sprites — licensed **CC-BY 4.0**. The Tiled map and Phaser wiring are adapted from **[SkyOffice](https://github.com/kevinshen56714/SkyOffice)** (MIT).

- Tileset & characters: **LimeZu** — https://limezu.itch.io/
- Map + reference implementation: **SkyOffice** by kevinshen56714 (MIT)
- Fonts: Bitcount Single, Space Grotesk, IBM Plex Mono, Press Start 2P (Google Fonts)

---

## 📄 License

Built for the WeMakeDevs × Cognee hackathon. See individual asset licenses above.
