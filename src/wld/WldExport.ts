// .wld 导出(自足版,2026-09-06):SaveData → 1.4.5.7(325) 世界文件字节。
// 反编译标杆:Terarria1457/Terraria.IO/WorldFile.cs(SaveWorld_Version2 :1156 段序/
// SaveFileFormatHeader :1184/SaveWorldTiles :1438/SaveChests :1613/SaveSigns :1685/
// SaveNPCs :1710/SaveFooter :1759/SaveTileEntities :3317)。
// ★形态:【自足版】——section 指针/瓦片/箱子/标牌/TE 编码与原版 1:1(读侧
//   WldParser 与原版同构,往返闭环可证),但 header flags 段只写【本仓读侧
//   (WldParser :203-460)消费的字段序】,非原版全量 ~230 字段——原版 LoadWorld
//   无法读(会读错位)。达成:导入导出统一 .wld、跨机迁移、json 通道退役;
//   原版互通(全量 flags+DD2Event/TreeTops.Save/Manifest 等)为后续任务。
// 数据源映射:save.header(时间/尺寸/spawn/地层/地牢/树与背景样式/月相快照)/
//   save.flags(WldParser 命名键布尔旗)/save.weather/save.events/save.clock/
//   save.bannerKills/save.invasion;缺省值按读侧缺省语义补(矿层 -1=未锁定、
//   4 档铜铁银金 7/6/9/8=WldImport 注记缺省)。
import type { SaveData } from '../save/serialize';
import { TILE_INTERNAL_OF_STABLE } from '../data/tiles';
import { ITEM_INTERNAL_OF_STABLE } from '../data/items';

import { BinaryWriterLE } from '../save/PlrImport';
import { TOWN_NPC_KEY_BY_ID } from './WldImport';
import { bytesToB64, rlePairs, rleTiles } from '../save/SaveFile';
import vanillaJson from '../../public/sprites/vanilla.json';

const TILE_COUNT = 754;   // TileID.Count(Terarria1457/Terraria.ID/TileID.cs:1945)

// ---- 自有 RLE 解压(varint run-1 + varint v;serialize.ts rlePairs/rleTiles 逆) ----
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function readVarint(b: Uint8Array, pos: { p: number }): number {
  let v = 0, shift = 0;
  for (;;) {
    const byte = b[pos.p++];
    v |= (byte & 0x7f) << shift;
    if (!(byte & 0x80)) return v;
    shift += 7;
  }
}
function unrlePairs(b64: string | undefined, n: number, fallback = 0): Uint8Array {
  const out = new Uint8Array(n);
  if (!b64) { if (fallback) out.fill(fallback); return out; }
  try {
    const b = b64ToBytes(b64);
    const pos = { p: 0 };
    let i = 0;
    while (pos.p < b.length && i < n) {
      const run = readVarint(b, pos) + 1;
      const v = readVarint(b, pos);
      if (v !== 0) out.fill(v, i, Math.min(n, i + run));
      i += run;
    }
  } catch { /* 损坏段按缺省 */ }
  return out;
}
function unrleTiles(b64: string, n: number): { type: Uint16Array; frameX: Uint16Array; frameY: Uint16Array } {
  const type = new Uint16Array(n), frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  try {
    const b = b64ToBytes(b64);
    const pos = { p: 0 };
    let i = 0;
    while (pos.p < b.length && i < n) {
      const run = readVarint(b, pos) + 1;
      const t = readVarint(b, pos);
      let fx = 0, fy = 0;
      if (t !== 0) { fx = readVarint(b, pos); fy = readVarint(b, pos); }
      const end = Math.min(n, i + run);
      if (t !== 0) {
        for (; i < end; i++) { type[i] = t; frameX[i] = fx; frameY[i] = fy; }
      }
      i = end;
    }
  } catch { /* 损坏段=空世界 */ }
  return { type, frameX, frameY };
}

// ---- frameImportant 位图(vanilla.json tiles[x].framed;753 键覆盖全 754 id) ----
const FRAME_IMPORTANT: boolean[] = (() => {
  const out = new Array<boolean>(TILE_COUNT).fill(false);
  const tiles = (vanillaJson as { tiles?: Record<string, { framed?: boolean }> }).tiles ?? {};
  for (const [k, v] of Object.entries(tiles)) {
    const id = Number(k);
    if (id >= 0 && id < TILE_COUNT) out[id] = !!v.framed;
  }
  return out;
})();

// ---- 原版 tile 编码(WF:1438-1511 逐位) ----
function encodeTiles(w: BinaryWriterLE, save: SaveData): void {
  const width = save.header.width, height = save.header.height;
  const n = width * height;
  // ★行主序(i=y*width+x,与 WldImport 读侧 chest anchor=y*w+x 同构)。
  // ★存档 tiles 是稳定 id 形(serializeSave :443 经 TILE_STABLE_OF_INTERNAL),
  //   写原版流前必须反映射为 netId(ITEM_INTERNAL_OF_STABLE;未注册=0 空气)
  const tRaw = unrleTiles(save.tiles, n);
  const t = { type: new Uint16Array(n), frameX: tRaw.frameX, frameY: tRaw.frameY };
  for (let i = 0; i < n; i++) t.type[i] = tRaw.type[i] === 0 ? 0 : (TILE_INTERNAL_OF_STABLE[tRaw.type[i]] ?? 0);
  const walls = unrlePairs(save.walls, n);
  const liquid = unrlePairs(save.liquid, n);
  const liquidType = unrlePairs(save.liquidType, n);
  const wire = unrlePairs(save.wire, n);
  const blocks = unrlePairs(save.blocks, n);   // half?1:(slope+1)
  const paint = unrlePairs(save.paint, n);
  const paintWall = unrlePairs(save.paintWall, n);
  const coat = unrlePairs(save.coat, n);
  // 幽灵位差分(v5 tileActive):act = ((d&1)===1) === (type≠0);缺省=type≠0
  const actDiff = save.tileActive ? unrlePairs(save.tileActive, n) : null;

  const same = (i: number, j: number): boolean => {
    if (t.type[i] !== t.type[j] || t.frameX[i] !== t.frameX[j] || t.frameY[i] !== t.frameY[j]) return false;
    if (walls[i] !== walls[j] || liquid[i] !== liquid[j] || liquidType[i] !== liquidType[j]) return false;
    if (wire[i] !== wire[j] || blocks[i] !== blocks[j]) return false;
    if (paint[i] !== paint[j] || paintWall[i] !== paintWall[j] || coat[i] !== coat[j]) return false;
    if (actDiff && actDiff[i] !== actDiff[j]) return false;
    return true;
  };

  // ★.wld tile 流=列主序(x 外层 y 内层,decodeTiles :688 同构);数组索引=y*width+x
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const i = y * width + x;
      const type = t.type[i];
      const isActive = actDiff ? ((actDiff[i] & 1) === 1) === (type !== 0) : type !== 0;
      const wall = walls[i], liq = liquid[i], liqType = liquidType[i];
      const blk = blocks[i], half = blk === 1, slope = blk >= 2 && blk <= 5 ? blk - 1 : 0;
      const c = coat[i];
      const wl = paintWall[i];
      let b = 0, b2 = 0, b3 = 0, b4 = 0;
      const payload: number[] = [];
      if (isActive && type !== 0) {
        b |= 2;
        payload.push(type & 0xff);
        if (type > 255) { b |= 0x20; payload.push((type >> 8) & 0xff); }
        if (FRAME_IMPORTANT[type]) {
          payload.push(t.frameX[i] & 0xff, (t.frameX[i] >> 8) & 0xff, t.frameY[i] & 0xff, (t.frameY[i] >> 8) & 0xff);
        }
        if (paint[i] !== 0) { b3 |= 8; payload.push(paint[i]); }
      }
      if (wall !== 0) {
        b |= 4;
        payload.push(wall & 0xff);
        if (wl !== 0) { b3 |= 0x10; payload.push(wl); }
      }
      if (liq !== 0) {
        if (liqType === 1) b |= 0x10;
        else if (liqType === 2) b |= 0x18;
        else if (liqType === 3) { b3 |= 0x80; b |= 8; }
        else b |= 8;
        payload.push(liq);
      }
      if (wire[i] & 1) b2 |= 2;
      if (wire[i] & 2) b2 |= 4;
      if (wire[i] & 4) b2 |= 8;
      b2 |= half ? 16 : (slope !== 0 ? (slope + 1) << 4 : 0);
      // 扩展头链(b4→b3→b2 前插;actuator/inActive/wire4 本仓无态,写 0——登记偏差)
      if (b4 !== 0) { b3 |= 1; payload.unshift(b4); }
      if (b3 !== 0) { b2 |= 1; payload.unshift(b3); }
      if (b2 !== 0) { b |= 1; payload.unshift(b2); }
      // RLE 沿列(y)前视同形游程(读侧按 header 位展开,不查压缩白名单)
      let run = 0;
      while (y + 1 + run < height && same(i, (y + 1 + run) * width + x)) run++;
      y += run;
      if (run > 0) {
        payload.push(run & 0xff);
        if (run > 255) { b |= 0x80; payload.push((run >> 8) & 0xff); }
        else b |= 0x40;
      }
      w.byte(b);
      for (const v of payload) w.byte(v);
    }
  }
}

// ---- header section(WldParser :203-460 读序镜像;缺省=读侧缺省语义) ----
function writeHeader(w: BinaryWriterLE, save: SaveData): void {
  const h = save.header;
  const fl = save.flags ?? {};
  const sf = h.seedFlags ?? {};
  const bg = h.bgStyles ?? ({} as NonNullable<typeof h.bgStyles>);
  const wtr = save.weather ?? ({} as NonNullable<SaveData['weather']>);
  const ev = save.events ?? ({} as NonNullable<SaveData['events']>);
  const ck = save.clock ?? ({} as NonNullable<SaveData['clock']>);
  const bo = (v: boolean | undefined) => w.bool(!!v);
  const width = h.width, height = h.height;

  w.str(h.name || 'World');
  w.str(String(h.seed ?? ''));               // SeedText(自足读侧 string 形)
  w.i64(0n);                                  // worldGenVersion(读侧弃)
  for (let i = 0; i < 16; i++) w.byte(0);     // guid
  w.i32(((h.created ?? 0) ^ 0x5555_5555) & 0x7fffffff);   // worldId(随意稳定值)
  w.i32(0).i32(width * 16).i32(0).i32(height * 16);       // bounds(读侧弃)
  w.i32(height);                              // maxTilesY
  w.i32(width);                               // maxTilesX
  // gameMode(≥209 i32)+九种子旗
  w.i32(h.difficulty ?? 0);
  bo(sf.drunkWorld); bo(sf.getGoodWorld); bo(sf.tenthAnniversary); bo(sf.theConstant);
  bo(sf.notTheBees); bo(sf.remix); bo(sf.noTraps); bo(sf.everything); bo(sf.skyblock);
  w.i64(BigInt(h.created ?? 0) * 10000n);     // creationTime ticks
  w.i64(BigInt(h.created ?? 0) * 10000n);     // lastPlayed
  w.byte(h.moonType ?? 0);
  const treeX = h.treeX && h.treeX.length >= 3 ? h.treeX : [width >> 2, width >> 1, (width * 3) >> 2];
  w.i32(treeX[0]).i32(treeX[1]).i32(treeX[2]);
  const ts = h.treeStyle ?? [0, 0, 0, 0];
  w.i32(ts[0] ?? 0).i32(ts[1] ?? 0).i32(ts[2] ?? 0).i32(ts[3] ?? 0);
  for (let i = 0; i < 3; i++) w.i32(treeX[i]);   // caveBackX(读侧弃)
  const cb = bg.cave ?? [0, 0, 0, 0];
  w.i32(cb[0] ?? 0).i32(cb[1] ?? 0).i32(cb[2] ?? 0).i32(cb[3] ?? 0);
  w.i32(bg.ice ?? 0).i32(bg.jungle ?? 0).i32(bg.hell ?? 0);
  w.i32(h.spawn?.[0] ?? width >> 1).i32(h.spawn?.[1] ?? 0);
  w.f64(h.groundLevel ?? 0.3 * height);
  w.f64(h.rockLevel ?? 0.6 * height);
  // time 反换算(WldImport :743-754 正变换逆:昼 0.1875+t/54000×0.5,夜 0.6875+t/32400×0.5)
  const tod = ck.timeOfDay ?? 0.25;
  let time: number, dayTime: boolean;
  if (tod >= 0.1875 && tod < 0.6875) { time = ((tod - 0.1875) / 0.5) * 54000; dayTime = true; }
  else { time = (((tod - 0.6875 + 1) % 1) / 0.5) * 32400; dayTime = false; }
  w.f64(time);
  w.bool(dayTime);
  w.i32(ck.moonPhase ?? 0);
  bo(ck.bloodMoon); bo(ck.eclipse);
  w.i32(h.dungeonX ?? 0).i32(h.dungeonY ?? 0);
  w.bool(!!h.crimson);
  // boss 十连 + saved 七连(键=WldParser 命名约定)
  bo(fl.downed_4); bo(fl.downed_13); bo(fl.downed_35); bo(fl.downed_222);
  bo(fl.downed_134); bo(fl.downed_125); bo(fl.downed_127); bo(fl.downedMechBossAny);
  bo(fl.downed_262); bo(fl.downed_245);
  w.bool(!!fl.downed_50);
  bo(fl.savedGoblin); bo(fl.savedWizard); bo(fl.savedMech);
  bo(fl.downedGoblins); bo(fl.downedClown); bo(fl.downedFrost); bo(fl.downedPirates);
  bo(fl.shadowOrbSmashed); bo(fl.spawnMeteor);
  w.byte(0);                                  // shadowOrbCount(读侧 u8;本仓未持久化,登记偏差)
  w.i32(save.altarCount ?? 0);
  w.bool(!!fl.hardMode);
  w.bool(false);                              // afterPartyOfDoom(≥257)
  const inv = save.invasion;
  // invasion 四元组:delay/size/type i32 + X **f64**(Main.invasionX=double,WF:1313)+slimeRainTime f64(WF:1316)
  w.i32(inv?.delay ?? 0).i32(inv?.size ?? 0).i32(inv?.type ?? 0).f64(inv?.x ?? 0).f64(wtr.slimeRainTime ?? 0);
  w.byte(h.sundialCooldown ?? 0);
  w.bool(!!wtr.raining).i32(wtr.rainTime ?? 0).f32(wtr.maxRaining ?? 0);
  w.i32(-1).i32(-1).i32(-1);                  // SavedOreTiers Cobalt/Mythril/Adamantite(-1=未锁定)
  // bg 字节八连(WF:1325-1331)
  w.byte(bg.forest?.[0] ?? 0); w.byte(bg.corrupt ?? 0); w.byte(0);   // jungleBG(本仓 BgStylesSave 无此键,登记偏差)
  w.byte(bg.snow ?? 0); w.byte(bg.hallow ?? 0); w.byte(bg.crimson ?? 0);
  w.byte(bg.desert ?? 0); w.byte(bg.ocean ?? 0);
  w.i32(wtr.cloudBGActive ?? 0).i16(wtr.numClouds ?? 0).f32(wtr.windSpeedTarget ?? 0);
  w.i32(0);                                   // anglerWhoFinishedToday 空表
  bo(fl.savedAngler);
  w.i32(0);                                   // anglerQuest
  bo(fl.savedStylist);
  w.bool(!!fl.savedTaxCollector);             // ≥129
  w.bool(!!fl.savedGolfer);                   // ≥201
  w.i32(inv?.sizeStart ?? 0);                 // ≥107
  w.i32(86400);                               // cultistDelay(读侧缺省同值)
  // banners(WF:2210 BannerSystem:i16 n+n×i32 killCount[i];[≥289]i16 m+m×u16 claimable)
  const bk = save.bannerKills ?? {};
  const idxs = Object.keys(bk).map(Number).filter((k) => k > 0 && k < 293 && (bk[k] ?? 0) > 0).sort((a, b) => a - b);
  const maxIdx = idxs.length ? idxs[idxs.length - 1]! : 0;
  w.i16(maxIdx + 1);
  for (let i = 0; i <= maxIdx; i++) w.i32(bk[i] ?? 0);
  w.i16(0);                                   // claimable 本仓不建模写空
  w.bool(!!h.fastForwardTimeToDawn);          // ≥128
  bo(fl.downedFishron);
  w.bool(!!fl.downedMartians); w.bool(!!fl.downed_439); w.bool(!!fl.downed_398);   // ≥131
  bo(fl.downedHalloweenKing); bo(fl.downedHalloweenTree);
  bo(fl.downedChristmasIceQueen); bo(fl.downedChristmasSantank); bo(fl.downedChristmasTree);
  // 四塔 downed+active(≥140)
  bo(fl.downedTowerSolar); bo(fl.downedTowerVortex); bo(fl.downedTowerNebula); bo(fl.downedTowerStardust);
  bo(fl.towerActiveSolar); bo(fl.towerActiveVortex); bo(fl.towerActiveNebula); bo(fl.towerActiveStardust);
  bo(fl.lunarApocalypseUp);
  w.bool(false).bool(false).i32(0).i32(0);    // ≥170(party 前身,读侧弃)
  w.bool(false).i32(0).f32(0).f32(0);         // ≥174(sandstorm 前身)
  // DD2 四 bool(≥178)
  bo(fl.dd2DownedT1); bo(fl.dd2DownedT2); bo(fl.dd2DownedT3); bo(fl.dd2DownedAny);
  w.byte(bg.mushroom ?? 0);                   // >194
  w.byte(bg.underworld ?? 0);                 // ≥215
  w.byte(bg.bg10 ?? 0).byte(bg.bg11 ?? 0).byte(bg.bg12 ?? 0);   // >195
  w.byte(bg.forest?.[1] ?? 0).byte(bg.forest?.[2] ?? 0).byte(bg.forest?.[3] ?? 0);   // treeBG2-4(≥204)
  w.bool(!!fl.combatBook);
  w.i32(0).bool(!!ev.lanternManual).bool(!!ev.lanternGenuine).bool(!!ev.lanternNext);   // ≥207 灯笼夜
  // TreeTops(≥211):i32 n+n×i32
  const tt = h.treeTops ?? [];
  w.i32(tt.length);
  for (const v of tt) w.i32(v ?? 0);
  // ≥212 force 2bool
  w.bool(!!fl.forceHalloweenForToday).bool(!!fl.forceXMasForToday);
  // ≥216 oreTiers 铜/铁/银/金(缺省 7/6/9/8=WldImport 注记)
  w.i32(7).i32(6).i32(9).i32(8);
  // ≥217 宠物三连
  w.bool(!!fl.boughtCat).bool(!!fl.boughtDog).bool(!!fl.boughtBunny);
  w.bool(!!fl.downed_636).bool(!!fl.downed_657);   // ≥223
  w.bool(!!fl.downed_668);                          // ≥240
  w.bool(!!fl.unlockedSlimeBlueSpawn);              // ≥250
  w.bool(!!fl.unlockedMerchantSpawn).bool(!!fl.unlockedDemolitionistSpawn);
  w.bool(!!fl.unlockedPartyGirlSpawn).bool(!!fl.unlockedDyeTraderSpawn);
  w.bool(!!fl.unlockedTruffleSpawn).bool(!!fl.unlockedArmsDealerSpawn);
  w.bool(!!fl.unlockedNurseSpawn).bool(!!fl.unlockedPrincessSpawn);   // ≥251
  w.bool(!!fl.combatBook2);                         // ≥259
  w.bool(!!fl.peddler);                             // ≥260
  w.bool(!!fl.unlockedSlimeGreenSpawn).bool(!!fl.unlockedSlimeOldSpawn);
  w.bool(!!fl.unlockedSlimePurpleSpawn).bool(!!fl.unlockedSlimeRainbowSpawn);
  w.bool(!!fl.unlockedSlimeRedSpawn).bool(!!fl.unlockedSlimeYellowSpawn);
  w.bool(!!fl.unlockedSlimeCopperSpawn);            // ≥261
  w.bool(!!h.fastForwardTimeToDusk).byte(h.moondialCooldown ?? 0);   // ≥264
  w.bool(!!fl.forceHalloweenForever).bool(!!fl.forceXMasForever);    // ≥287
  w.bool(!!fl.vampire);                             // ≥288
  w.bool(!!fl.infected);                            // ≥296
  w.i32(0).i32(0);                                  // ≥291
  w.bool(!!fl.teamBasedSpawnsSeed);                 // ≥297
  w.byte(0);                                        // ExtraSpawnPoint 空
  w.bool(!!sf.dualDungeons);                        // ≥304
  w.bool(!!sf.moreLightning).bool(!!sf.noLightning);   // ≥323
  w.u32(0);                                         // ≥299 且 <313
  w.str('');                                        // ≥299 manifest(空=读侧验读即弃)
}
// ---- TE 段(save.furniture 挂物族四类;其余类型本仓不建模写空段亦可) ----
function writeTileEntities(w: BinaryWriterLE, save: SaveData): void {
  const list = save.furniture ?? [];
  w.i32(list.length);
  for (const f of list) {
    // kind → TEType(TileEntitiesManager.RegisterAll 序):1 物品框/3 模特/4 武器架/
    // 5 帽架/6 食物盘/8 展示罐/9 风筝桩/10 小动物桩(均有实体;0 假人/2 传感器不建模)
    const teType = f.kind === 'item_frame' ? 1 : f.kind === 'display_doll' ? 3
      : f.kind === 'weapon_rack' ? 4 : f.kind === 'hat_rack' ? 5
      : f.kind === 'food_platter' ? 6 : f.kind === 'display_jar' ? 8 : 0;
    if (teType === 0 || f.kind === 'kite_anchor' || f.kind === 'critter_anchor') { w.byte(9).i32(0).i16(f.x).i16(f.y); continue; }   // 9/10 桩=无 ExtraData(写 type 9 占位)
    w.byte(teType).i32(0).i16(f.x).i16(f.y);
    const slot = (s: { id: number; stack: number; prefix?: number } | null | undefined) =>
      w.i16(s ? netIdOfStable(s.id) : 0).byte(s?.prefix ?? 0).i16(s ? s.stack ?? 0 : 0);
    if (teType === 1 || teType === 4 || teType === 6 || teType === 8) { slot(f.slots?.[0]); }
    else if (teType === 3) {
      // 模特:位图×2(v307 前)+pose(v307+)+misc 位图(v308+)+三元组×N(v311 特例顺序)
      // ——本仓 SaveData 只存 slots(equip 9+dye 9)+pose,按 v311 读序回写:
      //   位图1(equip 0-7)/位图2(dye 0-8+misc)/pose/misc 位图/equip[8]/三元组按位序
      const eq = Array.from({ length: 9 }, (_, i) => f.slots?.[i] ?? null);
      const dy = Array.from({ length: 9 }, (_, i) => f.slots?.[9 + i] ?? null);
      const bits = (arr: Array<unknown>, n: number) => { let b = 0; for (let i = 0; i < n; i++) if (arr[i]) b |= 1 << i; return b; };
      w.byte(bits(eq, 8)).byte(bits(dy, 9));
      w.byte(0);                                   // pose(读侧 v307+ byte)
      w.byte(0);                                   // misc 位图(v308+)
      w.i16(0).byte(0).i16(0);                     // misc 单槽三元组
      w.i16(netIdOfStable(eq[8]?.id ?? 0)).byte(eq[8]?.prefix ?? 0).i16(eq[8]?.stack ?? 0);   // equip[8](v311 后置)
      for (let i = 0; i < 8; i++) slot(eq[i]);
      for (let i = 0; i < 9; i++) slot(dy[i]);
    } else if (teType === 5) {
      // 帽架:位图(bit0-1=hat,bit2-3=dye)+三元组×N
      const hat = [f.slots?.[0], f.slots?.[1]], dye = [f.slots?.[2], f.slots?.[3]];
      let bits = 0;
      if (hat[0]) bits |= 1; if (hat[1]) bits |= 2;
      if (dye[0]) bits |= 4; if (dye[1]) bits |= 8;
      w.byte(bits);
      const n = (bits & 3) + ((bits >> 2) & 3);
      for (let i = 0; i < 2; i++) if (bits & (1 << i)) slot(hat[i]);
      for (let i = 0; i < 2; i++) if (bits & (4 << i)) slot(dye[i]);
      void n;
    }
  }
}
/** 稳定 id → 原版 netId(物品写回 .wld 用;未注册=0 空气) */
function netIdOfStable(sid: number): number {
  return sid > 0 ? (ITEM_INTERNAL_OF_STABLE.get(sid) ?? 0) : 0;
}

// ---- 主出口 ----
/** SaveData → 自足 .wld 字节(325 格式;本仓 parseWld 可读,原版不保证——见文件头注) */
export function exportWld(save: SaveData): Uint8Array {
  const w = new BinaryWriterLE();
  // FileFormatHeader(WF:1184):325+meta20B+short 11+11×i32 占位+u16 count+位图
  w.i32(325);
  // .wld 头(WF57:1913 读序,与 .plr 的 20B meta 不同!):7B 'relogic'+byte fileType
  // (World=2)+u32 revision+u64 favorites
  for (const ch of 'relogic') w.byte(ch.charCodeAt(0));
  w.byte(2);
  w.u32(1).i64(0n);
  w.i16(11);
  for (let i = 0; i < 11; i++) w.i32(0);            // 指针占位(尾段回写)
  w.u16(TILE_COUNT);
  let bit = 1, acc = 0;   // 原版 b2 初值 1(位掩码)
  for (let i = 0; i < TILE_COUNT; i++) {
    if (FRAME_IMPORTANT[i]) acc |= bit;
    if (bit === 128) { w.byte(acc); acc = 0; bit = 1; }
    else bit <<= 1;
  }
  if (bit !== 1) w.byte(acc);

  // 指针 = 各 section 尾位置(=下一 section 起点;原版 SaveWorld_Version2 :1158-1170:
  // pointers[0]=FileFormatHeader 尾、[1]=header 尾、[2]=tiles 尾……[10]=creativePowers 尾)
  const pointers: number[] = [];
  const mark = (): void => { pointers.push(w.chunks.length); };
  mark();                                                 // [0] FFH 尾=header 起点
  writeHeader(w, save); mark();                     // [1] header 尾
  encodeTiles(w, save); mark();                     // [2] tiles 尾
  // chests(WF:1613):short count+逐箱(x+y+name+maxItems+items(short stack[+type+prefix]))
  const chests = save.chests ?? [];
  w.i16(chests.length);
  for (const c of chests) {
    w.i32(c.x).i32(c.y).str('');
    const items = c.items ?? [];
    w.i32(40);                                      // maxItems(≥294 i32,WF:1633)
    for (let i = 0; i < 40; i++) {
      const it = items[i];
      if (!it || (it.id === 0)) { w.i16(0); continue; }
      const netId = netIdOfStable(it.id);
      if (!netId) { w.i16(0); continue; }
      w.i16(it.stack ?? 1).i32(netId).byte(0);   // chests 元素无 prefix 形
    }
  }
  mark();                                           // [2] chests 尾
  // signs(WF:1685):short count+逐条(text+x+y)
  const signs = save.signs ?? [];
  w.i16(signs.length);
  for (const s of signs) w.str(s.text ?? '').i32(s.x).i32(s.y);
  mark();                                           // [3] signs 尾
  // npcs(WF:1710):shimmered count 0+镇 NPC 循环+false+SavesAndLoads false
  w.i32(0);
  const npcs = save.npcs ?? [];
  for (const n of npcs) {
    // TOWN_NPC_KEY_BY_ID:netId→{key,bound}(WldImport 表);反查取 id
    const netId = Number(Object.entries(TOWN_NPC_KEY_BY_ID).find(([, v]) => v.key === n.key)?.[0] ?? 0);
    if (!netId) continue;                           // 无映射键(旧档残留)跳过
    w.bool(true);                                   // active
    w.i32(netId);                                   // netID
    w.str(n.givenName ?? '');
    w.f32(n.x).f32(n.y);                            // position(SaveData 存像素,WldImport :884)
    w.bool(!n.home);                                // homeless
    w.i32(n.home ? n.home[0] : -1).i32(n.home ? n.home[1] : -1);
    // ≥213 flag 位图:写 0(本仓读侧消费 flag&1→多读 i32;置 1 会错位)
    w.byte(0);
    w.bool(false);                                  // ≥315(读侧 :574 验读即弃)
  }
  w.bool(false);
  w.bool(false);
  mark();                                           // [4] npcs 尾
  writeTileEntities(w, save); mark();               // [5] TE 尾
  w.i32(0); mark();                                 // [6] pressurePlates 尾(空)
  w.i32(0); mark();                                 // [7] townManager 尾(空壳,自足读侧不读)
  w.i32(0); mark();                                 // [8] bestiary 尾(空壳)
  w.byte(0); mark();                                // [9] creativePowers 尾(单 false 空流)
  // footer(WF:1759):true+name+worldId
  w.bool(true).str(save.header.name || 'World').i32(12345);
  mark();                                           // [10] footer 尾
  // SaveHeaderPointers(WF:1208):pos0 写 325,pos+20 后 short 11+11×i32
  const bytes = w.build();
  const dv = new DataView(bytes.buffer);
  dv.setUint32(0, 325, true);
  dv.setUint16(24, 11, true);
  for (let i = 0; i < 11; i++) dv.setInt32(26 + i * 4, pointers[i] ?? pointers[pointers.length - 1], true);
  return bytes;
}
