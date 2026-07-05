import Phaser from "phaser";
import { createCharacterAnims } from "./characterAnims";
import { AGENTS } from "@/lib/agents";
import type { AgentId } from "@/lib/types";

// Map each agent persona to a LimeZu character spritesheet.
const SPRITE: Record<string, string> = { nova: "ash", atlas: "lucy", biff: "nancy" };
const ACCENT: Record<string, number> = {
  cyan: 0x37e2d5,
  magenta: 0xff3d8b,
  gold: 0xffc24b,
  amnesia: 0x9a96b8,
};

type Dir = "up" | "down" | "left" | "right";
interface Spot {
  x: number;
  y: number;
  dir: Dir;
}

// Office (O) — each agent's assigned desk. The chair sits just below the
// monitor, so a working agent idles here facing UP toward their computer.
const DESKS: Record<AgentId, Spot> = {
  nova: { x: 1008, y: 544, dir: "up" },
  atlas: { x: 1104, y: 544, dir: "up" },
  biff: { x: 1200, y: 544, dir: "up" },
};

// Meeting room (M) — chairs around the big conference table. Agents take their
// chair and face the table.
const MEETING_SEATS: Record<AgentId, Spot> = {
  nova: { x: 336, y: 608, dir: "down" },
  atlas: { x: 464, y: 608, dir: "down" },
  biff: { x: 400, y: 704, dir: "up" },
};

// Control Room (C) — top room; only Bikash (the human) belongs here. The label
// just marks it; agents are never routed inside.
const CONTROL_ROOM = { x1: 672, y1: 96, x2: 1088, y2: 256 };

// The task board — a wall monitor in the Office (O). Bikash walks up to it and
// presses C to open the assignment board. `x,y` is the spot he stands to read it.
const BOARD = { x: 960, y: 336, radius: 96 };

type Mode = "work" | "meet";

interface Actor {
  id: AgentId;
  name: string;
  remembers: boolean;
  sprite: Phaser.Physics.Arcade.Sprite;
  spriteKey: string;
  label: Phaser.GameObjects.Text;
  /** Small "doing X" tag shown at the desk while working. */
  taskLabel: Phaser.GameObjects.Text;
  task: string;
  seatDir: Dir;
  /** Remaining waypoints to the current destination (last one is the exact seat). */
  path: { x: number; y: number }[] | null;
  stuckMs: number;
  lastDist: number;
  bubble?: Bubble;
}

interface Bubble {
  container: Phaser.GameObjects.Container;
  ttl: number;
}

const PLAYER_SPEED = 200;
const AGENT_SPEED = 84;
const TILE = 32;

export default class OfficeScene extends Phaser.Scene {
  private onReady: (scene: OfficeScene) => void;
  private map!: Phaser.Tilemaps.Tilemap;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private keyC!: Phaser.Input.Keyboard.Key;
  private boardNear = false;
  private onBoardPrompt?: (near: boolean) => void;
  private onBoardOpen?: () => void;
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerLabel!: Phaser.GameObjects.Text;
  private playerDir = "down";
  private playerBubble?: Bubble;
  private actors: Actor[] = [];
  private colliders: Phaser.Physics.Arcade.StaticGroup[] = [];
  private mode: Mode = "work";
  private playerName = "You";
  private controlRoomLabel!: Phaser.GameObjects.Text;
  private workspaceLabels = new Map<AgentId, Phaser.GameObjects.Text>();
  // Walkability grid (true = wall / off-map) for BFS routing between rooms.
  private blocked: boolean[][] = [];
  private cols = 0;
  private rows = 0;

  constructor(onReady: (scene: OfficeScene) => void) {
    super("office");
    this.onReady = onReady;
  }

  preload() {
    const A = "/assets";
    this.load.tilemapTiledJSON("tilemap", `${A}/map/map.json`);
    this.load.spritesheet("tiles_wall", `${A}/map/FloorAndGround.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet("chairs", `${A}/items/chair.png`, { frameWidth: 32, frameHeight: 64 });
    this.load.spritesheet("computers", `${A}/items/computer.png`, { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet("whiteboards", `${A}/items/whiteboard.png`, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet("vendingmachines", `${A}/items/vendingmachine.png`, { frameWidth: 48, frameHeight: 72 });
    this.load.spritesheet("office", `${A}/tileset/Modern_Office_Black_Shadow.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet("basement", `${A}/tileset/Basement.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet("generic", `${A}/tileset/Generic.png`, { frameWidth: 32, frameHeight: 32 });
    for (const key of ["adam", "ash", "lucy", "nancy"]) {
      this.load.spritesheet(key, `${A}/character/${key}.png`, { frameWidth: 32, frameHeight: 48 });
    }
  }

  create() {
    createCharacterAnims(this.anims, ["adam", "ash", "lucy", "nancy"]);

    this.map = this.make.tilemap({ key: "tilemap" });
    const floor = this.map.addTilesetImage("FloorAndGround", "tiles_wall")!;
    const ground = this.map.createLayer("Ground", floor)!;
    ground.setCollisionByProperty({ collides: true });

    // Furniture from the Tiled object layers (gid - firstgid → sprite frame).
    this.addLayer("Wall", "tiles_wall", "FloorAndGround", true);
    this.addLayer("Objects", "office", "Modern_Office_Black_Shadow", false);
    this.addLayer("ObjectsOnCollide", "office", "Modern_Office_Black_Shadow", true);
    this.addLayer("GenericObjects", "generic", "Generic", false);
    this.addLayer("GenericObjectsOnCollide", "generic", "Generic", true);
    this.addLayer("Basement", "basement", "Basement", true);
    this.addLayer("Chair", "chairs", "chair", false);
    this.addLayer("Computer", "computers", "computer", false);
    this.addLayer("Whiteboard", "whiteboards", "whiteboard", false);
    this.addLayer("VendingMachine", "vendingmachines", "vendingmachine", true);

    this.buildWalkGrid(ground);
    this.drawControlRoom();
    this.drawWorkspaceLabels();

    // Player (human 4th agent) — always the "adam" sprite. Small foot collider so
    // doorways are easy to pass through.
    this.player = this.physics.add.sprite(705, 500, "adam", 0);
    this.player.body!.setSize(12, 10).setOffset(10, 36);
    this.player.setDepth(this.player.y);
    this.player.anims.play("adam_idle_down");
    this.playerLabel = this.makeLabel(this.playerName, 0xffffff);
    this.physics.add.collider(this.player, ground);
    for (const g of this.colliders) this.physics.add.collider(this.player, g);

    // AI agents from personas — each spawns at their own office desk, working.
    AGENTS.forEach((a) => {
      const key = SPRITE[a.id];
      const desk = DESKS[a.id];
      const sprite = this.physics.add.sprite(desk.x, desk.y, key, 0);
      sprite.body!.setSize(12, 10).setOffset(10, 36);
      sprite.setDepth(sprite.y);
      sprite.anims.play(`${key}_idle_${desk.dir}`);
      this.physics.add.collider(sprite, ground);
      for (const g of this.colliders) this.physics.add.collider(sprite, g);
      const label = this.makeLabel(a.name, ACCENT[a.accent]);
      const taskLabel = this.add
        .text(0, 0, "", {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#cfe8ff",
          stroke: "#0b1220",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(100000)
        .setVisible(false);
      this.actors.push({
        id: a.id,
        name: a.name,
        remembers: a.remembers,
        sprite,
        spriteKey: key,
        label,
        taskLabel,
        task: "",
        seatDir: desk.dir,
        path: null,
        stuckMs: 0,
        lastDist: Infinity,
      });
      this.physics.add.collider(sprite, this.player);
    });
    for (let i = 0; i < this.actors.length; i++)
      for (let j = i + 1; j < this.actors.length; j++)
        this.physics.add.collider(this.actors[i].sprite, this.actors[j].sprite);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    this.keyC = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    // Don't globally preventDefault WASD/C/arrows — otherwise those characters
    // never reach the HUD's text inputs (rename / prompt / topic fields). Key
    // state still tracks fine for movement; capture only controls preventDefault.
    this.input.keyboard!.clearCaptures();

    // Clicking the game world should return keyboard control to the player. A
    // canvas click does NOT blur a focused HUD text field on its own (Phaser
    // preventDefaults the pointer event), which otherwise leaves you stuck unable
    // to move after tapping the topic box. So blur any focused field explicitly.
    this.input.on("pointerdown", () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) el.blur();
    });

    // Camera
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.player.setCollideWorldBounds(true);
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.setZoom(1.5);

    this.onReady(this);
  }

  // ── Tiled helpers ──────────────────────────────────────────────────────────

  private addLayer(layerName: string, key: string, tilesetName: string, collidable: boolean) {
    const layer = this.map.getObjectLayer(layerName);
    if (!layer) return;
    const group = this.physics.add.staticGroup();
    const firstgid = this.map.getTileset(tilesetName)?.firstgid ?? 0;
    for (const obj of layer.objects) {
      const x = (obj.x ?? 0) + (obj.width ?? 0) * 0.5;
      const y = (obj.y ?? 0) - (obj.height ?? 0) * 0.5;
      const sprite = group.get(x, y, key, (obj.gid ?? 0) - firstgid) as Phaser.GameObjects.Sprite;
      sprite.setDepth(y);
    }
    if (collidable) this.colliders.push(group);
  }

  /** Rasterize the Ground layer into a walkable/blocked grid for BFS routing. */
  private buildWalkGrid(ground: Phaser.Tilemaps.TilemapLayer) {
    this.cols = this.map.width;
    this.rows = this.map.height;
    this.blocked = Array.from({ length: this.rows }, () => Array(this.cols).fill(true));
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = ground.getTileAt(c, r);
        this.blocked[r][c] = !t || t.collides;
      }
    }
  }

  private drawControlRoom() {
    const { x1, y1, x2, y2 } = CONTROL_ROOM;
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x0072ff, 0.08);
    g.fillRect(x1, y1, x2 - x1, y2 - y1);
    g.lineStyle(2, 0x0072ff, 0.5);
    g.strokeRect(x1, y1, x2 - x1, y2 - y1);
    this.controlRoomLabel = this.add
      .text((x1 + x2) / 2, y1 + 14, "CONTROL ROOM · Bikash only", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#0072ff",
        stroke: "#ffffff",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(2);
  }

  private drawWorkspaceLabels() {
    (Object.keys(DESKS) as AgentId[]).forEach((id) => {
      const a = AGENTS.find((x) => x.id === id)!;
      const d = DESKS[id];
      const label = this.add
        .text(d.x, d.y + 22, `[ ${a.name}'s desk ]`, {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#" + ACCENT[a.accent].toString(16).padStart(6, "0"),
          stroke: "#11202f",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(1);
      this.workspaceLabels.set(id, label);
    });

    // Static room signage so the layout reads at a glance.
    const sign = (x: number, y: number, text: string) =>
      this.add
        .text(x, y, text, {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#f4f4ff",
          stroke: "#11202f",
          strokeThickness: 4,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(1)
        .setAlpha(0.75);
    sign(1150, 300, "OFFICE");
    sign(400, 560, "MEETING ROOM");
    this.add
      .text(BOARD.x, 300, "▤ TASK BOARD", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#4a9bff",
        stroke: "#0b1220",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(3);
  }

  private makeLabel(text: string, color: number) {
    const hex = "#" + color.toString(16).padStart(6, "0");
    return this.add
      .text(0, 0, text, {
        fontFamily: "monospace",
        fontSize: "11px",
        color: hex,
        stroke: "#0b1220",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(100000);
  }

  // ── BFS routing ──────────────────────────────────────────────────────────────

  /** Shortest walkable path (tile-center waypoints) from a pixel to a pixel. */
  private findPath(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] {
    const sc = Math.floor(sx / TILE);
    const sr = Math.floor(sy / TILE);
    const tc = Math.floor(tx / TILE);
    const tr = Math.floor(ty / TILE);
    const key = (c: number, r: number) => r * this.cols + c;
    const inB = (c: number, r: number) => c >= 0 && r >= 0 && c < this.cols && r < this.rows;
    // Start and target tiles are always allowed (a seat may sit on a busy tile).
    const passable = (c: number, r: number) =>
      inB(c, r) && (!this.blocked[r][c] || (c === sc && r === sr) || (c === tc && r === tr));

    const prev = new Map<number, number>();
    const seen = new Set<number>([key(sc, sr)]);
    const queue: [number, number][] = [[sc, sr]];
    let found = false;
    while (queue.length) {
      const [c, r] = queue.shift()!;
      if (c === tc && r === tr) {
        found = true;
        break;
      }
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nc = c + dc;
        const nr = r + dr;
        if (passable(nc, nr) && !seen.has(key(nc, nr))) {
          seen.add(key(nc, nr));
          prev.set(key(nc, nr), key(c, r));
          queue.push([nc, nr]);
        }
      }
    }

    if (!found) return [{ x: tx, y: ty }]; // no route — stuck-teleport will finish it

    const path: { x: number; y: number }[] = [];
    let cur = key(tc, tr);
    const start = key(sc, sr);
    while (cur !== start) {
      const c = cur % this.cols;
      const r = Math.floor(cur / this.cols);
      path.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
      const p = prev.get(cur);
      if (p == null) break;
      cur = p;
    }
    path.reverse();
    // Land on the exact seat pixel, not just its tile center.
    if (path.length) path[path.length - 1] = { x: tx, y: ty };
    else path.push({ x: tx, y: ty });
    return path;
  }

  private setGoal(a: Actor, spot: Spot) {
    a.seatDir = spot.dir;
    a.path = this.findPath(a.sprite.x, a.sprite.y, spot.x, spot.y);
    a.stuckMs = 0;
    a.lastDist = Infinity;
  }

  // ── public API (called from React HUD) ───────────────────────────────────────

  showBubble(id: AgentId | "player", text: string) {
    if (id === "player") {
      this.playerBubble = this.spawnBubble(this.player.x, this.player.y, text, this.playerBubble);
      return;
    }
    const actor = this.actors.find((a) => a.id === id);
    if (!actor) return;
    // Only one speech bubble on screen at a time so the seated agents around the
    // table stay visible instead of being buried under overlapping bubbles.
    for (const other of this.actors) {
      if (other.id !== id && other.bubble) {
        other.bubble.container.destroy();
        other.bubble = undefined;
      }
    }
    actor.bubble = this.spawnBubble(actor.sprite.x, actor.sprite.y, text, actor.bubble);
  }

  /** Set an agent's current task; shown as a small tag at their desk in WORK mode. */
  setAgentTask(id: AgentId, task: string) {
    const actor = this.actors.find((a) => a.id === id);
    if (!actor) return;
    actor.task = task;
    actor.taskLabel.setText(task ? `⌨ ${task.length > 20 ? task.slice(0, 19) + "…" : task}` : "");
  }

  /** Wire up the task-board proximity prompt + open trigger (from React). */
  setBoardHandlers(onPrompt: (near: boolean) => void, onOpen: () => void) {
    this.onBoardPrompt = onPrompt;
    this.onBoardOpen = onOpen;
  }

  clearAllBubbles() {
    for (const a of this.actors) {
      a.bubble?.container.destroy();
      a.bubble = undefined;
    }
    this.playerBubble?.container.destroy();
    this.playerBubble = undefined;
  }

  setActiveSpeaker(id: AgentId | null) {
    for (const a of this.actors) {
      a.sprite.setTint(0xffffff);
      if (id && a.id === id) a.sprite.clearTint();
    }
  }

  /** MEET: everyone walks to the meeting room and takes their chair. */
  enterMeet() {
    this.mode = "meet";
    for (const a of this.actors) this.setGoal(a, MEETING_SEATS[a.id]);
  }

  /** WORK: everyone returns to their desk and works in silence. */
  enterWork() {
    this.mode = "work";
    this.clearAllBubbles();
    this.setActiveSpeaker(null);
    for (const a of this.actors) this.setGoal(a, DESKS[a.id]);
  }

  getMode(): Mode {
    return this.mode;
  }

  setPlayerName(name: string) {
    this.playerName = name || "You";
    if (this.playerLabel) this.playerLabel.setText(this.playerName);
  }

  /** Apply an admin rename to an agent's head label + desk label. */
  setAgentName(id: AgentId, name: string) {
    const clean = name.trim();
    if (!clean) return;
    const actor = this.actors.find((a) => a.id === id);
    if (actor) {
      actor.name = clean;
      actor.label.setText(clean);
    }
    this.workspaceLabels.get(id)?.setText(`[ ${clean}'s desk ]`);
  }

  /** Release keyboard to the DOM while a HUD text field is focused. */
  setInputEnabled(on: boolean) {
    if (this.input.keyboard) this.input.keyboard.enabled = on;
  }

  // ── bubbles ──────────────────────────────────────────────────────────────────

  private spawnBubble(x: number, y: number, text: string, prev?: Bubble): Bubble {
    prev?.container.destroy();
    const maxW = 150;
    const label = this.add.text(0, 0, text, {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#12203a",
      wordWrap: { width: maxW },
      align: "left",
    });
    const pad = 6;
    const w = Math.min(maxW, label.width) + pad * 2;
    const h = label.height + pad * 2;
    label.setPosition(-w / 2 + pad, -h - 8 + pad);

    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.96);
    g.fillRoundedRect(-w / 2, -h - 8, w, h, 6);
    g.fillTriangle(-5, -8, 5, -8, 0, 0);

    const container = this.add.container(x, y - 32, [g, label]).setDepth(200000);
    return { container, ttl: 0 };
  }

  // ── loop ──────────────────────────────────────────────────────────────────────

  update(_t: number, dt: number) {
    this.updatePlayer();
    for (const a of this.actors) this.updateActor(a, dt);

    // Task board: prompt when Bikash is close, open on C.
    const dBoard = Phaser.Math.Distance.Between(this.player.x, this.player.y, BOARD.x, BOARD.y);
    const near = dBoard < BOARD.radius;
    if (near !== this.boardNear) {
      this.boardNear = near;
      this.onBoardPrompt?.(near);
    }
    if (near && this.keyC && Phaser.Input.Keyboard.JustDown(this.keyC)) this.onBoardOpen?.();

    this.playerLabel.setPosition(this.player.x, this.player.y - 30).setDepth(this.player.y + 1);
    if (this.playerBubble) this.playerBubble.container.setPosition(this.player.x, this.player.y - 32);
    for (const a of this.actors) {
      a.label.setPosition(a.sprite.x, a.sprite.y - 30).setDepth(a.sprite.y + 1);
      a.sprite.setDepth(a.sprite.y);
      if (a.bubble) a.bubble.container.setPosition(a.sprite.x, a.sprite.y - 32);
      // "Doing X" tag: only while seated at the desk and working (never in transit
      // or during a meeting), so the assigned task reads without the label roaming.
      const working = this.mode === "work" && a.task !== "" && (!a.path || a.path.length === 0);
      a.taskLabel.setVisible(working);
      if (working) a.taskLabel.setPosition(a.sprite.x, a.sprite.y - 42).setDepth(a.sprite.y + 1);
    }
  }

  private updatePlayer() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    // Never drive the player while a HUD text field is focused — a safety net so
    // typing in the topic / rename / prompt boxes can't move the avatar, and
    // movement always resumes the instant focus leaves the field.
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) {
      body.setVelocity(0, 0);
      this.player.anims.play(`adam_idle_${this.playerDir}`, true);
      return;
    }

    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;

    let vx = 0;
    let vy = 0;
    if (left) vx = -PLAYER_SPEED;
    else if (right) vx = PLAYER_SPEED;
    if (up) vy = -PLAYER_SPEED;
    else if (down) vy = PLAYER_SPEED;
    if (vx && vy) {
      vx *= Math.SQRT1_2;
      vy *= Math.SQRT1_2;
    }
    body.setVelocity(vx, vy);

    if (vx < 0) this.playerDir = "left";
    else if (vx > 0) this.playerDir = "right";
    else if (vy < 0) this.playerDir = "up";
    else if (vy > 0) this.playerDir = "down";

    const moving = vx !== 0 || vy !== 0;
    this.player.anims.play(`adam_${moving ? "run" : "idle"}_${this.playerDir}`, true);
  }

  private updateActor(a: Actor, dt: number) {
    const body = a.sprite.body as Phaser.Physics.Arcade.Body;

    // En route to a desk or a meeting chair: follow BFS waypoints.
    if (a.path && a.path.length) {
      const wp = a.path[0];
      const d = Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, wp.x, wp.y);
      if (d < 8) {
        a.path.shift();
        if (a.path.length === 0) {
          body.setVelocity(0, 0);
          a.sprite.setPosition(wp.x, wp.y);
        }
        return;
      }
      this.moveToward(a, wp);
      // Wall/furniture snag safety-net: if progress stalls, hop to the waypoint.
      if (a.lastDist - d < 0.4) a.stuckMs += dt;
      else a.stuckMs = 0;
      a.lastDist = d;
      if (a.stuckMs > 1100) {
        a.sprite.setPosition(wp.x, wp.y);
        body.setVelocity(0, 0);
        a.stuckMs = 0;
        a.lastDist = Infinity;
      }
      return;
    }

    // Arrived — sit still and face the desk/table.
    body.setVelocity(0, 0);
    a.sprite.anims.play(`${a.spriteKey}_idle_${a.seatDir}`, true);
  }

  private moveToward(a: Actor, target: { x: number; y: number }) {
    const body = a.sprite.body as Phaser.Physics.Arcade.Body;
    const angle = Phaser.Math.Angle.Between(a.sprite.x, a.sprite.y, target.x, target.y);
    body.setVelocity(Math.cos(angle) * AGENT_SPEED, Math.sin(angle) * AGENT_SPEED);
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    let dir: Dir;
    if (Math.abs(vx) > Math.abs(vy)) dir = vx < 0 ? "left" : "right";
    else dir = vy < 0 ? "up" : "down";
    a.sprite.anims.play(`${a.spriteKey}_run_${dir}`, true);
  }
}
