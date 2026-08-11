// 多人联机客户端（netMode==1，docs/multiplayer-design.md §4）。
// 握手 → 世界流式组装 → 玩家互见 + tile 操作上报/应用 + 时间对齐。
// v1 未同步（客户端本地）：NPC/弹幕/掉落/箱子/液体模拟结果。
import {
  PROTO_MAGIC, PROTO_VER, Msg, NetModule,
  NetWriter, NetReader, FrameParser, TileOp, TileOpAction, readTileBatch, decodeStrip,
} from './protocol';
import type { World } from '../world/World';
import { World as WorldCtor } from '../world/World';
import type { TileStore } from '../world/TileStore';
import { TILE } from '../core/constants';

/** 远端玩家状态（渲染用；Player 实例由 Game 持有池，这里只存同步数据） */
export interface RemotePlayerState {
  slot: number;
  name: string;
  appearance: string;
  x: number; y: number; vx: number; vy: number;
  facing: number; selectedItem: number; dead: boolean;
  active: boolean;
}

/** 房间策略（S→C RoomPolicy；客户端门禁依据——v3 房间制） */
export interface RoomPolicyState {
  roomCode: string;
  roomName: string;
  isHost: boolean;
  protectTiles: boolean;
  protectItems: boolean;
}

export interface ClientNetHooks {
  /** 世界组装完成（全部初始 strip 到齐 + PlayerSpawn）——Game 进 loadWorld */
  onWorldReady: (world: World) => void;
  /** 运行期晚到 strip 的落地区域（Game 负责整块标脏 chunk + 小地图） */
  onSectionArrived?: (rect: { x0: number; y0: number; w: number; h: number }) => void;
  /** 进度（label, p 0..1） */
  onProgress?: (label: string, p: number) => void;
  /** 聊天 */
  onChat?: (text: string, r: number, g: number, b: number) => void;
  /** 被踢 */
  onKick?: (reason: string) => void;
  /** 房间策略到达（进场时；门禁/提示用） */
  onPolicy?: (policy: RoomPolicyState) => void;
}

export class ClientNet {
  active = false;
  mySlot = -1;
  players = new Map<number, RemotePlayerState>();
  /** 房间策略（RoomPolicy 到达前 = 自由房默认） */
  policy: RoomPolicyState = { roomCode: '', roomName: '', isHost: false, protectTiles: false, protectItems: false };

  private ws: WebSocket | null = null;
  private parser = new FrameParser();
  private hooks: ClientNetHooks;
  private game: { player: { appearance?: unknown; inv: { slots: Array<{ id: number; stack: number } | null> } } };
  private hostToken = '';

  /** 组装中的世界（收到 msg7 建骨架，strip 到齐后交给 onWorldReady） */
  private pendingWorld: World | null = null;
  private pendingStrips = 0;
  private pendingStripsTotal = 0;
  private worldDelivered = false;
  /** 本地 tile 变更上报队列（TileStore.netReporter 收集） */
  private tileQueue: TileOp[] = [];
  private lastStateSent = 0;
  private lastSentPos = { x: 0, y: 0 };

  constructor(
    game: ClientNet['game'],
    hooks: ClientNetHooks,
  ) {
    this.game = game;
    this.hooks = hooks;
  }

  private pingTimer: ReturnType<typeof setInterval> | null = null;

  connect(url: string, hostToken = '') {
    this.active = true;
    this.hostToken = hostToken;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      // R12 修复：非法 URL 同步抛异常 → 转为 reject 语义（onKick）而非穿透调用栈
      this.active = false;
      this.hooks.onKick?.(`地址无效：${(e as Error).message}`);
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    // R9：独立 30s 心跳——暂停/后台（fixedUpdate 停跑）也不再被服务器 120s 看门狗踢
    this.pingTimer = setInterval(() => {
      this.send(new NetWriter(Msg.Ping).f64(performance.now()).finish());
    }, 30000);
    ws.onopen = () => {
      // Hello（对齐原版 msg1：版本校验）。连接时 Game.player 可能尚未创建（joinNetGame
      // 先连后 loadWorld）——外观名走可选链兜底
      const p = this.game.player as { appearance?: { name?: string } } | undefined | null;
      const name = p?.appearance?.name ?? '玩家';
      // 房主令牌：URL 已带 ?token=（路由层 newClient 注入）——消息内再传一份兜底
      // （非房主/旧路径传空串，服务器 try/catch 读不到即跳过）
      const hello = new NetWriter(Msg.Hello).str(PROTO_MAGIC).u16(PROTO_VER).str(name).str(this.hostToken);
      this.send(hello.finish());
    };
    ws.onmessage = (e) => {
      this.parser.append(new Uint8Array(e.data as ArrayBuffer));
      this.parser.drain((id, r) => this.handle(id, r));
    };
    ws.onclose = () => {
      if (this.active) {
        this.active = false;
        this.hooks.onKick?.('与服务器断开连接');
      }
    };
    ws.onerror = () => { /* close 跟上 */ };
  }

  private send(frame: Uint8Array) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame);
  }

  /** 请求玩家位置周围的 strip（R3 移动续传：跨条带边界时由 Game 调用） */
  requestSection(cx: number, cy: number) {
    this.send(new NetWriter(Msg.SpawnTileData).i32(Math.floor(cx)).i32(Math.floor(cy)).finish());
  }

  disconnect() {
    this.active = false;
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    this.ws?.close();
    this.ws = null;
  }

  // ================= 收包分发（对齐原版 MessageBuffer switch） =================

  private handle(msgId: number, r: NetReader) {
    switch (msgId) {
      case Msg.Kick: {
        this.hooks.onKick?.(r.str());
        this.disconnect();
        return;
      }
      case Msg.PlayerSlot: {
        this.mySlot = r.u8();
        // 全量上传自身（对齐原版 msg3 后立刻 SyncPlayer + RequestWorldData）
        const p2 = this.game.player as { appearance?: unknown } | undefined | null;
        const app = JSON.stringify(p2?.appearance ?? {});
        this.send(new NetWriter(Msg.SyncPlayer).u8(this.mySlot).str(app).finish());
        this.send(new NetWriter(Msg.RequestWorldData).finish());
        return;
      }
      case Msg.WorldData: {
        this.pendingWorld = this.readWorldData(r);
        return;
      }
      case Msg.StatusText: {
        this.pendingStrips = r.u16();
        this.pendingStripsTotal = Math.max(1, this.pendingStrips);
        this.hooks.onProgress?.('接收世界数据', 0);
        return;
      }
      case Msg.TileSection: {
        // R3 修复：初始组装期写入 pendingWorld；运行期（已进世界）晚到的 strip
        // 直写 gameWorld 并返回区域（调用方负责整块标脏——见 requestSection 回调）
        if (this.pendingWorld) {
          decodeStrip(this.pendingWorld.store, r);
          if (this.pendingStrips > 0) {
            this.pendingStrips--;
            // 进度按剩余比例推进（此前恒 0.5 不动）
            this.hooks.onProgress?.('接收世界数据', this.pendingStripsTotal > 0 ? 1 - this.pendingStrips / this.pendingStripsTotal : 0.5);
          }
        } else if (this.gameWorld) {
          const rect = decodeStrip(this.gameWorld.store, r);
          if (rect && this.hooks.onSectionArrived) this.hooks.onSectionArrived(rect);
        }
        return;
      }
      case Msg.PlayerSpawn: {
        const slot = r.u8();
        const sx = r.i32(), sy = r.i32();
        if (slot === this.mySlot && !this.worldDelivered && this.pendingWorld) {
          this.worldDelivered = true;
          this.pendingWorld.spawnX = sx;
          this.pendingWorld.spawnY = sy;
          this.hooks.onProgress?.('完成', 1);
          this.hooks.onWorldReady(this.pendingWorld);
          this.pendingWorld = null;
          // R2 修复：进世界后重发外观——连接时 player 可能尚未创建/外观未应用，
          // 此刻 Game.player 必然就绪（onWorldReady 已被 loadWorld 消费）
          const p3 = this.game.player as { appearance?: unknown } | undefined;
          if (p3?.appearance) {
            this.send(new NetWriter(Msg.SyncPlayer).u8(this.mySlot).str(JSON.stringify(p3.appearance)).finish());
          }
        }
        return;
      }
      case Msg.PlayerActive: {
        const slot = r.u8();
        const active = r.bool();
        const name = r.str();
        let p = this.players.get(slot);
        if (active) {
          if (!p) {
            p = { slot, name, appearance: '{}', x: 0, y: 0, vx: 0, vy: 0, facing: 1, selectedItem: 0, dead: false, active: true };
            this.players.set(slot, p);
          }
          p.active = true;
          p.name = name || p.name;
        } else if (p) {
          p.active = false;
        }
        return;
      }
      case Msg.SyncPlayer: {
        const slot = r.u8();
        const appearance = r.str();
        const p = this.players.get(slot);
        if (p) p.appearance = appearance;
        return;
      }
      case Msg.PlayerState: {
        const slot = r.u8();
        let p = this.players.get(slot);
        if (!p) {
          p = { slot, name: `玩家${slot}`, appearance: '{}', x: 0, y: 0, vx: 0, vy: 0, facing: 1, selectedItem: 0, dead: false, active: true };
          this.players.set(slot, p);
        }
        p.x = r.f32(); p.y = r.f32();
        p.vx = r.f32(); p.vy = r.f32();
        p.facing = r.i8();
        p.selectedItem = r.u8();
        p.dead = r.bool();
        return;
      }
      case Msg.TileBatch: {
        // 服务器中继的远端操作：应用 + 回环抑制
        const ops = readTileBatch(r);
        this.applyRemote(ops);
        return;
      }
      case Msg.SetTime: {
        // 时间对齐（服务器权威 clock）
        if (this.gameWorld) {
          const t = r.f64();
          const d = r.u32();
          if (Math.abs(this.gameWorld.clock.timeOfDay - t) > 0.005) {
            this.gameWorld.clock.timeOfDay = t;
          }
          this.gameWorld.clock.dayCount = d;
        }
        return;
      }
      case Msg.NetModules: {
        const moduleId = r.u16();
        if (moduleId === NetModule.Text) {
          const slot = r.u8();
          const text = r.str();
          const cr = r.u8(), cg = r.u8(), cb = r.u8();
          const name = this.players.get(slot)?.name ?? `玩家${slot}`;
          this.hooks.onChat?.(`<${name}> ${text}`, cr, cg, cb);
        }
        return;
      }
      case Msg.RoomPolicy: {
        this.policy = {
          roomCode: r.str(),
          roomName: r.str(),
          isHost: r.bool(),
          protectTiles: r.bool(),
          protectItems: r.bool(),
        };
        this.hooks.onPolicy?.(this.policy);
        return;
      }
      case Msg.Ping:
        return; // 忽略回显
      default:
        return; // 未知跳过（对齐原版）
    }
  }

  /** Game 侧设置运行期世界引用（时间对齐用） */
  gameWorld: World | null = null;

  private readWorldData(r: NetReader): World {
    const time = r.f64();
    const dayCount = r.u32();
    const w = r.u16(), h = r.u16();
    const spawnX = r.i32(), spawnY = r.i32();
    const groundLevel = r.f32(), rockLevel = r.f32(), lavaLine = r.f32();
    const seed = r.i32();
    const name = r.str();
    const crimson = r.bool();
    const dungeonX = r.i32(), dungeonY = r.i32(), jungleX = r.i32();
    const flagCount = r.u16();
    const flags: Record<string, boolean> = {};
    for (let i = 0; i < flagCount; i++) flags[r.str()] = r.bool();
    const world = new WorldCtor(w, h, seed, name);
    world.clock.timeOfDay = time;
    world.clock.dayCount = dayCount;
    world.spawnX = spawnX; world.spawnY = spawnY;
    world.groundLevel = groundLevel; world.rockLevel = rockLevel; world.lavaLine = lavaLine;
    world.crimson = crimson;
    world.dungeonX = dungeonX; world.dungeonY = dungeonY; world.jungleX = jungleX;
    Object.assign(world.flags, flags);
    // 请求出生点周围 section（对齐原版 msg8）
    this.send(new NetWriter(Msg.SpawnTileData).i32(spawnX).i32(spawnY).finish());
    return world;
  }

  // ================= tile 上报（TileStore.netReporter → 队列 → 每 tick 冲洗） =================

  /** TileStore.netReporter 注入点；netSuppress 期间（应用远端操作）不收集 */
  reportTileOp(op: TileOp) {
    if (!this.active) return;
    if (this.tileQueue.length >= 256) {
      // R4：超限不再静默丢（静默分叉不可恢复）——告警后仍丢但留下痕迹
      if (!this._overflowWarned) {
        this._overflowWarned = true;
        console.warn('[net] tile 上报队列溢出（单 tick >256 op），丢弃后续——本地与远端将分叉');
      }
      return;
    }
    this.tileQueue.push(op);
  }
  private _overflowWarned = false;

  /** Game 每 fixedUpdate 调用：冲洗 tile 队列 + 玩家状态上报（变化驱动 + 66ms 节流） */
  tick() {
    if (!this.active) return;
    if (this.tileQueue.length) {
      // 每包最多 64 op（防超帧）
      const batch = this.tileQueue.splice(0, 64);
      const w = new NetWriter(Msg.TileBatch);
      w.u16(batch.length);
      for (const o of batch) {
        w.u8(o.a);
        w.i32(o.x); w.i32(o.y);
        w.u16(o.v & 0xffff);
        if (o.a === TileOpAction.SetTile) { w.u16(o.fx); w.u16(o.fy); }
      }
      this.send(w.finish());
    }
    this.sendPlayerState();
  }

  private sendPlayerState() {
    const p = this.game.player as unknown as { cx: number; cy: number; vx: number; vy: number; facing: number; inv: { heldItem(): { id: number } | null }; dead: boolean };
    const now = performance.now();
    const moved = Math.abs(p.cx - this.lastSentPos.x) > 1 || Math.abs(p.cy - this.lastSentPos.y) > 1;
    if (!moved && now - this.lastStateSent < 1000) return; // 静止 1s 心跳
    if (now - this.lastStateSent < 66) return;             // 节流 ≥66ms（≈15Hz）
    this.lastStateSent = now;
    this.lastSentPos = { x: p.cx, y: p.cy };
    const held = p.inv.heldItem();
    this.send(new NetWriter(Msg.PlayerState)
      .f32(p.cx).f32(p.cy)
      .f32(p.vx).f32(p.vy)
      .i8(p.facing)
      .u8(held ? held.id : 0)
      .bool(p.dead).finish());
  }

  // ================= 远端 tile 应用（回环抑制 + 事件链触发） =================

  private applyRemote(ops: TileOp[]) {
    const st = this.gameWorld?.store;
    if (!st) return;
    st.netSuppress = true;
    try {
      for (const o of ops) {
        if (o.x < 0 || o.y < 0 || o.x >= st.w || o.y >= st.h) continue;
        switch (o.a) {
          case TileOpAction.SetTile: st.setTile(o.x, o.y, o.v, o.fx, o.fy); break;
          case TileOpAction.SetWall: st.setWall(o.x, o.y, o.v); break;
          case TileOpAction.SetHalfBrick: st.setHalfBrick(o.x, o.y, !!o.v); break;
          case TileOpAction.SetSlope: st.setSlope(o.x, o.y, o.v); break;
          case TileOpAction.SetActuated: st.setActuated(o.x, o.y, !!o.v); break;
          case TileOpAction.SetWire: st.setWire(o.x, o.y, o.v); break;
        }
      }
    } finally {
      st.netSuppress = false; // R5：异常安全复位（否则 suppress 永久卡死上报）
    }
  }

  /** 聊天发送 */
  sendChat(text: string) {
    this.send(new NetWriter(Msg.NetModules).u16(NetModule.Text).str(text).finish());
  }
}
