// 多人联机客户端（netMode==1，docs/multiplayer-design.md §4）。
// 握手 → 世界流式组装 → 玩家互见 + tile 操作上报/应用 + 时间对齐。
// v6 已同步：NPC(msg23 短码)/弹幕(msg27 kind0-8+hostile)/掉落(msg21)/箱子(msg31/32)。
// 客户端本地：液体模拟（原版 v1 既定边界）、傀儡插值（快照驱动）。
import {
  PROTO_MAGIC, PROTO_VER, Msg, NetModule,
  NetWriter, NetReader, FrameParser, TileOp, TileOpAction, readTileBatch, decodeStrip,
  ItemContainer, ItemSyncEntry, INV_SYNC_SIZES, writePlayerItems, readPlayerItems,
} from './protocol';
import type { World } from '../world/World';
import { World as WorldCtor } from '../world/World';
import { Lang } from '../i18n/Lang';

/** 远端玩家状态（对齐原版 msg13 同步集：控制位+位置+速度；Player 实例由 Game 持有池） */
export interface RemotePlayerState {
  slot: number;
  name: string;
  appearance: string;
  /** 权威位置（碰撞盒左上，原版 player.position 语义）与速度 */
  x: number; y: number; vx: number; vy: number;
  /** 控制位（原版 msg13 ctrlBits：Game 侧据此跑本地物理模拟） */
  up: boolean; down: boolean; left: boolean; right: boolean; jump: boolean; useItem: boolean;
  facing: number; selectedItem: number; dead: boolean;
  /** 新权威包到达标记（Game 消费注入 netOffset 后清零） */
  fresh: boolean;
  active: boolean;
  /** 最近一次 msg13 到达时刻（P1.1 AOI 配套：超时未达 → Game 冻结代理输入防幽灵行走） */
  lastFresh: number;
  /** PvP（v7）：hostile 旗 + 队伍 0-5（msg13 flagBits[7] + 尾部 u8 team） */
  hostile: boolean;
  team: number;
  /** 权威 HP（msg16 镜像——Game 接线到 proxy.hp 供头顶血条/死亡表现） */
  hp: number;
  maxHp: number;
}

/** 房间策略（S→C RoomPolicy；客户端门禁依据——v3 房间制；v4 尾部 maxPlayers） */
export interface RoomPolicyState {
  roomCode: string;
  roomName: string;
  isHost: boolean;
  protectTiles: boolean;
  protectItems: boolean;
  /** 单房人数上限（v4；UI 显示 online/max） */
  maxPlayers: number;
  /** PvP 房（v7）：true 才透传玩家来源弹幕 hostile 位（room.ts 剥离墙的开关） */
  pvpAllowed: boolean;
}

/** NPC 快照（msg23；房主权威） */
export interface NpcSnap {
  netId: number; key: string;
  x: number; y: number; vx: number; vy: number;
  hp: number; maxHp: number; animT: number;
  flags: number; // bit0=boss
}

/** 弹幕快照（msg27；tag = projId(arrow/weapon) / dart kind / magic color） */
export interface ProjSnap {
  netId: number; kind: number; tag: string;
  dmg: number; aux: number;
  x: number; y: number; vx: number; vy: number;
}

/** 掉落物操作（msg21） */
export interface ItemOpMsg {
  op: 0 | 1 | 2; netId: number;
  key: string; stack: number;
  x: number; y: number; vx: number; vy: number;
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
  /** 箱子内容到达/被纠正（服务器权威；Game 负责登记 world.chests 与开面板） */
  onChestSync?: (chestIdx: number, x: number, y: number, items: Array<{ id: number; stack: number } | null>) => void;
  /** NPC 快照到达（msg23；Game 维护傀儡池） */
  onNpcSnapshot?: (snaps: NpcSnap[]) => void;
  /** 掉落物操作到达（msg21；Game 维护傀儡/移除本地真掉落） */
  onItemOp?: (op: ItemOpMsg) => void;
  /** 弹幕快照到达（msg27；Game 维护傀儡池） */
  onProjectileSync?: (snaps: ProjSnap[]) => void;
  /** 弹幕消亡到达（v6 msg28；Game 即时移除傀儡） */
  onProjDespawn?: (netIds: number[]) => void;
  /** SSC 角色档到达（v6 msg201，--ssc 启用；Game 应用覆盖本地角色） */
  onSSC?: (recordJson: string) => void;
  /** 打击到达（msg42；房主权威结算） */
  onStrike?: (netId: number, rawDmg: number, kbx: number, kby: number) => void;
  /** PvP 近战命中意向到达（v7 msg44；被打方本地结算——Game 过 InOpposingTeam 门禁后走
   *  damagePlayer(pvp)）。fromSlot=攻击者槽位（服务器回填） */
  onStrikePlayer?: (fromSlot: number, targetSlot: number, dmg: number, kbx: number, kby: number, weaponId: number, crit: boolean) => void;
  /** 远端玩家 HP（msg16 中继） */
  onHp?: (slot: number, hp: number, maxHp: number) => void;
  /** 房间策略到达（进场时；门禁/提示用） */
  onPolicy?: (policy: RoomPolicyState) => void;
}

export class ClientNet {
  active = false;
  mySlot = -1;
  players = new Map<number, RemotePlayerState>();
  /** 房间策略（RoomPolicy 到达前 = 自由房默认） */
  policy: RoomPolicyState = { roomCode: '', roomName: '', isHost: false, protectTiles: false, protectItems: false, maxPlayers: 255, pvpAllowed: false };

  private ws: WebSocket | null = null;
  private parser = new FrameParser();
  private hooks: ClientNetHooks;
  private game: { player: { appearance?: unknown; hostile: boolean; team: number; inv: { slots: Array<{ id: number; stack: number } | null> } } };
  private hostToken = '';

  /** 组装中的世界（收到 msg7 建骨架，strip 到齐后交给 onWorldReady） */
  private pendingWorld: World | null = null;
  private pendingStrips = 0;
  private pendingStripsTotal = 0;
  private worldDelivered = false;
  /** 本地 tile 变更上报队列（TileStore.netReporter 收集） */
  private tileQueue: TileOp[] = [];
  /** msg23 短码表（v4：codeId → {netId, key}；服务器端分配，全量条目重建） */
  private npcCodes = new Map<number, { netId: number; key: string }>();
  /** v6 msg201 暂存（世界就绪后由 Game 消费，见 SscSync case 注释——竞态防护） */
  pendingSSC: string | null = null;
  /** msg21 上行合帧暂存（P1.3：netDropSweep 每 4 tick 逐条发 → 攒到 tick 冲洗拼一条 WS 消息） */
  private pendingFrames: Uint8Array[] = [];
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
    this.url = url;
    this.hostToken = hostToken;
    this.connect0(url);
  }

  /** 底层建连（首连/重连共用） */
  private connect0(url: string) {
    this.active = true;
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
    if (!this.pingTimer) {
      this.pingTimer = setInterval(() => {
        this.send(new NetWriter(Msg.Ping).f64(performance.now()).finish());
      }, 30000);
    }
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
      if (!this.active || this.userClosed) return;
      // v3 断线重连（§8.8）：有 session 凭据 → 2s 间隔自动重试 3 次（同 slot 复位）；
      // 耗尽或无凭据 → 按原语义 onKick
      if (this.session && this.reconnects < 3) {
        this.reconnects++;
        this.active = false;
        setTimeout(() => {
          if (this.userClosed) return;
          const sep = this.url.includes('?') ? '&' : '?';
          this.connect0(`${this.url}${sep}session=${encodeURIComponent(this.session)}`);
        }, 2000);
        return;
      }
      this.active = false;
      this.hooks.onKick?.('与服务器断开连接');
    };
    ws.onerror = () => { /* close 跟上 */ };
  }

  private url = '';
  private session = '';
  private reconnects = 0;
  private userClosed = false;

  private send(frame: Uint8Array) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame);
  }

  /** 请求玩家位置周围的 strip（R3 移动续传：跨条带边界时由 Game 调用） */
  requestSection(cx: number, cy: number) {
    this.send(new NetWriter(Msg.SpawnTileData).i32(Math.floor(cx)).i32(Math.floor(cy)).finish());
  }

  disconnect() {
    this.userClosed = true;
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
        this.invDumpPending = true; // 物品全量 dump 时机：slot 分配后首 tick
        // v3：session 凭据（重连用）；重连场景复位 join 状态以重走世界组装
        const sess = (() => { try { return r.str(); } catch { return ''; } })();
        if (sess) {
          if (this.worldDelivered) {
            // 断线重连：世界将重新组装下发（pendingWorld 复位）
            this.worldDelivered = false;
            this.pendingWorld = null;
            this.pendingStrips = 0;
          }
          this.session = sess;
          this.reconnects = 0;
        }
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
        // 仅初始组装期上报进度：进世界后 R3 移动续传也会触发 StatusText（fresh=0），
        // 无条件回调会把已关闭的全屏进度遮罩重新拉起 → "永久卡在接收世界数据"
        if (!this.worldDelivered) this.hooks.onProgress?.('接收世界数据', 0);
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
            p = {
              slot, name, appearance: '{}', x: 0, y: 0, vx: 0, vy: 0,
              up: false, down: false, left: false, right: false, jump: false, useItem: false,
              facing: 1, selectedItem: 0, dead: false, fresh: false, active: true, lastFresh: 0,
              hostile: false, team: 0, hp: 100, maxHp: 100,
            };
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
      case Msg.SyncPlayerItem: {
        // 远端物品/装备（msg5）：Game 侧拷入 proxy.inv 驱动手持/盔甲/挥舞渲染
        const entries = readPlayerItems(r);
        this.applyRemoteItems(entries.filter((e) => e.playerSlot !== this.mySlot));
        return;
      }
      case Msg.PlayerState: {
        // v2 布局（对齐原版 msg13）：slot + ctrlBits + flagBits + selectedItem + pos [+vel]
        const slot = r.u8();
        const ctrl = r.u8();
        const flag = r.u8();
        const sel = r.u8();
        const x = r.f32(), y = r.f32();
        let vx = 0, vy = 0;
        if (flag & 4) { vx = r.f32(); vy = r.f32(); } // flagBits[2] = hasVelocity
        // v7 尾部：u8 team（hostile 在 flagBits[7]）
        const team = r.remaining > 0 ? Math.max(0, Math.min(5, r.u8())) : 0;
        const hostile = !!(flag & 128);
        let p = this.players.get(slot);
        if (!p) {
          p = {
            slot, name: `玩家${slot}`, appearance: '{}',
            x, y, vx: 0, vy: 0,
            up: false, down: false, left: false, right: false, jump: false, useItem: false,
            facing: ctrl & 64 ? 1 : -1, selectedItem: sel, dead: !!(flag & 64),
            fresh: true, active: true, lastFresh: performance.now(),
            hostile, team, hp: 100, maxHp: 100,
          };
          this.players.set(slot, p);
        }
        p.lastFresh = performance.now();
        p.x = x; p.y = y; p.vx = vx; p.vy = vy;
        p.up = !!(ctrl & 1); p.down = !!(ctrl & 2);
        p.left = !!(ctrl & 4); p.right = !!(ctrl & 8);
        p.jump = !!(ctrl & 16); p.useItem = !!(ctrl & 32);
        p.facing = ctrl & 64 ? 1 : -1;   // ctrlBits[6] = direction（原版）
        p.selectedItem = sel;
        p.dead = !!(flag & 64);           // flagBits[6] = ghost
        p.hostile = hostile; p.team = team;
        p.fresh = true;                   // Game 侧注入 netOffset 后清零
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
          // slot=255 = 服务器系统公告（房主交接等）——直显无名字前缀
          if (slot === 255) this.hooks.onChat?.(text, cr, cg, cb);
          else {
            const name = this.players.get(slot)?.name ?? `玩家${slot}`;
            this.hooks.onChat?.(`<${name}> ${text}`, cr, cg, cb);
          }
        } else if (moduleId === NetModule.JoinLeave) {
          // 加入/离开公告（原版服务器 Lang.mp[19]/[20] 广播，色 (255,240,20)）
          const slot = r.u8();
          const joined = r.bool();
          const name = this.players.get(slot)?.name ?? `玩家${slot}`;
          this.hooks.onChat?.(
            Lang.text(joined ? 'LegacyMultiplayer.19' : 'LegacyMultiplayer.20', name),
            255, 240, 20,
          );
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
          maxPlayers: (() => { try { return r.u16(); } catch { return 255; } })(),
          pvpAllowed: (() => { try { return !!r.u8(); } catch { return false; } })(),
        };
        this.hooks.onPolicy?.(this.policy);
        return;
      }
      case Msg.SyncChestItem: {
        this.applyRemoteChest(r);
        return;
      }
      case Msg.SyncNPC: {
        // v4 短码格式：每条 1B eflags——bit0=含 key 全量(u32 netId+u16 codeId+str key)，
        // bit1=boss；否则仅 u16 codeId（查本端 codeId→netId/key 表）。
        // 未知短码：**先把本条剩余字段读完再丢弃**——continue 前不消费会让读指针错位，
        // 毒化整条连接（review C1）；自愈靠 ≤2s 全量兜底重发
        const n = r.u16();
        const snaps: NpcSnap[] = [];
        for (let i = 0; i < n; i++) {
          const eflags = r.u8();
          let netId = 0, key = '';
          if (eflags & 1) {
            netId = r.u32();
            const code = r.u16();
            key = r.str();
            this.npcCodes.set(code, { netId, key });
          } else {
            const code = r.u16();
            const e = this.npcCodes.get(code);
            netId = e?.netId ?? 0;
            key = e?.key ?? '';
          }
          const x = r.f32(), y = r.f32(), vx = r.f32(), vy = r.f32();
          const hp = r.i16(), maxHp = r.i16(), animT = r.u16();
          if (!netId) continue; // 未知短码：字段已消费，仅丢弃本条快照
          snaps.push({ netId, key, x, y, vx, vy, hp, maxHp, animT, flags: eflags & 2 ? 1 : 0 });
        }
        this.hooks.onNpcSnapshot?.(snaps);
        return;
      }
      case Msg.SyncItem: {
        const netId = r.u32();
        const op = r.u8() as 0 | 1 | 2;
        let key = '', stack = 0, x = 0, y = 0, vx = 0, vy = 0;
        if (op === 0) {
          key = r.str(); stack = r.u16();
          x = r.f32(); y = r.f32(); vx = r.f32(); vy = r.f32();
        }
        this.hooks.onItemOp?.({ op, netId, key, stack, x, y, vx, vy });
        return;
      }
      case Msg.SyncProjectile: {
        const n = r.u16();
        const snaps: ProjSnap[] = [];
        for (let i = 0; i < n; i++) {
          snaps.push({
            netId: r.u32(), kind: r.u8(), tag: r.str(),
            dmg: r.i16(), aux: r.i16(),
            x: r.f32(), y: r.f32(), vx: r.f32(), vy: r.f32(),
          });
        }
        this.hooks.onProjectileSync?.(snaps);
        return;
      }
      case Msg.StrikeNPC: {
        const netId = r.u32();
        const dmg = r.i16();
        const kbx = r.f32(), kby = r.f32();
        this.hooks.onStrike?.(netId, dmg, kbx, kby);
        return;
      }
      case Msg.StrikePlayer: {
        // v7 PvP 近战命中意向（被击端接收）：尾部 u8 fromSlot = 服务器回填的攻击者槽位
        const targetSlot = r.u8();
        const dmg = r.i16();
        const kbx = r.i16(), kby = r.i16();
        const weaponId = r.u16();
        const flags = r.u8();
        const fromSlot = r.remaining > 0 ? r.u8() : 0;
        this.hooks.onStrikePlayer?.(fromSlot, targetSlot, dmg, kbx, kby, weaponId, !!(flags & 1));
        return;
      }
      case Msg.ProjDespawn: {
        // v6 msg28：消亡批量——未知 netId 为无主傀儡，直接忽略
        const n = Math.min(r.u16(), 64);
        const ids: number[] = [];
        for (let i = 0; i < n; i++) ids.push(r.u32());
        if (ids.length) this.hooks.onProjDespawn?.(ids);
        return;
      }
      case Msg.PlayerLifeMana: {
        const slot = r.u8();
        const hp = r.i16(), maxHp = r.i16();
        // 缓存进状态表（proxy.hp 接线在 Game.simulateRemotePlayers 每帧读取）
        const rp = this.players.get(slot);
        if (rp) { rp.hp = hp; rp.maxHp = maxHp; }
        if (slot !== this.mySlot) this.hooks.onHp?.(slot, hp, maxHp);
        return;
      }
      case Msg.SscSync: {
        // v6 msg201：服务器角色档（--ssc）。**暂存不即用**——本帧与 PlayerSpawn 同批
        // 到达，onWorldReady→loadWorld 内部 await 让出栈后若立刻应用会写到即将被
        // 重建替换的旧 Player 上整体丢失（终审 H1）。由 Game 在 loadWorld 完成后消费
        this.pendingSSC = r.str();
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
    this.syncInventory(performance.now());
    this.syncHp();
    this.flushPending(); // P1.3 msg21 合帧冲洗
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

  private sendPlayerState(force = false) {
    // v2 布局（对齐原版 msg13）：控制位 + position(碰撞盒左上) + velocity。
    // 远端据此跑本地物理 → 有移动过程；位置差由接收端 netOffset 平滑（瞬移消失）
    const p = this.game.player as unknown as {
      x: number; y: number; vx: number; vy: number; facing: number; dead: boolean;
      inputX: number; inputJump: boolean; inputDown: boolean; inputUp: boolean;
      inv: { heldItem(): { id: number } | null };
    };
    const inp = (this.game as { input?: { mouseDown: boolean; rightDown: boolean } }).input;
    // ctrlBits: [0]up [1]down [2]left [3]right [4]jump [5]useItem [6]direction（原版 case 13）
    // useItem = 左键按住（原版 controlUseItem；放置/右键交互不计）
    const ctrl = (p.inputUp ? 1 : 0) | (p.inputDown ? 2 : 0)
      | (p.inputX < 0 ? 4 : 0) | (p.inputX > 0 ? 8 : 0)
      | (p.inputJump ? 16 : 0)
      | (inp?.mouseDown && !inp.rightDown ? 32 : 0)
      | (p.facing > 0 ? 64 : 0);
    // selectedItem = 快捷栏槽位索引 0-9（原版 NetMessage.cs:471 语义；v1 误发物品 id）
    const sel = (p.inv as unknown as { selected: number }).selected & 0xff;
    // 控制位变化即时发（原版 TrySyncingInput Player.cs:6484：任一 control/selectedItem
    // 变化立刻 SendData(13)）——原地起跳这类"位置未动"的操作不再等静止心跳
    const ctrlChanged = ctrl !== this.lastSentCtrl || sel !== this.lastSentSel || p.dead !== this.lastSentDead;
    const now = performance.now();
    const moved = Math.abs(p.x - this.lastSentPos.x) > 1 || Math.abs(p.y - this.lastSentPos.y) > 1;
    const pvpChanged = this.lastSentHostile !== this.game.player.hostile || this.lastSentTeam !== this.game.player.team;
    if (!force && !pvpChanged && !ctrlChanged) {
      if (!moved && now - this.lastStateSent < 1000) return; // 静止 1s 心跳（原版 %420 全量兜底的简化版）
      if (now - this.lastStateSent < 66) return;             // 位置驱动节流 ≥66ms（≈15Hz）
    }
    this.lastStateSent = now;
    this.lastSentPos = { x: p.x, y: p.y };
    this.lastSentCtrl = ctrl;
    this.lastSentSel = sel;
    this.lastSentDead = p.dead;
    this.lastSentHostile = this.game.player.hostile;
    this.lastSentTeam = this.game.player.team;
    // flagBits: [2]hasVelocity [6]ghost [7]hostile(v7)；v7 尾部追加 u8 team(0-5)
    const gp = this.game.player as unknown as { hostile: boolean; team: number };
    const flag = 4 | (p.dead ? 64 : 0) | (gp.hostile ? 128 : 0);
    this.send(new NetWriter(Msg.PlayerState)
      .u8(this.mySlot)
      .u8(ctrl).u8(flag)
      .u8(sel)
      .f32(p.x).f32(p.y)
      .f32(p.vx).f32(p.vy)
      .u8(Math.max(0, Math.min(5, gp.team)))
      .finish());
  }

  /** PvP 姿态变化即时上报（msg13 心跳之外快速通道：hostile/team 翻转立刻同步） */
  sendPvpState() { this.sendPlayerState(true); }

  private lastSentCtrl = -1;
  private lastSentSel = -1;
  private lastSentDead = false;
  private lastSentHostile = false;
  private lastSentTeam = 0;

  // ================= 箱子同步（msg31/32，服务器权威） =================

  /** 请求打开箱子（interactAt 未命中本地 chests 时——访客本地无箱数据） */
  requestChestOpen(x: number, y: number) {
    this.send(new NetWriter(Msg.RequestChestOpen).i32(x).i32(y).finish());
  }

  /** 槽位编辑上报（每槽一条消息；服务器权威+广播，编辑者本地已乐观生效） */
  sendChestSlot(chestIdx: number, x: number, y: number, slot: number, itemId: number, stack: number) {
    const w = new NetWriter(Msg.SyncChestItem);
    w.u16(chestIdx); w.i32(x); w.i32(y);
    w.u16(1);
    w.u8(slot); w.u16(itemId); w.u16(stack);
    this.send(w.finish());
  }

  /** 本地登记的箱子 → 同步槽位号（Game 注册；diff 轮询用） */
  chestIndexByPos = new Map<string, number>();

  private applyRemoteChest(r: NetReader) {
    const chestIdx = r.u16();
    const x = r.i32(), y = r.i32();
    const n = r.u16();
    const items: Array<{ id: number; stack: number } | null> = [];
    for (let i = 0; i < n; i++) {
      const slot = r.u8(), itemId = r.u16(), stack = r.u16();
      items[slot] = itemId ? { id: itemId, stack } : null;
    }
    this.hooks.onChestSync?.(chestIdx, x, y, items);
  }

  /** 外观变更后重发 SyncPlayer（进游戏后 applyCharacter 调用——初始两发都在外观应用前） */
  resendAppearance() {
    if (!this.active || this.mySlot < 0) return;
    const p = this.game.player as { appearance?: unknown } | undefined;
    if (p?.appearance) {
      this.send(new NetWriter(Msg.SyncPlayer).u8(this.mySlot).str(JSON.stringify(p.appearance)).finish());
    }
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

  // ================= v3 实体同步（msg16/21/23/27/42，房主权威+服务器中继） =================

  /** NPC 快照（msg23） */
  sendNpcSnapshot(snaps: NpcSnap[]) {
    if (!snaps.length) return;
    const w = new NetWriter(Msg.SyncNPC);
    w.u16(snaps.length);
    for (const s of snaps) {
      w.u32(s.netId); w.str(s.key);
      w.f32(s.x); w.f32(s.y); w.f32(s.vx); w.f32(s.vy);
      w.i16(s.hp); w.i16(s.maxHp);
      w.u16(s.animT & 0xffff);
      w.u8(s.flags);
    }
    this.send(w.finish());
  }

  /** 掉落物操作（msg21）：op 0=spawn / 1=take / 2=despawn。
   *  P1.3 上行合帧：入 pending 攒批（netDropSweep 每 4 tick 可能逐条几十发），
   *  tick() 冲洗时拼为单条 WS 消息；满 64 帧立即冲防延迟 */
  sendItemOp(op: 0 | 1 | 2, netId: number, key = '', stack = 0, x = 0, y = 0, vx = 0, vy = 0) {
    const w = new NetWriter(Msg.SyncItem);
    w.u32(netId); w.u8(op);
    if (op === 0) {
      w.str(key); w.u16(stack);
      w.f32(x); w.f32(y); w.f32(vx); w.f32(vy);
    }
    this.pendingFrames.push(w.finish());
    if (this.pendingFrames.length >= 64) this.flushPending();
  }

  /** 冲洗 pending 合帧：多帧拼接为一条 WS 消息（§1.1 允许一 WS 消息串联多帧） */
  private flushPending() {
    if (!this.pendingFrames.length || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingFrames.length = 0;
      return;
    }
    let total = 0;
    for (const f of this.pendingFrames) total += f.length;
    const joined = new Uint8Array(total);
    let off = 0;
    for (const f of this.pendingFrames) { joined.set(f, off); off += f.length; }
    this.pendingFrames.length = 0;
    this.ws.send(joined);
  }

  /** 弹幕快照（msg27，双向：各自弹幕互播） */
  sendProjectileBatch(snaps: ProjSnap[]) {
    if (!snaps.length) return;
    const w = new NetWriter(Msg.SyncProjectile);
    w.u16(snaps.length);
    for (const s of snaps) {
      w.u32(s.netId); w.u8(s.kind); w.str(s.tag);
      w.i16(s.dmg); w.i16(s.aux);
      w.f32(s.x); w.f32(s.y); w.f32(s.vx); w.f32(s.vy);
    }
    this.send(w.finish());
  }

  /** 弹幕消亡上报（v6 msg28，双向）：自己拥有的弹幕消亡时批量上报，
   *  接收端即时移除傀儡（替代纯 180t 超时清扫——消幽灵弹窗口 + 消亡闪烁）。
   *  终审 L2：服务器 n>64 整包拒——分片成 ≤64 的多帧，防大清场丢尾 */
  sendProjDespawn(netIds: number[]) {
    for (let i = 0; i < netIds.length; i += 64) {
      const chunk = netIds.slice(i, i + 64);
      const w = new NetWriter(Msg.ProjDespawn);
      w.u16(chunk.length);
      for (const id of chunk) w.u32(id);
      this.send(w.finish());
    }
  }

  /** 傀儡受击上报（msg42，访客→房主；Enemy.hurt 内经 entityNet 注入调用） */
  sendStrike(netId: number, rawDmg: number, kbx: number, kby: number) {
    this.send(new NetWriter(Msg.StrikeNPC).u32(netId).i16(rawDmg).f32(kbx).f32(kby).finish());
  }

  /** PvP 近战命中意向上报（v7 msg44，C→S→定向转发被击者；权威=被打方本地结算）。
   *  weaponId 为凶器内部物品 id（死因文案 DeathSource.Player {2} 用）；flags bit0=crit */
  sendStrikePlayer(targetSlot: number, rawDmg: number, kbx: number, kby: number, weaponId: number, crit: boolean) {
    this.send(new NetWriter(Msg.StrikePlayer).u8(targetSlot).i16(rawDmg)
      .i16(kbx).i16(kby).u16(weaponId).u8(crit ? 1 : 0).finish());
  }

  /** HP 上报（msg16，变化驱动 + 200ms 节流；原版客户端权威） */
  private lastHpSent = -1;
  private lastHpAt = 0;
  syncHp() {
    if (this.mySlot < 0) return;
    const p = this.game.player as unknown as { hp: number; maxHp: number };
    const now = performance.now();
    if (p.hp === this.lastHpSent) {
      if (now - this.lastHpAt < 5000) return; // 满血心跳 5s
    } else if (now - this.lastHpAt < 200) return;
    this.lastHpSent = p.hp;
    this.lastHpAt = now;
    this.send(new NetWriter(Msg.PlayerLifeMana).u8(this.mySlot).i16(p.hp).i16(p.maxHp).finish());
  }

  // ================= 物品/装备同步（msg5，对齐原版 SyncPlayerItem 语义） =================

  /** 远端玩家物品快照（Game 侧拷入 proxy.inv——手持/盔甲纸娃娃/挥舞动画渲染用） */
  remoteItems = new Map<number, { inv: Array<{ id: number; stack: number } | null>; armor: Array<{ id: number; stack: number } | null>; dye: Array<{ id: number; stack: number } | null> }>();

  /** 本地已同步快照（差分基准；null = 尚未全量 dump） */
  private sentInv: Array<Array<{ id: number; stack: number } | null>> | null = null;
  private invDumpPending = true; // 进房首包全量
  private lastInvSync = 0;

  /** 全量 dump（进房后立即 + 外部可请求） */
  private sendFullInventory() {
    const p = this.game.player as unknown as { inv: { slots: Array<{ id: number; stack: number } | null>; armor: Array<{ id: number; stack: number } | null>; dye: Array<{ id: number; stack: number } | null> } };
    const entries: Array<ItemSyncEntry & { playerSlot: number }> = [];
    for (let c = 0; c < 3; c++) {
      const arr = c === 0 ? p.inv.slots : c === 1 ? p.inv.armor : p.inv.dye;
      for (let i = 0; i < arr.length && i < INV_SYNC_SIZES[c]; i++) {
        entries.push({ playerSlot: this.mySlot, container: c as ItemContainer, itemSlot: i, itemId: arr[i]?.id ?? 0, stack: arr[i]?.stack ?? 0 });
      }
    }
    this.send(writePlayerItems(entries));
    this.sentInv = [p.inv.slots.map(s => s ? { ...s } : null), p.inv.armor.map(s => s ? { ...s } : null), p.inv.dye.map(s => s ? { ...s } : null)];
    this.invDumpPending = false;
  }

  /** 差分上报（tick 内每 250ms 调一次；原版 msg5 变化驱动逐槽发送的批量等价） */
  private syncInventory(now: number) {
    if (this.mySlot < 0) return;
    if (this.invDumpPending || !this.sentInv) { this.sendFullInventory(); return; }
    if (now - this.lastInvSync < 250) return;
    this.lastInvSync = now;
    const p = this.game.player as unknown as { inv: { slots: Array<{ id: number; stack: number } | null>; armor: Array<{ id: number; stack: number } | null>; dye: Array<{ id: number; stack: number } | null> } };
    const cur = [p.inv.slots, p.inv.armor, p.inv.dye];
    const entries: Array<ItemSyncEntry & { playerSlot: number }> = [];
    for (let c = 0; c < 3; c++) {
      const arr = cur[c];
      const sent = this.sentInv[c];
      for (let i = 0; i < arr.length && i < INV_SYNC_SIZES[c]; i++) {
        const a = arr[i], b = sent[i];
        if ((a?.id ?? 0) !== (b?.id ?? 0) || (a?.stack ?? 0) !== (b?.stack ?? 0)) {
          entries.push({ playerSlot: this.mySlot, container: c as ItemContainer, itemSlot: i, itemId: a?.id ?? 0, stack: a?.stack ?? 0 });
          sent[i] = a ? { ...a } : null;
        }
      }
    }
    if (entries.length) this.send(writePlayerItems(entries));
  }

  private applyRemoteItems(entries: Array<ItemSyncEntry & { playerSlot: number }>) {
    for (const e of entries) {
      if (e.container > 2 || e.itemSlot >= INV_SYNC_SIZES[e.container]) continue;
      let bag = this.remoteItems.get(e.playerSlot);
      if (!bag) {
        bag = {
          inv: Array(58).fill(null), armor: Array(20).fill(null), dye: Array(10).fill(null),
        };
        this.remoteItems.set(e.playerSlot, bag);
      }
      const arr = e.container === 0 ? bag.inv : e.container === 1 ? bag.armor : bag.dye;
      arr[e.itemSlot] = e.itemId ? { id: e.itemId, stack: e.stack } : null;
    }
  }
}
