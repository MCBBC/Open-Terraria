// MP 同步轻件包编解码（msg82 承载的 Liquid/Ping/Bestiary/TeleportPylon 四模块 +
// msg203 PingProbe）。标杆 Terraria.GameContent.NetModules/（1456）：
//   NetLiquidModule.cs         —— 液体网格变化广播（Liquid.cs:56 NetSendLiquid：
//                                   AddWater/DelWater 入列/出列两时刻记变化格，
//                                   :1159-1163 每 UpdateLiquid 末置换广播）
//   NetPingModule.cs           —— 地图 ping 中继（Vector2 位置；Main.cs:56016 TriggerPing）
//   NetBestiaryModule.cs       —— 图鉴进度（Kill=计数/Sight=首遇/Chat=首聊三子型）
//   NetTeleportPylonModule.cs  —— 晶塔增删广播 + 玩家传送请求
//   ParticleOrchestraSettings.cs（22B）—— 编排粒子（原版同步面 = 全部编排特效，
//                                   纯 dust 不上网；本仓子集与审计结论见 module8 段注）
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
  /** C→S {x,y,type}（requesterSlot 省缺=0——客户端原生帧无此段）；S→房主 追加
   *  u8 requesterSlot（服务器权威回填——同 msg42 fromSlot 手法） */
  | { sub: PylonSub.PlayerRequestsTeleport; x: number; y: number; type: number; requesterSlot?: number }
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
  if (msg.sub === PylonSub.PlayerRequestsTeleport) w.u8((msg.requesterSlot ?? 0) & 0xff);
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

// ================= module8 编排粒子（NetParticlesModule.cs + ParticleOrchestraSettings.cs） =================
//
// 原版语义：编排特效（ParticleOrchestrator.RequestParticleSpawn/Broadcast*）经
// 22B 载荷全网广播（服务器 Broadcast 排除发送者,客户端 SpawnParticlesDirect）。
// 纯 dust 永不上网（各端本地模拟）。原版广播全集（1456 全量扫）：
//   剑刃轨迹族（NightsEdge/TrueNightsEdge/Excalibur/TrueExcalibur/TerraBlade/
//   StardustPunch/MoonLordWhipHit/PrincessWeapon/PaladinsHammer… Projectile.cs:12196+）、
//   近战编排（SlapHand/WaffleIron/ClassyCane/FlyMeal Player.cs:43687+）、
//   微光族（ShimmerTownNPC/ShimmerTownNPCSend/ShimmerBlock/ShimmerArrow）、
//   杂项（ItemTransfer Chest.cs:302 / LoadoutChange / Digestion / VampireOnFire /
//   HeroicisSetSpawnSound / TownSlimeTransform / FakeFish 族…）。
// 本仓现状：无 ParticleOrchestrator 编排器系统（唯一移植的编排视觉 = WoF 山羊火焰
// FlameParticles——原版 Mount.cs:3892 clientOnly:true 不上网）；上表生产者在本地
// 均未走编排通道（剑刃命中等用本地 dust/贴图特效）。照子集落地 = 通道 1:1 编解码 +
// 服务器中继就位，生产/消费子集 = 微光族两型（TownNPC shimmerRise 链本地已有
// 同款视觉,NPC.cs:53674/:56004 原版广播位 1:1）+ 2026-08-21 生产者补齐批四型
// （PetExchange/VampireOnFire/Digestion/LoadoutChange——逐型评估清单见下方枚举注,
// 原则 = 只接本仓已有视觉, 无视觉型登记不硬造）；2026-08-31 L5 批再收编九型
// （RainbowRodHit/SlapHand/FlyMeal/WaffleIron/ClassyCane/DeadCells 族三型/
//   ShadowbeamHostile·Friendly/PaladinsHammerShockwave——消费+生产双侧,见枚举注）
// 其余型到达时静默忽略（前向兼容）。

/** ParticleOrchestraType.cs 摘录（本仓已接消费/生产子集；全表 72 型见源文件）。
 *  2026-08-21 生产者补齐批（全 wire 面逐型评估，clientOnly:true 型原版永不上
 *  网不在此列）：已接 6 型 = 微光族两型 + PetExchange（重掷绿爆=本地既有视觉,
 *  NPC.cs:81733 广播位）/ VampireOnFire（Item_20 点火音=本地既有, Player.cs:28178）/
 *  Digestion（马桶消化棕粒=本地既有, Player.cs:18751）/ LoadoutChange（切配装白闪
 *  词汇世界化, Player.cs:5444——白闪本体是 UI 槽闪, 世界侧重放为白色升腾粒）。
 *  2026-08-31 台账 L5 清偿批（fx/orchestraFx.ts 收编池;每型 Spawn_ 段 derive）：
 *  新接 RainbowRodHit(5)/SlapHand(20)/FlyMeal(21)/WaffleIron(30)/ClassyCane(55)/
 *  DeadCellsMushroomBoiExplosion(34)/DeadCellsDownDashExplosion(35)/
 *  DeadCellsFlint(41)/ShadowbeamHostile·Friendly(58/59——Arrow.ts:2470/:5209 已在
 *  广播 59,收包侧此前静默丢,消费面本次补齐)/PaladinsHammerShockwave(68)。
 *  2026-08-31 L5 长尾批（本段为终态清单）再收编消费+FX 全量：剑刃轨迹族
 *  NightsEdge(10)/TrueNightsEdge(12)/Excalibur(13)/TrueExcalibur(14，剑鞭 tag 同用)/
 *  TerraBlade(15)/MoonLordWhipHit(44)/MoonLordWhipEye(45)/StardustPunch(7)/
 *  PrincessWeapon(8)/FormatC(72)/PaladinsHammer(9,★vanilla 无调用点孤儿型)、雷族
 *  BlackLightningHit(4)/BlackLightningSmall(6)/BlueLightningSmall(37)/
 *  RedLightningSmall(77)/BlueLightningSmallLong(65)/StormlightningWindup(62)/
 *  ArcSurge(71,折线本体 proj1457 自绘不重复)/StormLightning(61 占位注册)/
 *  PaladinsShieldHit(63)、配饰 SnappingStone(69)/Melee(74)/Summon(75)/
 *  Recharge×3(79/80/81)/HarpyCharm(70)/PhoenixQuiver(76)/SeraphNecklace(78)、杂项
 *  Keybrand(0)/GasTrap(23)/ShimmerArrow(25)/ShimmerBlock(28)/TownSlimeTransform(26)/
 *  CattivaHit(67)/RainbowBoulder1-4(47-50)+PetBounce(60)/BestReforge(18)/
 *  SilverBulletSparkle(11)/UFOLaser(39)/MagnetSphereBolt(56)/HeatRay(57)/
 *  ItemTransfer(24)/PooFly(31)/InScreenDungeonSpawn(66)/HeroicisSetSpawnSound(64)/
 *  PlayerVoiceOverrideSound(46,音效型照 PlaySound 锚)/NatureFly(53)/LakeSparkle(52)。
 *  叶绿 LeafCrystal 两型的消费派发由叶绿 SetBonus 代理的实体面自带（16 驻留绿弧/
 *  17 弹轨迹 streak 在其分支处理），本批 fx/orchestraFx 备 chlorophyteLeafCrystal*
 *  纯函数供对拍不复派发。登记维持（确不可达/无锚）：PaladinsHammer(9)——1458 全仓
 *  grep 无任何 RequestParticleSpawn 调用点（只存在 Spawn_ 分派臂）=vanilla 自身孤儿;
 *  DeadCells 余三型（BarnacleShotFiring :27036 挂点无 producer;BarrelExplosion≈
 *  Arrow1023 killNow 内联近似;MushroomBoiTargetFound 已接 34 型旁路）;FakeFishJump(54)
 *  保持 FakeFish.ts 局部池（跃态密度门）;NatureFly/PooFly tile-ambient 面;PlayerVoice
 *  变声样本库;HeroicisSet 出土转化链;PaladinsShield pvp 盾链;Keybrand :35153 滑行拖星。
 *  2026-08-21 前批六型与 L5 九型见前注；每个 clientOnly:false 型生产端均 module8 上行。
 *  DeadCells 余三型（BarnacleShotFiring :27036 clientOnly:true 无锚→register;
 *  BarrelExplosion≈Arrow1023 killNow 内联近似不另走编排通道;MushroomBoiTargetFound
 *  挂点父弹键缺省）、ItemTransfer/PooFly/LakeSparkle/NatureFly/FakeFish±Jump
 *  （clientOnly:true 本地直驱族,FakeFish.ts 同口径）、UFOLaser/MagnetSphereBolt/
 *  HeatRay/SnappingStone×6/HarpyCharm/PhoenixQuiver/SeraphNecklace 等——原版
 *  调用位见上表头注行号 */
export const enum ParticleOrchestraType {
  RainbowRodHit = 5,        // 万花筒鞭 tag+彩虹魔杖弹命中虹彩簇（WhipTagEffect_Kaleidoscope.cs:9 /
                            //   Projectile.cs:14299 clientOnly:false;Kill 双掷 :72412/:72490 本地）
  PetExchange = 19,         // 城镇宠物变体重掷成功（NPC.cs:81733 Broadcast）
  SlapHand = 20,            // 巴掌拍击命中音（Player.cs:44707-44713;Spawn_=纯 Item175 音）
  FlyMeal = 21,             // 苍蝇美食命中音（Player.cs:44736-44740;Spawn_=纯 Item16 音）
  VampireOnFire = 22,       // 吸鬼灼阳点火音（Player.cs:28178；Spawn_=纯 Item20 音）
  LoadoutChange = 27,       // F1-F3 切配装（Player.cs:5444；UniqueInfo=配装档序）
  Digestion = 29,           // 马桶消化（Player.cs:18751；MovementVector=−direction）
  WaffleIron = 30,          // 华夫饼烙印命中音（Player.cs:44715-44721;Spawn_=纯 Item178 音）
  ShimmerTownNPC = 32,      // 城镇 NPC 微光转化到位（NPC.cs:53674 / Player.cs:28402）
  ShimmerTownNPCSend = 33,  // 微光上升态远距落点传送（NPC.cs:56004）
  DeadCellsMushroomBoiExplosion = 34,  // 蘑菇小伙伴爆炸（P.cs:35277 clientOnly:true→本仓
                                       //   owner 权威模拟改 broadcast 补远端,偏差登记）
  DeadCellsDownDashExplosion = 35,     // 下坠砸地爆（Player.cs:29005-29022 clientOnly:false；
                                       //   下坠跳系统未移植→当前仅消费面，producer 缺口登记）
  DeadCellsFlint = 41,      // 火石枪满蓄刺出土面释放（P.cs:53240-53245 clientOnly:false）
  ShadowbeamHostile = 58,   // 暗影束（敌型,Projectile.cs :71840 Kill 铺撒）
  ShadowbeamFriendly = 59,  // 暗影束（友型,HandleMovement 反弹铺撒 P.cs:18976-18984）
  ClassyCane = 55,          // 税官杖铜币命中小奖纸屑（Player.cs:44726-44732 clientOnly:false）
  PaladinsHammerShockwave = 68,  // 圣骑锤撞墙冲击波（P.cs:19649-19661;MovementVector=Size）
  // ---- 台账 L3 清偿批（2026-08-31）----
  ChlorophyteLeafCrystalPassive = 16, // 叶绿晶叶驻留绿弧（视觉纯函数 fx/orchestraFx.chlorophyteLeafCrystalPassiveFx 备档;弹体本体归叶绿 SetBonus 代理域——错峰约定）
  ChlorophyteLeafCrystalShot = 17,  // 叶绿叶弹轨迹 streak（Projectile.cs:28285 aiStyle43
                                    //   每子步请求,clientOnly:false;UniqueInfoPiece=hue byte,
                                    //   MovementVector=弹速;视觉本体 fx/orchestraFx.leafCrystalShot,
                                    //   producer=ChloroLeafShot.trailStep——L5 备案项收编）。
                                    //   ChlorophyteLeafCrystalPassive(16) 全树无生产位
                                    //   （孤儿型,L5 同清单）不接

  // ================= 2026-08-31 L5 长尾批追加（值域=Terrarria1458 ParticleOrchestraType.cs 序列直译,
  //             生成式对齐验证见 tests/orchestra-types-l6.test.ts；叶绿两型的消费派发归
  //             叶绿 SetBonus 代理域本批不复派发,fx/orchestraFx 备纯函数对拍面） =================
  Keybrand = 0,             // 锁匙刃充能斩（NPC.KeyBrandStrike NPC.cs:82005 clientOnly:false;
                            //   Game 近战循环 671 支接线;:35153 滑行拖星支登记未接）
  BlackLightningHit = 4,    // 黑雷爆（WhipTagEffect_DarkHarvest.cs:24 clientOnly:false;WhipTag 接线）
  BlackLightningSmall = 6,  // 黑雷拖带（NPC.cs:92297/P.cs:48715 clientOnly:true 本地直驱）
  StardustPunch = 7,        // 星尘拳紫罗兰光点（P.cs:14315 type1039/:14331 type623 clientOnly:false;
                            //   消费+FX 在位,随从弹侧 anchor 登记缺）
  PrincessWeapon = 8,       // 公主法杖挥尾品红焰（Player.cs:51790/P.cs:43546-67 全 clientOnly:true 本地直驱）
  PaladinsHammer = 9,       // ★vanilla 孤儿：1458 全仓无调用点（仅 Spawn_ 分派臂）;占位注册
  NightsEdge = 10,          // 永夜刃挥弧紫尘（Projectile.Damage case972 :13007;SwingArc/NightsEdgeFly 锚）
  SilverBulletSparkle = 11, // 银箭白炽拖星（P.cs:77659 弹981 Kill 贴块支;clientOnly:true 直驱）
  TrueNightsEdge = 12,      // 真永夜刃挥弧绿尘（case973 :13010;TrueNightsEdgeSlash 锚）
  Excalibur = 13,           // 圣剑四臂金尘十字（case982 :13018;SwingArc 锚）
  TrueExcalibur = 14,       // 真断钢剑红金双带（case983 :13021 + 剑鞭 WhipTagEffect_SwordWhip.cs:22;
                            //   SwingArc/WhipTag 双锚）
  TerraBlade = 15,          // 泰拉刃绿三带击斩（case984|985 :13015;985 光束 Arrow aiStyle191 域）
  BestReforge = 18,         // 顶级词缀重铸 Research_Spark 八粒上旋（Main.cs:42645 top-tier 支,
                            //   clientOnly:true;reforge UI 完成拍接线）
  GasTrap = 23,             // 毒气陷阱起爆（P.cs:33160 弹1007首帧 Broadcast 面;弹在场性登记）
  ItemTransfer = 24,        // 快堆入箱飞行件（Chest.VisualizeChestTransfer :315 BroadcastOrRequest;
                            //   QuickStackToNearbyChests 包装位接线）
  ShimmerArrow = 25,        // 微光箭十字虹彩（P.cs:77676 弹1006 Kill 贴块支 clientOnly:true 直驱）
  TownSlimeTransform = 26,  // 镇史莱姆命名变身三味（NPC.cs:19186/:19210/:80339 Broadcast;
                            //   uniqueInfo 0书呆/1铜/2长）
  ShimmerBlock = 28,        // 微光转化格上飘星（Player.cs:24002 等×4 全 clientOnly:true 本地直驱）
  PooFly = 31,              // 便便史莱姆飞虫环境粒（NPC.cs:61457 ai1==5395 clientOnly:true 直驱）
  BlueLightningSmall = 37,  // 蓝/红小雷共体（NPC.cs:92272-97/PlayerDrawSet:1224 clientOnly:true）
  UFOLaser = 39,            // UFO 激光行进尘（P.cs:71850 区弹433 AI_001 BroadcastOrRequest 面）
  MoonLordWhipHit = 44,     // 月主鞭命中小蓝带+亮绿细带（case1035/:1045 :13025/:13030;WhipProj 锚）
  MoonLordWhipEye = 45,     // 月主鞭 proc 眼球残影（SpawnMoonLordWhipProc P.cs:15005;补鞭面接线）
  PlayerVoiceOverrideSound = 46,  // 受击变声播报（Player.cs:45813 clientOnly:false;
                            //   音效型照 PlaySound 锚直译='hurt';变声字未建模登记）
  RainbowBoulder1 = 47,     // 虹石族四种（RB1 天基寻宝 :20298/RB2·RB3 虹砖 ambience TileDrawing
  RainbowBoulder2 = 48,     //   :6996/:6989/RB4 跃迁 :20349——tile/fairy 面无编排通道登记;
  RainbowBoulder3 = 49,     //   FX+派发在位,消费可达）
  RainbowBoulder4 = 50,
  LakeSparkle = 52,         // 湖面闪光星（P.cs:20638 clientOnly:true;FakeFish 族统一收编迁移）
  NatureFly = 53,           // 森林花虻环境粒（TileDrawing.cs:7017 clientOnly:true;tile-ambient 未建,直驱保留）
  FakeFishJump = 54,        // 假鱼跃出（P.cs:20967 jumping=true;保持 FakeFish.ts 局部池——密度门同池语义）
  MagnetSphereBolt = 56,    // 磁球闪电行进尘（P.cs:71850 区弹255 AI_001 BroadcastOrRequest）
  HeatRay = 57,             // 热射线行进尘（同区弹260）
  RainbowBoulderPetBounce = 60,  // 虹石宠落地尘（P.cs:50709 pet=true clientOnly:true）
  StormLightning = 61,      // 世界落雷主放电——proj1457 bolt 折线原生承担（M级⑥清偿,占位注册不重复生成）
  StormlightningWindup = 62,// 落雷蓄势白闪环（P.cs:40510/:40520/:80294 三武器预备段 clientOnly:true）
  PaladinsShieldHit = 63,   // 圣骑士盾分伤护壁闪（Player.Hurt :38649 clientOnly:true;
                            //   Position=(受击槽,持盾槽);pvp 盾链未建模,消费+FX 在位）
  HeroicisSetSpawnSound = 64, // 英雄套装出土纯音（WorldItem.cs:610 SoundID.RainbowBoulder;
                            //   转化链未移植,消费面在位）
  BlueLightningSmallLong = 65,  // 电鳗鞭链电长距版（WhipTagEffect_ElectricEel.cs:46 clientOnly:false +
                            //   P.cs:14484 浸液导通链;25px 步进复播 LightningSmall;WhipTag/proj1457 锚）
  InScreenDungeonSpawn = 66,  // 双地牢种子层内怪出生纸屑爆（NPC.NewNPC :5267 dualDungeonsSeed 门;
                            //   uniqueInfo=npcType;spawner 域 caller 接线+消费派发在位）
  CattivaHit = 67,          // 捣蛋猫命中六芒簇（SpawnHitVisuals type1093/1112 + P.cs:52194;
                            //   clientOnly 直驱+消费派发在位,pet-hit 侧 anchor 登记）
  SnappingStone = 69,       // 拍击石系三味脉冲环带+音（TryMakingSnappingStoneStrike :14400-14464
                            //   clientOnly:false;SnapStrike.ts 锚接线,rings+dust+音双面同源）
  HarpyCharm = 70,          // 弧线引矢三型同体（ApplyHarpyCharm P.cs:58803 clientOnly:false;
  PhoenixQuiver = 76,       //   Arrow.applyHarpyCharm 锚接线,itemID 6166/6181/6180 分味）
  SeraphNecklace = 78,
  ArcSurge = 71,            // ArcSurge 武器余像+双音（P.cs:71905 弹1122 出手拍 clientOnly:true;
                            //   折线本体 proj1457 自绘——此处补端点闪光与双音）
  FormatC = 72,             // Format:C 法锤暴击金芒（case562 :13003 crit 门 clientOnly:false）
  SnappingStoneMelee = 74,  // 焰爆石脉冲（PyroclasticStone 音）/毁灭臂镗（ArmletOfRuin 音,d172/d211 圆阵）
  SnappingStoneSummon = 75, //   ——两型与 69 同锚 SnapStrike.ts 按 kind 分派
  RedLightningSmall = 77,   // 与 BlueLightningSmall 共体（dispatch :400-404 同 Spawn_LightningSmall）
  SnappingStoneRecharge = 79,     // 充能三连（Player.Update_SnappingStone :28607/:28612/:28617
  PyroclasticStoneRecharge = 80,  //   BroadcastOrRequest;Player.ts 冷却归零拍接线+invoker 锚消费）
  ArmletOfRuinRecharge = 81,
  // ---- 值域补全（终态清单收口——无派发臂的型仅作值域/枚举注册面）----
  FlameWaders = 1,          // 火行者靴行走焰（P.EmitFlameWaderParticles 同链本体已由
                            //   FlameParticles 域承担,编排面不重复接线）
  StellarTune = 2,          // 星律吉他命中星屑（Projectile.cs:72826 clientOnly:true;
                            //   SparkleGuitarProj 域既有近似视觉,不重复接线）
  WallOfFleshGoatMountFlames = 3,  // WoF 山羊坐骑火焰（Mount.cs:3940 clientOnly:true;
                            //   本仓 FlameParticles=唯一移植的编排视觉,L5 前批同口径）
  DeadCellsBarnacleShotFiring = 36,   // 藤壶射击（P.cs:27036 clientOnly:true——挂点父弹
                            //   缺省,producer 无锚登记;FX 纯函数在 fx/orchestraFx 备档）
  ShadowOrbExplosion = 38,  // 暗影球爆炸（Producer=暗影球破坏事件,域内既有近似）
  DeadCellsBeheadedEffect = 40,       // 斩首效应（Player.cs:24503 clientOnly:true,
                            //   死亡细胞种子联动域缺 producer 锚登记）
  DeadCellsBarrelExplosion = 42,      // 木桶爆（≈Arrow 1023 killNow 内联近似,前批口径维持）
  DeadCellsMushroomBoiTargetFound = 43,  // 蘑菇小伙伴锁定图标（mushroomBoiTargetFoundFx 已接 34 型旁路）
  FakeFish = 51,            // 假鱼巡游（保持 FakeFish.ts 局部池——密度门同池语义,评估留局部）
  SporeCloud = 73,        // 叶绿孢子云（Player.cs:26186/NPC.cs:92890 clientOnly:true;本仓孢子云弹 1128 自带视觉——占位注册不重复生成）
}

/** ParticleOrchestraSettings（21B：Vector2 pos + Vector2 move + i32 unique + u8 invoker） */
export interface ParticleSettings {
  posX: number; posY: number;
  moveX: number; moveY: number;
  uniqueInfo: number;
  /** IndexOfPlayerWhoInvokedThis（服务器中继保留原值——本仓消费端不使用） */
  invoker: number;
}

export function writeParticleModule(type: number, s: ParticleSettings): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.Particles);
  w.u8(type & 0xff);
  w.f32(s.posX); w.f32(s.posY);
  w.f32(s.moveX); w.f32(s.moveY);
  w.i32(s.uniqueInfo | 0);
  w.u8(s.invoker & 0xff);
  return w.finish();
}

export function readParticleModule(r: NetReader): { type: number; settings: ParticleSettings } {
  const type = r.u8();
  return {
    type,
    settings: {
      posX: r.f32(), posY: r.f32(),
      moveX: r.f32(), moveY: r.f32(),
      uniqueInfo: r.i32(),
      invoker: r.u8(),
    },
  };
}

// ================= module100 天空氛围（NetAmbienceModule.cs + AmbienceServer.cs） =================
//
// 原版语义：dedServ 上跑 AmbienceServer——600-7200t（10-120s）一次：主条件表
// （全局昼夜/天气/事件）→ FindPlayerThatCanSeeBackgroundAmbience（在场玩家随机
// 取一位,高度门 = 天空带/地狱带）→ 严格列表（次级 Zone 门）为空或 60% 掷 →
// 放宽列表 → 均匀选族 → BroadcastOrLoopback {playerId, Main.rand.Next() 种子,
// type}。客户端 AmbientSky.Spawn(player, type, seed)：FastRandom(seed) 驱动各族
// 构造器随机——全端同 seed 同实体。本仓：room.ts 侧 AmbienceServer 1:1
// （pickAmbientFamily 复用 SkyRenderer 纯函数,Zone 门经 scanScene）,客户端
// 联机时关本地调度只消费广播（原版客户端无本地调度器）。

export function writeAmbienceModule(playerSlot: number, seed: number, type: number): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.Ambience);
  w.u8(playerSlot & 0xff);
  w.i32(seed | 0);
  w.u8(type & 0xff);
  return w.finish();
}

export function readAmbienceModule(r: NetReader): { playerSlot: number; seed: number; type: number } {
  return { playerSlot: r.u8(), seed: r.i32(), type: r.u8() };
}

// ================= module14 per-client 掉落（原版 msg90 InstancedItem 的定向化） =================
//
// 原版语义（CommonCode.DropItemLocalPerClientAndSetNPCMoneyTo0,CommonCode.cs:35-58）:
// 服务器（netMode==2）对 Boss 袋族掉落：单掷通过后对**每个曾交互该 NPC 的玩家**
// NetMessage.SendData(90, i, ...) 定向发一份——客户端 case 90 落
// instanced=true + playerIndexTheItemIsReservedFor=Main.myPlayer（MessageBuffer.cs:1468-1471）
// = 本端私有实例,他人不可见不可拾。1.4.5.6 该规则族的全部注册 = ItemDropRule.
// BossBag/BossBagByCondition（18 条 bossBag）。本仓以 module14 承载同语义：
// 房主/SimHost 上行 {u8 n, n×[u8 targetSlot, str key, u16 stack, f32×4 x/y/vx/vy]},
// 服务器校验（仅权威端可发/key 白名单/maxStack 钳位/NaN 清洗）后按 targetSlot
// **定向**转发（非广播）——同载荷复用为 S→C。旧端未知 moduleId 忽略（先例同上）。

export interface InstancedLootEntry {
  targetSlot: number;
  key: string;
  stack: number;
  x: number; y: number;
  vx: number; vy: number;
}

/** 单帧批量上限（Boss 死亡一帧每交互玩家一份袋——防脏流超帧） */
export const INSTANCED_LOOT_PER_FRAME = 16;

export function writeInstancedLootModule(entries: InstancedLootEntry[]): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.InstancedLoot);
  w.u8(Math.min(entries.length, INSTANCED_LOOT_PER_FRAME));
  for (let i = 0; i < entries.length && i < INSTANCED_LOOT_PER_FRAME; i++) {
    const e = entries[i];
    w.u8(e.targetSlot & 0xff);
    w.str(e.key.slice(0, 64));
    w.u16(Math.max(1, Math.min(0xffff, e.stack)));
    w.f32(e.x); w.f32(e.y);
    w.f32(e.vx); w.f32(e.vy);
  }
  return w.finish();
}

export function readInstancedLootModule(r: NetReader): InstancedLootEntry[] {
  const n = r.u8();
  const out: InstancedLootEntry[] = [];
  for (let i = 0; i < n && i < INSTANCED_LOOT_PER_FRAME; i++) {
    out.push({
      targetSlot: r.u8(),
      key: r.str(),
      stack: r.u16(),
      x: r.f32(), y: r.f32(),
      vx: r.f32(), vy: r.f32(),
    });
  }
  return out;
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
