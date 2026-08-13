// 多人联机共享协议层（客户端与 Node 服务器共用，docs/multiplayer-design.md §1-2）。
// 帧格式对齐原版：[u16 len][u8 msgId][payload...]，小端，包上限 65535B。
// 消息 ID 尽量沿用原版 MessageID 编号（Hello=1/SLOT=3/WorldData=7/TileSection=10/
// PlayerSpawn=12/PlayerControls=13/TileManipulation=17/SetTime=18/NetModules=82/Ping=154）；
// 编码字段为本仓库简化集（protoVer 门禁，当前 v6——演进史见 PROTO_VER 注释）。

export const PROTO_MAGIC = 'SW1';
/** v2：msg13 对齐原版 PlayerControls 布局（控制位+position+velocity）。
 *  v3：实体同步族（msg16/21/23/27/42）+ 箱子权威（msg31/32）+ sessionToken 重连
 *  v4：msg23 S→C 短码格式（key 每次全量→codeId 短码+按需全量）+ RoomPolicy 尾部 u16 maxPlayers
 *  v5：msg27 kind 高位 bit7=hostile（原版 Projectile.hostile 位——访客端据此对敌对弹幕
 *      傀儡本地结算 Damage_EVP；服务器剥除非房主置位）
 *  v6：msg27 kind 5-8（锚定 Boss 的自包含弹体：DukeSharknadoBolt/龙卷/MLDeathray/LunarOrb，
 *      tag 打包锚参数，访客重建真类本地跑确定性 AI）+ msg28 弹幕消亡上报（消幽灵弹窗口）+
 *      msg201 SSC 角色档下发（--ssc）。server 与 game 同仓库同时发布，不做向后兼容
 *  v7：PvP——msg13 flagBits[7]=hostile + 尾部 u8 team(0-5)；RoomPolicy 尾部 u8 pvpAllowed；
 *      msg44 StrikePlayer（近战 PvP 命中意向，被打方本地结算 HP——客户端权威模型）*/
export const PROTO_VER = 7;

/** 消息 ID（v1 实现范围；编号对齐原版 MessageID.cs） */
export const enum Msg {
  Hello = 1,          // C→S {magic, protoVer, name, hostToken 兜底}
  Kick = 2,           // S→C {reason}（原版 Kick/Disconnect 同号）
  PlayerSlot = 3,     // S→C {slot, sessionToken}（原版同号 PlayerInfo=3：名字/外观在原版
                      //   走此包，我们拆到 Hello+msg4——字段分布简化，ID 保留；
                      //   sessionToken 为重连凭据）
  SyncPlayer = 4,     // 双向 {slot, appearanceJson}
  SyncPlayerItem = 5, // C→S→广播（v2 对齐原版 msg5 SyncPlayerItem 语义，批量变体）：
                      //   {u8 count, entries[{u8 playerSlot(服务端覆写), u8 container,
                      //    u8 itemSlot, u16 itemId(0=空), u16 stack}]}
                      //   container: 0=slots[0..57] 1=armor[0..19] 2=dye[0..9]
  RequestWorldData = 6, // C→S {}
  WorldData = 7,      // S→C {时间/尺寸/出生点/层线/flags/seed/name}
  SpawnTileData = 8,  // C→S {x, y}（客户端请求出生点周围 section）
  StatusText = 9,     // S→C {count}（将发的 strip 数，进度条）
  TileSection = 10,   // S→C {x0,y0,w,h, rleBytes}（200×20 条带）
  PlayerSpawn = 12,   // S→C {slot, x, y}（进房落点确认）
  PlayerState = 13,   // C→S→广播（v2 对齐原版 msg13）：{u8 slot, u8 ctrlBits, u8 flagBits,
                      //   u8 selectedItem, f32 x, f32 y, [f32 vx, f32 vy 若 flagBits[2]]}
                      //   ctrlBits: [0]up [1]down [2]left [3]right [4]jump [5]useItem [6]direction
                      //   flagBits: [2]hasVelocity [6]ghost(死亡)。position=碰撞盒左上（原版语义）
  PlayerActive = 14,  // S→C 广播 {slot, active, name}
  TileBatch = 17,     // C→S→广播 {count, ops[]}（tile 操作批量，对齐 msg17 语义）
  SetTime = 18,       // S→C {timeOfDay, dayCount}
  // ---- v3 实体同步（房主权威 + 服务器中继；ID 对齐原版 MessageID.cs） ----
  PlayerLifeMana = 16, // 双向 {u8 slot, i16 hp, i16 maxHp}（原版同号：客户端权威 HP，服务器中继）
  SyncItem = 21,       // 房主→广播 {u32 netId, u8 op(0=spawn/1=take/2=despawn), str key,
                       //   u16 stack, f32 x,y,vx,vy}（原版同号 SyncItem）
  SyncNPC = 23,        // C→S（房主上行）：{u16 count, [u32 netId, str key, f32 x,y,vx,vy,
                       //    i16 hp, i16 maxHp, u16 animT, u8 flags(bit0=boss)]}
                       // S→C（v4 短码+AOI 逐端过滤）：{u16 count, [u8 eflags, ...,
                       //    eflags.bit0=含 key 全量(u32 netId + u16 codeId + str key)
                       //             bit1=boss；否则仅 u16 codeId（客户端 codeId→netId/key 表）]}
  SyncProjectile = 27, // 双向（各自的弹幕互播，原版同号）：
                       //   {u16 count, [u32 netId, u8 kind, str tag, i16 dmg, i16 aux, f32 x,y,vx,vy]}
                       //   （kind 低 7 位: 0=Arrow 1=WeaponProj族 2=Dart 3=TrapShot 4=MagicProj
                       //    5=DukeSharknadoBolt 6=DukeSharknadoTornado 7=MLDeathray 8=LunarOrb（v6：
                       //    Boss 锚定弹体，tag 打包锚参数——见 Game.netProjBroadcast 各分支注释）；
                       //    bit7(0x80)=hostile——原版 Projectile.hostile，v5 起 kind0/2/3 携带
                       //    （服务器剥除非房主置位），访客端对 hostile 傀儡本地结算 Damage_EVP；
                       //    bit6(0x40)=pvp——v7 玩家 PvP 弹：pvpAllowed 房内 hostile 玩家的
                       //    kind0(友方)/1/4 弹幕携带，与 bit7 独立（NPC 敌弹≠玩家 PvP 弹，
                       //    前者无条件命中、后者须过 InOpposingTeam 门禁）
  ProjDespawn = 28,  // C→S→广播（v6）：{u16 count, [u32 netId]}——弹幕消亡上报，
                    //   各端对自己拥有的弹幕在消亡时批量上报，接收端即时移除傀儡
                    //   （替代纯 180t 超时清扫：消除幽灵弹窗口 + 消亡闪烁）
  RequestChestOpen = 31, // C→S {i32 x, i32 y}（箱子锚点；原版同号）
  SyncChestItem = 32,  // S→C 下发 / C→S 槽位编辑（原版同号 SyncChestItem）：
                       //   {u16 chestIdx, i32 x, i32 y, u16 count, [u8 slot, u16 itemId, u16 stack]}
  StrikeNPC = 42,      // 访客→房主（服务器定向转发）{u32 netId, i16 dmg, f32 kbx, f32 kby}
                       //   （原版 42=Unknown42：旧 StrikeNPC 槽位；注释曾误写 crit/kbDir/srcX/srcY——
                       //    实际线格式自 v3 起即为 dmg+击退两分量，2026-08 校正）
  StrikePlayer = 44,   // C→S→定向转发（v7 PvP）：C→S {u8 targetSlot, i16 rawDmg, i16 kbx, i16 kby,
                       //   u16 weaponId, u8 flags}；S→C 追加尾部 u8 fromSlot
                       //   （服务器回填发送方槽位——被打端 InOpposingTeam 门禁需要攻击者身份，
                       //   不信任客户端自报）。PvP 命中意向广播。
                       //   flags：bit0=crit / bits1-4=武器浸剂 meleeEnchant / bit5=圣骑士盾转移
                       //   （rawDmg=转移额,被击端独立冷却槽,死因 teamTank）/
                       //   bit6=狱火光环（rawDmg=20,被击端 per-owner 60t 冷却,死因 inferno）
                       //   权威模型=被打方本地结算（与 msg16 客户端权威 HP 同构）：
                       //   攻击端只报意向，被打端过 InOpposingTeam 门禁后自行结算扣血，
                       //   伪造包最多影响显示、无法强制扣血。武器 id 供死因文案（DeathSource.Player）
  NetModules = 82,    // 双向 {moduleId, ...}（module1=聊天 module2=ping）
  Ping = 154,         // 简化独立心跳（module2 并存预留）
  // ---- v3 房间制扩展（docs/multiplayer-design.md §房间） ----
  RoomPolicy = 200,   // S→C {roomCode, roomName, isHost, protectTiles, protectItems, u16 maxPlayers(v4)}
  SscSync = 201,      // S→C（v6，--ssc 启用时）{str recordJson}——服务器角色档下发。
                      //   record = {hp, maxHp, x, y, inv, armor, dye, savedAt}（id=内部下标，
                      //   同版本 registry 一致）。客户端进房应用覆盖本地角色。
                      //   语义=存档型 SSC（原版 ServerSideCharacter 同款信任模型，非反作弊）
}

/** NetModule 表（0-2 对齐原版 NetworkInitializer.cs 注册序：Liquid/Text/Ping；
 *  JoinLeave=3 与原版 NetAmbienceModule 撞号——本协议双端自洽，无互操作需求） */
export const enum NetModule {
  Liquid = 0,   // 预留（v1 液体客户端本地）
  Text = 1,     // 聊天 {authorSlot, text, r, g, b}（author=255 无前缀，对齐原版 255=服务器）
  PingModule = 2, // 预留
  JoinLeave = 3,  // S→C 系统 {slot, joined}——加入/离开公告（原版 Lang.mp[19]/[20]，服务器广播）
}

// ================= Writer（小端，定宽；字符串 = u16 长度 + UTF-8） =================

export class NetWriter {
  private buf = new Uint8Array(256);
  private len = 0;
  private dv: DataView;

  constructor(private readonly msgId: number) {
    // 预留 [u16 len][u8 msgId]
    this.len = 3;
    this.dv = new DataView(this.buf.buffer);
  }

  private grow(need: number) {
    if (this.len + need <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < this.len + need) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
    this.dv = new DataView(this.buf.buffer);
  }

  u8(v: number): this { this.grow(1); this.buf[this.len++] = v & 255; return this; }
  u16(v: number): this { this.grow(2); this.dv.setUint16(this.len, v, true); this.len += 2; return this; }
  i16(v: number): this { this.grow(2); this.dv.setInt16(this.len, v, true); this.len += 2; return this; }
  u32(v: number): this { this.grow(4); this.dv.setUint32(this.len, v >>> 0, true); this.len += 4; return this; }
  i32(v: number): this { this.grow(4); this.dv.setInt32(this.len, v, true); this.len += 4; return this; }
  f32(v: number): this { this.grow(4); this.dv.setFloat32(this.len, v, true); this.len += 4; return this; }
  f64(v: number): this { this.grow(8); this.dv.setFloat64(this.len, v, true); this.len += 8; return this; }
  bool(v: boolean): this { return this.u8(v ? 1 : 0); }
  bytes(b: Uint8Array): this { this.grow(b.length); this.buf.set(b, this.len); this.len += b.length; return this; }
  str(s: string): this {
    const b = new TextEncoder().encode(s);
    this.u16(b.length);
    return this.bytes(b);
  }

  /** 回填长度前缀并返回完整帧（含 [u16 len][u8 id]）。finish 后禁止再写入（subarray 视图） */
  finish(): Uint8Array {
    // Q3 修复：守卫含头总长（此前 len-3 在 65533..65535 区间漏检 → setUint16 回绕 → 接收端脏流）
    if (this.len > 65535) throw new Error(`net: 包超限 ${this.len}`);
    this.dv.setUint16(0, this.len, true);
    this.buf[2] = this.msgId & 255;
    return this.buf.subarray(0, this.len);
  }
}

// ================= Reader =================

export class NetReader {
  private dv: DataView;
  private p = 0;
  constructor(private readonly buf: Uint8Array) {
    this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  u8(): number { return this.buf[this.p++]; }
  get remaining(): number { return this.buf.length - this.p; }
  u16(): number { const v = this.dv.getUint16(this.p, true); this.p += 2; return v; }
  i16(): number { const v = this.dv.getInt16(this.p, true); this.p += 2; return v; }
  u32(): number { const v = this.dv.getUint32(this.p, true); this.p += 4; return v; }
  i32(): number { const v = this.dv.getInt32(this.p, true); this.p += 4; return v; }
  f32(): number { const v = this.dv.getFloat32(this.p, true); this.p += 4; return v; }
  f64(): number { const v = this.dv.getFloat64(this.p, true); this.p += 8; return v; }
  bool(): boolean { return this.u8() !== 0; }
  bytes(n: number): Uint8Array { const b = this.buf.subarray(this.p, this.p + n); this.p += n; return b; }
  str(): string {
    const n = this.u16();
    return new TextDecoder().decode(this.bytes(n));
  }
}

// ================= 帧流解析（粘包；对齐原版 CheckBytes 语义） =================

/** 字节流帧解析器：append 后逐帧回调 {msgId, payloadReader}，自动处理半包。
 *  P0.4 增量化：单一缓冲 + 读写偏移（旧版每 drain 把全部 chunk 合并成新数组——
 *  4 人房每秒数百次全量拷贝，纯 GC 压力）。残余半包 copyWithin 归位。 */
export class FrameParser {
  private buf = new Uint8Array(4096);
  private len = 0;
  private _draining = false;

  append(data: Uint8Array) {
    if (this._draining) throw new Error('FrameParser: drain 回调内禁止 append（会破坏解析缓冲）');
    if (this.len + data.length > this.buf.length) {
      let cap = this.buf.length;
      while (cap < this.len + data.length) cap *= 2;
      const nb = new Uint8Array(cap);
      nb.set(this.buf.subarray(0, this.len));
      this.buf = nb;
    }
    // 拷贝入缓冲（ws 回调数据可能被复用）
    this.buf.set(data, this.len);
    this.len += data.length;
  }

  /** 解析所有完整帧；返回 false 表示缓冲为空。
   *  脏流防护：len 非法时按字节重同步（此前 break 不前进 → 永久失步 + 缓冲无限增长）。
   *  缓冲上限：超限重置（半包攻击防御）。P1.3 合包后单条 WS 消息可达 512KB
   *  （服务器 FLUSH_SLICE 切片；25 条 strip 拼发），上限须高于切片粒度——
   *  2026-08 实踩：沿用 256KB 旧值会把进房 strip 大包整包丢弃 → 世界组装永久卡死 */
  private static readonly MAX_BUFFER = 4 * 1024 * 1024;
  drain(cb: (msgId: number, r: NetReader) => void): boolean {
    if (this._draining) throw new Error('FrameParser: drain 重入');
    if (this.len < 3) return this.len > 0;
    if (this.len > FrameParser.MAX_BUFFER) { this.len = 0; return false; }
    this._draining = true;
    let p = 0;
    let any = false;
    const dv = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
    try {
      while (p + 3 <= this.len) {
        const len = dv.getUint16(p, true);
        if (len < 3 || len > 65535) { p += 1; continue; } // 脏字节：跳过重同步
        if (p + len > this.len) break; // 半包
        const msgId = this.buf[p + 2];
        cb(msgId, new NetReader(this.buf.subarray(p + 3, p + len)));
        p += len;
        any = true;
      }
    } finally {
      this._draining = false;
      // 压缩必须在 finally：回调抛错时 p 已前进，若不归位会从 0 重放同一批帧
      // → 同一异常反复抛出，连接永久毒化（review C3）
      if (p > 0) {
        if (p < this.len) this.buf.copyWithin(0, p, this.len);
        this.len -= p;
      }
    }
    return any || this.len > 0;
  }
}

// ================= 玩家物品同步（msg5 SyncPlayerItem 批量变体） =================

export const enum ItemContainer {
  Slots = 0,  // inv.slots[0..57]
  Armor = 1,  // inv.armor[0..19]（0-2 盔甲/3-9 配饰/10-12 时装/13-19 时装配饰）
  Dye = 2,    // inv.dye[0..9]
}

export interface ItemSyncEntry {
  container: ItemContainer;
  itemSlot: number;
  itemId: number;   // 0 = 空
  stack: number;
}

export const INV_SYNC_SIZES = [58, 20, 10];

export function writePlayerItems(entries: Array<ItemSyncEntry & { playerSlot: number }>): Uint8Array {
  const w = new NetWriter(Msg.SyncPlayerItem);
  w.u16(entries.length);
  for (const e of entries) {
    w.u8(e.playerSlot);
    w.u8(e.container);
    w.u8(e.itemSlot);
    w.u16(e.itemId & 0xffff);
    w.u16(e.stack & 0xffff);
  }
  return w.finish();
}

export function readPlayerItems(r: NetReader): Array<ItemSyncEntry & { playerSlot: number }> {
  const n = r.u16();
  const out: Array<ItemSyncEntry & { playerSlot: number }> = [];
  for (let i = 0; i < n; i++) {
    const playerSlot = r.u8();
    const container = r.u8() as ItemContainer;
    const itemSlot = r.u8();
    const itemId = r.u16();
    const stack = r.u16();
    out.push({ playerSlot, container, itemSlot, itemId, stack });
  }
  return out;
}

// ================= tile 操作批量（msg17，对齐原版单点操作语义的批量变体） =================

export const enum TileOpAction {
  SetTile = 0,    // v=type, fx, fy
  SetWall = 1,    // v=wall
  SetHalfBrick = 5,
  SetSlope = 6,
  SetActuated = 3,
  SetWire = 4,    // v=bits
}

export interface TileOp {
  a: TileOpAction;
  x: number; y: number;
  v: number;
  fx: number; fy: number;
}

export function writeTileBatch(ops: TileOp[]): Uint8Array {
  const w = new NetWriter(Msg.TileBatch);
  w.u16(ops.length);
  for (const o of ops) {
    w.u8(o.a);
    w.i32(o.x); w.i32(o.y);
    w.u16(o.v & 0xffff);
    if (o.a === TileOpAction.SetTile) { w.u16(o.fx); w.u16(o.fy); }
  }
  return w.finish();
}

export function readTileBatch(r: NetReader): TileOp[] {
  const n = r.u16();
  const ops: TileOp[] = [];
  for (let i = 0; i < n; i++) {
    const a = r.u8() as TileOpAction;
    const x = r.i32(), y = r.i32(), v = r.u16();
    let fx = 0, fy = 0;
    if (a === TileOpAction.SetTile) { fx = r.u16(); fy = r.u16(); }
    ops.push({ a, x, y, v, fx, fy });
  }
  return ops;
}

// ================= tile strip RLE 编解码（msg10，codecVer=0 裸 RLE） =================
// 每 tile 完整状态 11B 裸（type u16/flags u8/frameX u16/frameY u16/wall u16/
// liquid u8/liquidType u8/half u8/slope u8/wire u8）；RLE 按"全状态相同"连续段编码
// [u16 count][14B 状态] = 16B/run，地下均质区压缩比极高。
// 条带默认 200×20（4000 格，全异态最坏 4000×16+15 ≈ 64015B < 65535 包上限——
// 余量仅 ~1.5KB！扩 strip 尺寸或加状态通道前必核此账，超限会触发 finish() 抛错）。

export interface StripRect { x0: number; y0: number; w: number; h: number; }

/** 编码一条 strip（读 store 指定矩形） */
export function encodeStrip(
  st: { w: number; h: number; type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array;
        wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array },
  rect: StripRect,
): Uint8Array {
  const w = new NetWriter(Msg.TileSection);
  w.i32(rect.x0); w.i32(rect.y0); w.u16(rect.w); w.u16(rect.h);
  const idx = (x: number, y: number) => y * st.w + x;
  let run = 0;
  let rType = 0, rFlags = 0, rFx = 0, rFy = 0, rWall = 0, rLiq = 0, rLt = 0, rHalf = 0, rSlope = 0, rWire = 0;
  const flushRun = () => {
    if (run === 0) return;
    w.u16(run);
    w.u16(rType); w.u8(rFlags); w.u16(rFx); w.u16(rFy); w.u16(rWall);
    w.u8(rLiq); w.u8(rLt); w.u8(rHalf); w.u8(rSlope); w.u8(rWire);
    run = 0;
  };
  for (let y = rect.y0; y < rect.y0 + rect.h; y++) {
    for (let x = rect.x0; x < rect.x0 + rect.w; x++) {
      const i = idx(x, y);
      if (run > 0 && (
        st.type[i] !== rType || st.flags[i] !== rFlags || st.frameX[i] !== rFx || st.frameY[i] !== rFy
        || st.wall[i] !== rWall || st.liquid[i] !== rLiq || st.liquidType[i] !== rLt
        || st.half[i] !== rHalf || st.slope[i] !== rSlope || st.wire[i] !== rWire
      )) flushRun();
      if (run === 0) {
        rType = st.type[i]; rFlags = st.flags[i]; rFx = st.frameX[i]; rFy = st.frameY[i];
        rWall = st.wall[i]; rLiq = st.liquid[i]; rLt = st.liquidType[i];
        rHalf = st.half[i]; rSlope = st.slope[i]; rWire = st.wire[i];
      }
      run++;
    }
  }
  flushRun();
  return w.finish();
}

/** 解码一条 strip 直写目标 store（批量路径：绕过事件，调用方负责事后整块标脏） */
export function decodeStrip(
  st: { w: number; h: number; type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array;
        wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array },
  r: NetReader,
): StripRect | null {
  const x0 = r.i32(), y0 = r.i32(), w = r.u16(), h = r.u16();
  if (x0 < 0 || y0 < 0 || x0 + w > st.w || y0 + h > st.h) return null;
  let written = 0;
  while (written < w * h) {
    const count = r.u16();
    // C2 防死循环：count=0（恶意/损坏数据）或 payload 已尽（截断）→ 终止并返回已写区域
    if (count === 0) break;
    const type = r.u16(), flags = r.u8(), fx = r.u16(), fy = r.u16(), wall = r.u16();
    const liq = r.u8(), lt = r.u8(), half = r.u8(), slope = r.u8(), wire = r.u8();
    for (let k = 0; k < count && written < w * h; k++) {
      const x = x0 + (written % w), y = y0 + Math.floor(written / w);
      const i = y * st.w + x;
      st.type[i] = type; st.flags[i] = flags; st.frameX[i] = fx; st.frameY[i] = fy; st.wall[i] = wall;
      st.liquid[i] = liq; st.liquidType[i] = lt; st.half[i] = half; st.slope[i] = slope; st.wire[i] = wire;
      written++;
    }
  }
  return { x0, y0, w, h };
}
