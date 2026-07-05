import fs from "fs";
import path from "path";
import type { AgentId } from "./types";

// Admin-assigned tasks per agent, persisted to disk so they survive restarts.
// Nothing is hardcoded — the board starts empty and the admin adds/assigns tasks
// from the frontend (press C in the office).

export type TaskStatus = "todo" | "doing" | "done";
export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "tasks.json");

type Store = Partial<Record<AgentId, Task[]>>;

function read(): Store {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Store;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.warn("[tasks] could not persist:", (err as Error).message);
  }
}

export function getTasks(id: AgentId): Task[] {
  return read()[id] ?? [];
}

/** Replace an agent's whole task list (validated + capped). */
export function setTasks(id: AgentId, tasks: Task[]): Task[] {
  const clean = (Array.isArray(tasks) ? tasks : []).slice(0, 20).map((t, i) => ({
    id: String(t.id || `t-${Date.now()}-${i}`),
    title: String(t.title ?? "").slice(0, 120),
    status: (["todo", "doing", "done"].includes(t.status) ? t.status : "todo") as TaskStatus,
  }));
  const store = read();
  store[id] = clean;
  write(store);
  return clean;
}

/** The task an agent is actively working on (for the in-world desk tag). */
export function currentTask(id: AgentId): string {
  const list = getTasks(id);
  const doing = list.find((t) => t.status === "doing") ?? list[0];
  return doing ? doing.title : "";
}
