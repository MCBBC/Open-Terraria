// MP 同步轻件包编解码（msg82 承载的 Liquid/Ping/Bestiary/TeleportPylon 四模块 +
// msg203 PingProbe）。标杆 Terraria.GameContent.NetModules/（1456）：
//   NetLiquidModule.cs         —— 液体网格变化广播（Liquid.cs:56 NetSendLiquid：
//                                   AddWater/DelWater 入列/出列两时刻记变化格，
//                                   :1159-1163 每 UpdateLiquid 末置换广播）
//   NetPingModule.cs           —— 地图 ping 中继（Vector2 位置；Main.cs:56016 TriggerPing）
//   NetBestiaryModule.cs       —— 图鉴进度（Kill=计数/Sight=首遇/Chat=首聊三子型）
//   NetTeleportPylonModule.cs  —— 晶塔增删广播 + 玩家传送请求
//   ParticleOrchestraSettings.cs（22B）—— 编排粒子（本仓唯一已移植类型 WoF 山羊火焰
//                                   原版 Mount.cs:3892 clientOnly:true 不上网——
//                                   故不做 NetParticlesModule，见任务报告）
// 字段编码尽量贴原版（7bit 计数 / packed coord），方向与信任边界见各函数注释；
// 模块 id 对齐 NetworkInitializer.cs 注册序（protocol.ts NetModule 表）。
import { Msg, NetModule, NetWriter, NetReader } from './protocol';

// ================= 7bit 变长整数（BinaryWriter.Write7BitEncodedInt） =================

/** Write7BitEncodedInt：每字节低 7 位有效，bit7=还有后续（小端序） */
export function write7Bit(w: NetWriter, v: number): void {
  let u = v >>> 0;
  while (u >= 0x80) {
    w.u8((u & 0x7f) | 0x80);
    u >>>= 7;
  }
  w.u8(u);
}

/** Read7BitEncodedInt（NPCKillsTracker 的 killcount 即此编码；上限 5 组字节 = u32） */
export function read7Bit(r: NetReader): number {
  let out = 0, shift = 0;
  for (;;) {
    const b = r.u8();
    out |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return out >>> 0;
    shift += 7;
    if (shift > 28) return out >>> 0;   // 防恶意流截断（u32 上限即 5 组）
  }
}

// ================= module0 Liquid（NetLiquidModule.cs） =================
//
// 原版语义：服务器端 Liquid 收集 AddWater/DelWater 触碰的格（packed (x<<16)|y），
// 每 UpdateLiquid（≈33ms）末置换广播；序列化时逐格读**当前** liquid/liquidType。
// 广播按接收端已激活 section 过滤（SerializeForPlayer + TileSections 门，:50-71）。
// 本仓：房主（中继房）/SimHost（服务器房）权威跑 LiquidSim，60ms 节流上报；
// 访客接收直写 store（不再本地模拟）。液体类型编码沿用仓库 +1 编码
// （与 msg10 strip 的 liquidType 字段同源；原版线上是裸 LiquidID 0-3——两套编码
// 在本协议内自洽，见 memory liquidtype-plus-one-encoding）。

export interface LiquidCell { x: number; y: number; liquid: number; liquidType: number }

/** 打包坐标（原版 (x & 0xFFFF) << 16 | (y & 0xFFFF)） */
export function packLiquidCoord(x: number, y: number): number {
  return ((x & 0xffff) << 16) | (y & 0xffff);
}
export function unpackLiquidCoord(packed: number): { x: number; y: number } {
  return { x: (packed >> 16) & 0xffff, y: packed & 0xffff };
}

/** 单帧上限（防超 65535B 包限；每条 4+1+1=6B，留足头部余量） */
export const LIQUID_CELLS_PER_FRAME = 4096;

/** 编码一批变化格（值由调用方在序列化时刻读取——原版 Serialize 同语义） */
export function writeLiquidModule(cells: LiquidCell[]): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.Liquid);
  w.u16(cells.length);
  for (const c of cells) {
    w.i32(packLiquidCoord(c.x, c.y));
    w.u8(c.liquid & 0xff);
    w.u8(c.liquidType & 0xff);
  }
  return w.finish();
}

export function readLiquidModule(r: NetReader): LiquidCell[] {
  const n = r.u16();
  const out: LiquidCell[] = [];
  for (let i = 0; i < n; i++) {
    const packed = r.i32();
    const liquid = r.u8();
    const liquidType = r.u8();
    const { x, y } = unpackLiquidCoord(packed);
    out.push({ x, y, liquid, liquidType });
  }
  return out;
}

// ================= module2 地图 ping（NetPingModule.cs + PingMapLayer.cs） =================
//
// 原版：Vector2 位置（全屏地图坐标，tile 单位 float）；C→S → 服务器广播
// （排除发送者，:20-22）；客户端 Main.Pings.Add。生命周期 PingMapLayer：
// 15s 存活 / 10fps 五帧行动画 / 槽容量 100（满员静默丢弃）。

export function writeMapPing(x: number, y: number): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.PingModule);
  w.f32(x);
  w.f32(y);
  return w.finish();
}

export function readMapPing(r: NetReader): { x: number; y: number } {
  return { x: r.f32(), y: r.f32() };
}

/** PingMapLayer 语义常量（PingMapLayer.cs:18-23） */
export const PING_DURATION_MS = 15_000;
export const PING_FRAME_RATE = 10;
export const PING_FRAME_COUNT = 5;
export const PING_MAX = 100;

/** 单条 ping（存活期由 store 内部管理） */
export interface MapPing { x: number; y: number; at: number }

/** Main.Pings（PingMapLayer 1:1）：容量 100、Add 满员丢弃、Draw 时过期移除 */
export class MapPingStore {
  readonly pings: MapPing[] = [];

  /** PingMapLayer.Add：满容量静默丢弃 */
  add(x: number, y: number, now: number): void {
    if (this.pings.length >= PING_MAX) return;
    this.pings.push({ x, y, at: now });
  }

  /** Draw 首段：过滤 15s 过期（原版 Draw 内移除——此处渲染前统一收割，语义等价） */
  live(now: number): MapPing[] {
    for (let i = this.pings.length - 1; i >= 0; i--) {
      if (now - this.pings[i].at > PING_DURATION_MS) this.pings.splice(i, 1);
    }
    return this.pings;
  }

  /** 动画帧号：SpriteFrame(1,5)，CurrentRow = (总秒 × 10) % 5（:35-40） */
  static frameOf(p: MapPing, now: number): number {
    return Math.floor(((now - p.at) / 1000) * PING_FRAME_RATE) % PING_FRAME_COUNT;
  }

  clear(): void { this.pings.length = 0; }
}

// ================= module4 图鉴（NetBestiaryModule.cs） =================
//
// 原版三子型：Kill {netId, 7bit killcount}（NPCKillsTracker.RegisterKill——服务器
// 杀怪时携带**累计值**广播）/ Sight / Chat（首遇/首聊才广播，tracker 内 flag 门）。
// OnPlayerJoining：三 tracker 逐条 SendToClient 全量补发进房玩家。
// 本仓方向：Kill 仅权威端（中继房=房主 / 服务器房=SimHost）上行；Sight/Chat 由
// 观察到的客户端上行（原版在服务器观测全场玩家——本仓访客只对自家视野观测，
// 语义等价收敛）。批量帧 = 原版逐事件一包的合并变体（带宽，语义等价）。

export const enum BestiarySub { Kill = 0, Sight = 1, Chat = 2 }

export type BestiaryNetEvent =
  | { sub: BestiarySub.Kill; netId: number; count: number }
  | { sub: BestiarySub.Sight | BestiarySub.Chat; netId: number };

export function writeBestiaryModule(events: BestiaryNetEvent[]): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.Bestiary);
  w.u16(events.length);
  for (const e of events) {
    w.u8(e.sub);
    w.i16(e.netId);
    if (e.sub === BestiarySub.Kill) write7Bit(w, e.count);
  }
  return w.finish();
}

export function readBestiaryModule(r: NetReader): BestiaryNetEvent[] {
  const n = r.u16();
  const out: BestiaryNetEvent[] = [];
  for (let i = 0; i < n; i++) {
    const sub = r.u8();
    const netId = r.i16();
    if (sub === BestiarySub.Kill) out.push({ sub, netId, count: read7Bit(r) });
    else if (sub === BestiarySub.Sight || sub === BestiarySub.Chat) out.push({ sub, netId });
    // 未知 sub：本条无参差字段（除 Kill 的计数段），可安全跳过继续解析
  }
  return out;
}

// ================= module7 晶塔（NetTeleportPylonModule.cs + TeleportPylonsSystem.cs） =================
//
// 原版子型：0 PylonWasAdded / 1 PylonWasRemoved（服务器→客户端，UpdatePylonsListAndBroadcastChanges
// 的差集广播）/ 2 PlayerRequestsTeleport（客户端→服务器，HandleTeleportRequest 权威
// 门禁五连后服务器 Teleport + SendData(65)）。
// 本仓中继房权威=房主：sub2 由服务器定向转发房主校验，房主以 sub3 TeleportResult
// 回执（服务器按 targetSlot 定向回投请求端——原版由服务器直接 Teleport 玩家，
// 本仓客户端权威移动模型改为"批准回执 + 请求端本地传送"，语义等价，见报告）。

export const enum PylonSub {
  PylonWasAdded = 0,
  PylonWasRemoved = 1,
  PlayerRequestsTeleport = 2,
  /** 本仓扩展：房主门禁结果回执（host→服务器→按 targetSlot 定向请求端） */
  TeleportResult = 3,
}

export type PylonNetMsg =
  | { sub: PylonSub.PylonWasAdded | PylonSub.PylonWasRemoved; x: number; y: number; type: number }
  /** C→S {x,y,type}；S→房主 追加 u8 requesterSlot（服务器权威回填——同 msg42 fromSlot 手法） */
  | { sub: PylonSub.PlayerRequestsTeleport; x: number; y: number; type: number; requesterSlot: number }
  /** 房主回执：上行带路由位 targetSlot（服务器剥除后定向转发）；下行 ok=false 时
   *  fail = Net.* 文案键（ChatHelper.SendChatMessageToClient 同源） */
  | { sub: PylonSub.TeleportResult; targetSlot: number; x: number; y: number; type: number; ok: boolean; fail: string | null };

export function writePylonModule(msg: PylonNetMsg): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.TeleportPylon);
  if (msg.sub === PylonSub.TeleportResult) {
    w.u8(msg.sub);
    w.u8(msg.targetSlot);
    w.i16(msg.x); w.i16(msg.y); w.u8(msg.type);
    w.bool(msg.ok);
    w.str(msg.fail ?? '');
    return w.finish();
  }
  w.u8(msg.sub);
  w.i16(msg.x); w.i16(msg.y); w.u8(msg.type);
  if (msg.sub === PylonSub.PlayerRequestsTeleport) w.u8(msg.requesterSlot & 0xff);
  return w.finish();
}

export function readPylonModule(r: NetReader): PylonNetMsg | null {
  const sub = r.u8();
  if (sub === PylonSub.TeleportResult) {
    const targetSlot = r.u8();
    const x = r.i16(), y = r.i16(), type = r.u8();
    const ok = r.bool();
    let fail: string | null = null;
    try { const s = r.str(); fail = s || null; } catch { fail = null; }
    return { sub, targetSlot, x, y, type, ok, fail };
  }
  if (sub !== PylonSub.PylonWasAdded && sub !== PylonSub.PylonWasRemoved
    && sub !== PylonSub.PlayerRequestsTeleport) return null;
  const x = r.i16(), y = r.i16(), type = r.u8();
  // sub2 尾部 requesterSlot：C→S 原生帧无此段（客户端 0），S→房主 中继帧必带
  if (sub === PylonSub.PlayerRequestsTeleport) {
    const requesterSlot = r.remaining > 0 ? r.u8() : 0;
    return { sub, x, y, type, requesterSlot };
  }
  return { sub, x, y, type };
}

// ================= msg203 PingProbe（玩家列表面板 RTT 数据源；本仓自有通道） =================
//
// 原版无玩家列表面板（仅 /playing 命令与服务器控制台），无 ping 显示——本面板的
// RTT 由服务器主动探测：每 10s 发 {serverTs, 全房 RTT 表}，客户端原样回显 serverTs，
// 服务器 Date.now()-serverTs = 该端 RTT（自测的下一帧探针携带新表）。旧端未知号
// 默认忽略（SpectateFocus=150 先例），新旧互操作安全。

export function writePingProbe(serverTs: number, table: Array<{ slot: number; rttMs: number }>): Uint8Array {
  const w = new NetWriter(Msg.ServerPingProbe);
  w.f64(serverTs);
  w.u8(table.length);
  for (const t of table) { w.u8(t.slot); w.u16(t.rttMs & 0xffff); }
  return w.finish();
}

export function readPingProbe(r: NetReader): { serverTs: number; table: Array<{ slot: number; rttMs: number }> } {
  const serverTs = r.f64();
  const n = r.u8();
  const table: Array<{ slot: number; rttMs: number }> = [];
  for (let i = 0; i < n; i++) table.push({ slot: r.u8(), rttMs: r.u16() });
  return { serverTs, table };
}

export function writePingProbeEcho(serverTs: number): Uint8Array {
  return new NetWriter(Msg.ServerPingProbe).f64(serverTs).finish();
}

export function readPingProbeEcho(r: NetReader): number {
  return r.f64();
}
