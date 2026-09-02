// ★七批备案④-c（2026-09-02）：wld 导入 TileEntities 段还原（471 武器架/395 物品框/
// 470 模特/475 帽架 挂物家具持物）。
//
// 段格式定谳（全部亲读 1.4.5.7 反编译源；真实档逐字节对齐交叉验证）：
//   段位 = pointers[5]（SaveWorld_Version2 段序 WorldFile.cs:1156-1174：
//   FileFormatHeader/WorldHeader/WorldTiles/Chests/Signs/NPCs/TileEntities/
//   PressurePlates/TownManager/Bestiary/CreativePowers）；版本门 = v>=122 走
//   LoadTileEntities（WorldFile.cs:1803-1821；116-121 旧档走 LoadDummies）。
//   SaveTileEntities（WorldFile.cs:3317-3327）：i32 数量 × TileEntity.Write
//   （TileEntity.cs:173-177：type byte → WriteInner :188-197：ID i32（networkSend=
//   false 恒写）+ Position.X/Y i16 + WriteExtraData）；Load 侧 :3330-3345 同序反向读。
//   TEType 序 = TileEntitiesManager.RegisterAll（TileEntitiesManager.cs:26-39）：
//   0=训练假人 1=物品框 2=逻辑传感器 3=模特 4=武器架 5=帽架 6=食物盘 7=晶塔
//   8=展示罐 9=风筝桩 10=小动物桩。ExtraData（写入序反向）：
//     4/1/6/8 → (short vid, byte prefix, short stack)（TEWeaponsRack.cs:54-67 /
//               TEItemFrame.cs:40-53 / TEFoodPlatter.cs:41-46 / TEDeadCellsDisplayJar.cs:40-45）
//     3       → equip 位图(byte) + dye 位图(byte) + [v>=307]pose(byte) +
//               [v>=308]misc 位图(byte：bit0=misc[0] bit1=equip[8] bit2=dyes[8])
//               + equip9 → dyes9 → misc1 三元组×N（TEDisplayDoll.cs:157-215 写 /
//               :217-278 读；v311 特例 :230-235/:271-277 equip[8] 移到 misc 之后）
//     5       → 位图(byte：bit0-1=hat bit2-3=dye) + hat2 → dye2（TEHatRack.cs:56-111）
//     0       → short npc（TETrainingDummy.cs:119-127）
//     2       → byte logicCheck + bool On（TELogicSensor.cs:381-395，文件恒写）
//     7/9/10  → 无 ExtraData（TETeleportationPylon/TEKiteAnchor/TECritterAnchor 无覆写）
//   同位去重 = 后写覆盖前者（WorldFile.cs:3339-3342 Remove+Add）；CheckValidTile
//   淘汰（:3353）——各 TE ValidTile 保证 Position=物件左上锚且锚帧带基成立
//   （471/475：frameY==0 && frameX%54==0，TEWeaponsRack.cs:36/TEHatRack.cs:409；
//   395/470：%36，TEItemFrame.cs:33/TEDisplayDoll.cs:858）→ 导入侧镜像同判据。
//   真实档校验：Starter_World Master.wld（v279）40 TE = Pylon8/ItemFrame21/
//   DisplayDoll10/Dummy1，解析终点与段界逐字节对齐；FTW V2.wld（v274）HatRack1 同。
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWldToSave } from '../src/wld/WldImport';
import { parseWld } from '../src/wld/WldParser';
import { loadSaveData } from '../src/save/SaveFile';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { Game } from '../src/core/Game';

// ---------------- 合成 .wld 固件（tests/wld-weapon-rack-import.test.ts 同款 Writer） ----------------
class Writer {
  out: number[] = [];
  u8(v: number) { this.out.push(v & 0xff); return this; }
  i16(v: number) { this.u8(v); this.u8(v >> 8); return this; }
  i32(v: number) { this.i16(v); this.i16(v >> 16); return this; }
  f32(v: number) {
    const dv = new DataView(new ArrayBuffer(4));
    dv.setFloat32(0, v, true);
    for (let i = 0; i < 4; i++) this.u8(dv.getUint8(i));
    return this;
  }
  f64(v: number) {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, v, true);
    for (let i = 0; i < 8; i++) this.u8(dv.getUint8(i));
    return this;
  }
  bool(v: boolean) { this.u8(v ? 1 : 0); return this; }
  str(s: string) {
    const bytes = new TextEncoder().encode(s);
    let len = bytes.length;
    while (len >= 0x80) { this.u8((len & 0x7f) | 0x80); len >>>= 7; }
    this.u8(len);
    for (const b of bytes) this.u8(b);
    return this;
  }
  bytes(arr: ArrayLike<number>) { for (let i = 0; i < arr.length; i++) this.u8(arr[i]); return this; }
}

const W = 20, H = 12;
const T471 = TILE_BY_KEY['v_471_weapon_rack'];
const T395 = TILE_BY_KEY['v_395_item_frame'];
const T470 = TILE_BY_KEY['v_470_mannequins'];
const T475 = TILE_BY_KEY['v_475_hat_rack'];
/** .wld 固件写的是【原版 sheet id】（TileID.cs：471 武器架2/395 物品框/470 模特/475 帽架），
 *  导入侧经 TILE_MAP/sheetFallback 映射到内部 id（T471…）——两套 id 不可混用 */
const WLD_471 = 471, WLD_395 = 395, WLD_470 = 470, WLD_475 = 475;

type TeEntry =
  | { t: 4; x: number; y: number; vid: number; prefix?: number }
  | { t: 1; x: number; y: number; vid: number; prefix?: number }
  | { t: 3; x: number; y: number; equip?: Array<[vid: number, prefix?: number] | null>; misc?: [vid: number, prefix?: number] | null; dyes?: Array<[vid: number, prefix?: number] | null>; pose?: number }
  | { t: 5; x: number; y: number; hats?: Array<[vid: number, prefix?: number] | null>; dyeSlots?: Array<[vid: number, prefix?: number] | null> }
  | { t: 0 | 2 | 7 | 9 | 10; x: number; y: number }
  | { t: number; x: number; y: number; unknown?: true; noTile?: true };

/** TE 条目序列化（写入序 = WorldFile.cs:3324 TileEntity.Write） */
function writeTe(w: Writer, e: TeEntry, version: number) {
  w.u8(e.t);
  w.i32(1);                       // TE ID（vanilla 载入端 :3338 重排,内容不敏感）
  w.i16(e.x); w.i16(e.y);
  if (e.t === 4 || e.t === 1) {
    const it = e as { vid: number; prefix?: number };
    w.i16(it.vid); w.u8(it.prefix ?? 0); w.i16(1);
  } else if (e.t === 3) {
    const d = e as Extract<TeEntry, { t: 3 }>;
    const equip = d.equip ?? [];
    const dyes = d.dyes ?? [];
    const has = (i: number, arr: Array<[number, number?] | null | undefined>) => !!(arr && arr[i]);
    let bEquip = 0, bDye = 0, b3 = 0;
    for (let i = 0; i < 8; i++) if (has(i, equip)) bEquip |= 1 << i;
    for (let i = 0; i < 8; i++) if (has(i, dyes)) bDye |= 1 << i;
    if (equip[8]) b3 |= 2;
    if (dyes[8]) b3 |= 4;
    if (d.misc) b3 |= 1;
    w.u8(bEquip); w.u8(bDye);
    if (version >= 307) w.u8(d.pose ?? 0);
    if (version >= 308) w.u8(b3);
    // 三元组写出序（TEDisplayDoll.cs:185-214）：equip0..8 → dyes0..8 → misc0；
    // v311 特例（:271-277 读序）：equip[8] 移到 misc 之后
    const tri = (it: [number, number?] | null | undefined) => { if (it) { w.i16(it[0]); w.u8(it[1] ?? 0); w.i16(1); } };
    for (let i = 0; i < 8; i++) tri(equip[i]);
    if (version !== 311) tri(equip[8]);
    for (let i = 0; i < 9; i++) tri(dyes[i]);
    tri(d.misc);
    if (version === 311 && equip[8]) tri(equip[8]);
  } else if (e.t === 5) {
    const h = e as Extract<TeEntry, { t: 5 }>;
    const hats = h.hats ?? [];
    const dyeSlots = h.dyeSlots ?? [];
    let mask = 0;
    for (let i = 0; i < 2; i++) if (has2(hats, i)) mask |= 1 << i;
    for (let i = 0; i < 2; i++) if (has2(dyeSlots, i)) mask |= 1 << (i + 2);
    w.u8(mask);
    for (let i = 0; i < 2; i++) { const it = hats[i]; if (it) { w.i16(it[0]); w.u8(it[1] ?? 0); w.i16(1); } }
    for (let i = 0; i < 2; i++) { const it = dyeSlots[i]; if (it) { w.i16(it[0]); w.u8(it[1] ?? 0); w.i16(1); } }
  } else if (e.t === 0) {
    w.i16(0);                     // npc（TETrainingDummy）
  } else if (e.t === 2) {
    w.u8(0); w.u8(0);             // logicCheck + On
  } else if (e.t === 6 || e.t === 8) {
    const it = e as unknown as { vid: number };
    w.i16(it.vid ?? 0); w.u8(0); w.i16(0);
  }
  // 7/9/10：无 ExtraData
}
function has2(arr: Array<[number, number?] | null | undefined>, i: number) { return !!(arr && arr[i]); }

/** 格内容：type（0=空气）+ 帧对 + 墙 */
type Cell = { t: number; fx?: number; fy?: number; wall?: number };
const grid: Cell[][] = Array.from({ length: W }, () => Array.from({ length: H }, () => ({ t: 0 }) as Cell));

/** 多格家具铺格（帧 = style0 裸带：fx=col*18 / fy=row*18） */
function put(x0: number, y0: number, w2: number, h2: number, t: number) {
  for (let dy = 0; dy < h2; dy++) for (let dx = 0; dx < w2; dx++) {
    grid[x0 + dx][y0 + dy] = { t, fx: dx * 18, fy: dy * 18, wall: 3 };
  }
}

const MAIN_TES: TeEntry[] = [
  { t: 4, x: 2, y: 2, vid: 4, prefix: 6 },          // 武器架（铁阔剑+词缀）——被同位后者覆盖
  { t: 4, x: 2, y: 2, vid: 3509 },                  // 同位重复 TE（WF:3339-3342 后写覆盖）
  { t: 1, x: 6, y: 2, vid: 353 },                   // 物品框（麦酒）
  { t: 3, x: 9, y: 2, equip: [[37]], misc: [4, 3], pose: 2 },   // 模特：头盔+持握展示+pose
  { t: 5, x: 12, y: 2, hats: [[37], [88]], dyeSlots: [[2777]] }, // 帽架：两顶+未收录染料
  { t: 1, x: 2, y: 8, vid: 353, noTile: true },     // 脱节 TE（空气格）→ CheckValidTile 淘汰面
  { t: 7, x: 16, y: 2 },                            // 晶塔 TE（无 ExtraData,导入侧跳过）
  { t: 0, x: 17, y: 2 },                            // 训练假人 TE（short npc,导入侧跳过）
];

/** 主固件（v326=1.4.5.7 版本门全开）或 v311（模特 misc/equip8 特例） */
function buildFixture(tes: TeEntry[], version: number, withTeSection = true): Uint8Array {
  const w = new Writer();
  w.i32(version);
  w.bytes(new TextEncoder().encode('relogic'));
  w.u8(2);                          // fileType=World
  w.i32(1);                         // revision
  w.i32(0); w.i32(0);               // favorites u64
  w.i16(11);
  const ptrPos = w.out.length;
  for (let i = 0; i < 11; i++) w.i32(0);
  w.i16(30);                        // frameImportant 位图 240 位（395/470/471/475 全 >255 → framed）
  w.bytes(new Uint8Array(30));
  const pointers: number[] = [];
  const mark = () => pointers.push(w.out.length);

  // ---- header flags（pointers[0]）——逐字段对表 WldParser.parseWld 的版本门 ----
  mark();
  w.str('TE 导入测试').str('seed123');
  w.i32(0); w.i32(0);               // worldGenVersion u64
  w.bytes(new Array(16).fill(1));   // guid（>=181）
  w.i32(777);                       // worldId
  w.i32(0); w.i32(W * 16); w.i32(0); w.i32(H * 16);   // bounds
  w.i32(H); w.i32(W);               // tilesHigh/tilesWide
  w.i32(0);                         // gameMode（>=209）
  for (let i = 0; i < 9; i++) w.bool(false);   // drunk/good/tenth/constant/bees/remix/noTraps/zenith/skyblock（222-302）
  w.i32(0); w.i32(0);               // creationTime i64（>=141）
  if (version >= 284) { w.i32(0); w.i32(0); }  // lastPlayed i64
  w.u8(0);                          // moonType
  for (let i = 0; i < 3; i++) w.i32(0);       // treeX
  for (let i = 0; i < 4; i++) w.i32(0);       // treeStyle
  for (let i = 0; i < 3; i++) w.i32(0);       // caveBackX
  for (let i = 0; i < 4; i++) w.i32(0);       // caveBackStyle
  w.i32(0); w.i32(0); w.i32(0);     // ice/jungle/hell
  w.i32(2); w.i32(2);               // spawn
  w.f64(20.5); w.f64(40.5); w.f64(13500);
  w.bool(true);                     // dayTime
  w.i32(0);                         // moonPhase
  w.bool(false); w.bool(false);     // bloodMoon/eclipse
  w.i32(0); w.i32(0);               // dungeon
  w.bool(false);                    // isCrimson
  for (let i = 0; i < 10; i++) w.bool(false);  // downedBoss ×10
  w.bool(false);                    // slimeKing（>=118）
  for (let i = 0; i < 7; i++) w.bool(false);   // saved×3 + downed×4
  w.bool(false); w.bool(false);     // shadowOrbSmashed/spawnMeteor
  w.u8(1); w.i32(0);                // shadowOrbCount/altarCount
  w.bool(false);                    // hardMode
  if (version >= 257) w.bool(false);           // afterPartyOfDoom
  w.i32(0); w.i32(0); w.i32(0); w.f64(0);      // invasion
  if (version >= 118) w.f64(0);     // slimeRainTime
  if (version >= 113) w.u8(0);      // sundial
  w.bool(false); w.i32(0); w.f32(0);           // rain
  w.i32(107); w.i32(222); w.i32(-1);           // savedOreTiers
  for (let i = 0; i < 8; i++) w.u8(0);         // bg ×8
  w.i32(0); w.i16(0); w.f32(0);     // clouds/wind
  w.i32(0);                         // angler count
  w.bool(false);                    // savedAngler
  w.i32(0);                         // anglerQuest
  w.bool(false);                    // savedStylist
  if (version >= 129) w.bool(false);           // savedTaxCollector
  if (version >= 201) w.bool(false);           // savedGolfer
  if (version >= 107) w.i32(0);     // invasionSizeStart
  if (version >= 108) w.i32(0);     // cultistDelay
  w.i16(0);                         // banners count
  if (version >= 289) w.i16(0);     // banners m count
  if (version >= 128) w.bool(false);           // fastForwardDawn
  w.bool(false);                    // downedFishron
  if (version >= 131) { w.bool(false); w.bool(false); w.bool(false); }
  else { w.bool(false); w.bool(false); w.bool(false); }
  for (let i = 0; i < 5; i++) w.bool(false);   // 五节日 Boss
  if (version >= 140) for (let i = 0; i < 8; i++) w.bool(false);   // 四塔 downed+active
  w.bool(false);                    // apocalypse
  if (version >= 170) { w.bool(false); w.bool(false); w.i32(0); w.i32(0); }
  if (version >= 174) { w.bool(false); w.i32(0); w.f32(0); w.f32(0); }
  if (version >= 178) for (let i = 0; i < 4; i++) w.bool(false);   // DD2
  if (version > 194) w.u8(0);       // bgMushroom
  if (version >= 215) w.u8(0);      // bgUnderworld
  if (version > 195) { w.u8(0); w.u8(0); w.u8(0); }   // bg10-12
  if (version >= 204) w.bool(false);           // combatBook
  if (version >= 207) { w.i32(0); w.bool(false); w.bool(false); w.bool(false); }   // 灯笼夜
  if (version >= 211) { w.i32(0); }            // treeTops count=0
  if (version >= 212) { w.bool(false); w.bool(false); }   // forceHalloween/XMas ForToday
  if (version >= 216) { w.i32(0); w.i32(0); w.i32(0); w.i32(0); }   // oreTiersPH
  if (version >= 217) for (let i = 0; i < 3; i++) w.bool(false);   // 宠物
  if (version >= 223) { w.bool(false); w.bool(false); }   // EoL/QS
  if (version >= 240) w.bool(false);           // deerclops
  if (version >= 250) w.bool(false);           // slimeBlue
  if (version >= 251) for (let i = 0; i < 8; i++) w.bool(false);   // 城镇解锁 ×8
  if (version >= 259) w.bool(false);           // combatBook2
  if (version >= 260) w.bool(false);           // peddler
  if (version >= 261) for (let i = 0; i < 7; i++) w.bool(false);   // 史莱姆解锁 ×7
  if (version >= 264) { w.bool(false); w.u8(0); }   // dusk+moondial
  if (version >= 287) { w.bool(false); w.bool(false); }   // Forever 对
  if (version >= 288) w.bool(false);           // vampire
  if (version >= 296) w.bool(false);           // infected
  if (version >= 291) { w.i32(0); w.i32(0); }
  if (version >= 297) { w.bool(false); w.u8(0); }   // teamBasedSpawnsSeed+ExtraSpawnPoint
  if (version >= 304) w.bool(false);           // dualDungeons
  if (version >= 323) { w.bool(false); w.bool(false); }   // moreLightning/noLightning
  if (version >= 299 && version < 313) w.i32(0);   // （v299-312 占位 u32）
  if (version >= 299) w.str('');               // manifest

  // ---- tiles 段（pointers[1]，列优先） ----
  mark();
  for (const te of tes) {
    if ('noTile' in te && te.noTile) continue;
    if (te.t === 4) put(te.x, te.y, 3, 3, WLD_471);
    else if (te.t === 1) put(te.x, te.y, 2, 2, WLD_395);
    else if (te.t === 3) put(te.x, te.y, 2, 3, WLD_470);
    else if (te.t === 5) put(te.x, te.y, 3, 4, WLD_475);
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const c = grid[x][y];
      if (c.t === 0) {
        if (c.wall) { w.u8(0x04); w.u8(c.wall); } else w.u8(0x00);
        continue;
      }
      w.u8(0x02 | 0x04 | 0x20);     // active + wall + type 走 u16
      w.i16(c.t);
      w.i16(c.fx ?? 0); w.i16(c.fy ?? 0);
      w.u8(c.wall ?? 0);
    }
  }

  mark(); w.i16(0);                 // chests
  mark(); w.i16(0);                 // signs
  mark();
  w.i32(0);                         // shimmered count（>=268）
  w.bool(false);                    // 无城镇 NPC

  // ---- TileEntities 段（pointers[5]） ----
  mark();
  if (withTeSection) {
    w.i32(tes.length);
    for (const te of tes) writeTe(w, te, version);
  }
  for (let i = 0; i < 5; i++) mark();   // pressurePlates/town/bestiary/creative/footer 占位

  const u8 = new Uint8Array(w.out);
  for (let i = 0; i < 11; i++) {
    const v = pointers[i] ?? 0;
    u8[ptrPos + i * 4] = v & 0xff;
    u8[ptrPos + i * 4 + 1] = (v >> 8) & 0xff;
    u8[ptrPos + i * 4 + 2] = (v >> 16) & 0xff;
    u8[ptrPos + i * 4 + 3] = (v >> 24) & 0xff;
  }
  return u8;
}

// ---------------- 断言 ----------------
const vidKey = (vid: number) => VANILLA_ITEM_KEY_BY_ID[vid]!;
const vidIid = (vid: number) => ITEM_BY_KEY[vidKey(vid)]!;
const defKey = (vid: number) => ITEM_DEFS[vidIid(vid)]!.key;

/** breakTile 运行时 harness（wld-weapon-rack-import.test.ts 同款） */
function breakShell(w: ReturnType<typeof loadSaveData>['world'], drops: Array<{ key: string; n: number }>) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    breakTile: (x: number, y: number, byPlayer?: boolean) => void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.recLog = () => {};
  g.dumpChest = () => {};
  g.entities = { add: () => {}, drops: [], critters: [], enemies: [] };
  g.trackTile = 0;
  g.player = { equipStats: {}, cx: 0, cy: 0 };
  return g as unknown as { breakTile: (x: number, y: number, byPlayer?: boolean) => void };
}

describe('wld 导入：TileEntities 段四类挂物家具还原（v326）', () => {
  const buf = buildFixture(MAIN_TES, 326);
  const wld = parseWld(buf);
  const { save, warnings, report } = parseWldToSave(buf);
  const furn = save.furniture ?? [];
  const rec = (kind: string, x: number, y: number) => furn.find((f) => f.kind === kind && f.x === x && f.y === y);

  it('parser：TE 段落负载 6 条 + 跳过计数 2（晶塔/假人）', () => {
    expect(wld.tileEntities).toHaveLength(6);
    expect(wld.teSkipped).toBe(2);
    expect(wld.tileEntities.filter((t) => t.type === 4)).toHaveLength(2);
  });

  it('武器架 471：同位重复 TE 后写覆盖（WF:3339-3342）', () => {
    const r = rec('weapon_rack', 2, 2)!;
    expect(r).toBeDefined();
    expect(r.slots).toHaveLength(1);
    expect(r.slots[0]).toEqual({ id: vidIid(3509), stack: 1 });
  });

  it('物品框 395：单槽物还原', () => {
    const r = rec('item_frame', 6, 2)!;
    expect(r.slots[0]).toEqual({ id: vidIid(353), stack: 1 });
  });

  it('模特 470：equip[9]→0..8 + misc→9 + dyes→10..18（19 槽持久化形状）', () => {
    const r = rec('display_doll', 9, 2)!;
    expect(r.slots).toHaveLength(19);
    expect(r.slots[0]).toEqual({ id: vidIid(37), stack: 1 });        // equip0 头盔
    expect(r.slots[8]).toBeNull();                                   // equip8 空
    expect(r.slots[9]).toEqual({ id: vidIid(4), stack: 1, prefix: 3 });   // misc 持握
    expect(r.slots[10]).toBeNull();                                  // dyes 空
  });

  it('帽架 475：hat[2]→0..1 + dye[2]→2..3；未收录染料槽置空并计数', () => {
    const r = rec('hat_rack', 12, 2)!;
    expect(r.slots).toHaveLength(4);
    expect(r.slots[0]).toEqual({ id: vidIid(37), stack: 1 });
    expect(r.slots[1]).toEqual({ id: vidIid(88), stack: 1 });
    expect(r.slots[2]).toBeNull();
    const e = report.itemsSkipped.find((s) => s.id === 2777);
    expect(e?.count).toBe(1);
  });

  it('脱节 TE（空气格）→ 淘汰 + warnings 登记（CheckValidTile :3353 镜像）', () => {
    expect(rec('item_frame', 2, 8)).toBeUndefined();
    expect(warnings.join('\n')).toContain('TE 与地形脱节');
  });

  it('读档往返：loadSaveData 记录形状保真', () => {
    const { world } = loadSaveData(save);
    expect(world.furnitureItems).toHaveLength(4);
    const doll = world.furnitureItems.find((f) => f.kind === 'display_doll')!;
    expect(doll.slots[9]!.id).toBe(vidIid(4));
    expect(doll.slots).toHaveLength(19);
  });

  it('破坏链：471 两段式 pop 不变（pop 武器 → 二击碎架+2699）', () => {
    const { world } = loadSaveData(save);
    const drops: Array<{ key: string; n: number }> = [];
    const g = breakShell(world, drops);
    g.breakTile(2, 2, false);
    expect(drops).toEqual([{ key: defKey(3509), n: 1 }]);           // 一击仅弹武器（TE 专属 early-return）
    expect(world.store.get(2, 2)).toBe(T471);                        // 架保留
    g.breakTile(2, 2, false);
    // 架体掉落 = place_v_ 兜底（2699 createTile=471 → placeable,items.ts 阶段5 自动
    // 注册 place_v_<key> 放置物品）——471 走通用 object 路径既有口径,与 334 的
    // def.drop=2699 直掉不同（334 无放置物品,见 multi-tile-drop.test.ts 334 describe）
    expect(drops).toEqual([{ key: defKey(3509), n: 1 }, { key: 'place_v_471_weapon_rack', n: 1 }]);
    expect(world.furnitureItems.find((f) => f.kind === 'weapon_rack')).toBeUndefined();
  });

  it('破坏链：395 物品框 pop → 二击碎框+框本体 3270', () => {
    const { world } = loadSaveData(save);
    const drops: Array<{ key: string; n: number }> = [];
    const g = breakShell(world, drops);
    g.breakTile(6, 2, false);
    expect(drops).toEqual([{ key: defKey(353), n: 1 }]);
    g.breakTile(6, 2, false);
    expect(drops).toEqual([{ key: defKey(353), n: 1 }, { key: vidKey(3270), n: 1 }]);
  });
});

describe('wld 导入：TE 段容错', () => {
  it('段不存在（pointers[5]==pointers[6]）→ 静默略过、零影响', () => {
    const buf = buildFixture([], 326, false);
    const wld = parseWld(buf);
    expect(wld.tileEntities).toEqual([]);
    expect(wld.teSkipped).toBe(0);
    expect(parseWldToSave(buf).save.furniture).toBeUndefined();
  });

  it('未知 TEType → 余段放弃 + 计数（流不可重同步;vanilla 会 NRE）', () => {
    const buf = buildFixture([
      { t: 99, x: 2, y: 2, unknown: true },
      { t: 4, x: 2, y: 2, vid: 4 },     // 未知段之后的合法 TE 必须不被消费
    ], 326);
    const wld = parseWld(buf);
    expect(wld.tileEntities).toEqual([]);
    expect(wld.teSkipped).toBe(2);
    expect(parseWldToSave(buf).save.furniture).toBeUndefined();
  });

  it('v279 旧档（Starter_World 同代）：pose/misc 位图缺席,模特仅 equip/dye 位图', () => {
    const buf = buildFixture([{ t: 3, x: 2, y: 2, equip: [[37]] }], 279);
    const { save } = parseWldToSave(buf);
    const doll = (save.furniture ?? []).find((f) => f.kind === 'display_doll')!;
    expect(doll.slots[0]).toEqual({ id: vidIid(37), stack: 1 });
    expect(doll.slots[9]).toBeNull();     // 无 misc 位图 → 恒空
  });

  it('v311 特例：equip[8]（坐骑槽）三元组移到 misc 之后读（TEDisplayDoll.cs:271-277）', () => {
    const buf = buildFixture([{ t: 3, x: 2, y: 2, equip: [null, null, null, null, null, null, null, null, [2430]], misc: [4] }], 311);
    const { save } = parseWldToSave(buf);
    const doll = (save.furniture ?? []).find((f) => f.kind === 'display_doll')!;
    expect(doll.slots[8]).toEqual({ id: vidIid(2430), stack: 1 });   // 坐骑槽
    expect(doll.slots[9]).toEqual({ id: vidIid(4), stack: 1 });      // misc
  });
});

// ---------------- 真实世界回归 ----------------
const REAL_WLD = join(__dirname, '..', 'Starter_World Master.wld');

describe('真实 .wld：TileEntities 段（Starter_World v279）', () => {
  it.skipIf(!existsSync(REAL_WLD))('40 TE 解析对齐段界 + 21 物品框/10 模特物化不炸', () => {
    const buf = new Uint8Array(readFileSync(REAL_WLD));
    const wld = parseWld(buf);
    // 真值（本批扫描定谳）：Pylon8/ItemFrame21/DisplayDoll10/Dummy1
    expect(wld.tileEntities.filter((t) => t.type === 1)).toHaveLength(21);
    expect(wld.tileEntities.filter((t) => t.type === 3)).toHaveLength(10);
    expect(wld.teSkipped).toBe(9);    // Pylon8 + Dummy1
    // 完整导入链路不炸 + 家具记录物化（脱节/未映射按判定淘汰,只锁下限）
    const { save } = parseWldToSave(buf);
    const { world } = loadSaveData(save);
    const frames = world.furnitureItems.filter((f) => f.kind === 'item_frame');
    const dolls = world.furnitureItems.filter((f) => f.kind === 'display_doll');
    expect(frames.length).toBeGreaterThan(0);
    expect(dolls.length).toBeGreaterThan(0);
    // 物化记录的锚点格必是原 tile（ValidTile 判据镜像的自洽性抽查）
    const st = world.store;
    for (const f of world.furnitureItems) {
      const tid = f.kind === 'item_frame' ? T395 : f.kind === 'display_doll' ? T470
        : f.kind === 'weapon_rack' ? T471 : f.kind === 'hat_rack' ? T475 : -1;
      if (tid > 0) expect(st.get(f.x, f.y)).toBe(tid);
    }
  });
});
