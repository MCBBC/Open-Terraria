// ★IIIIIII18 FILE 车道（F-1）：原版 .wld 导入秘种子还原。
//
// 审计实证（secret-seed-audit-matrix §3 F-1）：WldImport 曾只把 section 选项位回填进
// header.seedFlags，不对 header 种子文本跑 parseSeed——凡带 `|purifythis` 型密码的
// 秘种子档导入本游戏整枚丢失（普通世界行为）。修复 = parseWldToSave 对
// header.seed 过 parseSeedChain（与新创建世界同一解析层）并与权威位并集。
//
// 原版真值锚：
//  - 写侧协议 UIWorldCreation.FinishCreatingWorld cs:1004-1008：
//      SetSeed(join("|", _secretSeedTextsEntered) + "|" + SeedText)
//    ⇒ header 种子串可携带多枚秘种子；单秘种子时输入文本在串中出现两次；
//    SetSeedToRandomWithCurrentEvents（WorldFileData.cs:419-425）另产 "pumpkinseason|" 前缀。
//  - 载入位面 WorldFile.cs LoadWorldFlags：九特殊（1242-1250 读写）+
//    dualDungeons(WF57:1432/2515) + moreLightning/noLightning(:1433-1434/:2516-2517) +
//    forceHalloween/XMasForever(:2471-2472 v287+)。
import { describe, it, expect } from 'vitest';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSave } from '../src/save/SaveFile';
import { serializeSave } from '../src/save/serialize';
import type { SaveMeta, SaveData } from '../src/save/serialize';
import { translateSeed } from '../src/core/rng';

// ================= 合成 .wld 固件（writer 与 tests/wld.test.ts 同构，参数化版本门） =================
class Writer {
  out: number[] = [];
  u8(v: number) { this.out.push(v & 0xff); return this; }
  i16(v: number) { this.u8(v); this.u8((v >> 8) & 0xff); return this; }
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

type NineBits = { drunk?: boolean; ftw?: boolean; anniversary?: boolean; dontStarve?: boolean;
  notTheBees?: boolean; remix?: boolean; noTraps?: boolean; zenith?: boolean; skyblock?: boolean };

function buildFixture(opts: {
  /** .wld 版本号（版本门决定位布局；本测只支持 279 / 326 两档） */
  version?: number;
  seed?: string;
  title?: string;
  /** 九特殊种子选项位（section 位面） */
  options?: NineBits;
  /** v323 尾部 lightning 双位 */
  lightning?: { more?: boolean; less?: boolean };
  /** v287 永久季节节双位（LoadWorldFlags 面） */
  forever?: { halloween?: boolean; xmas?: boolean };
  crimson?: boolean;
} = {}): Uint8Array {
  const VERSION = opts.version ?? 326;
  if (VERSION !== 279 && VERSION !== 326) throw new Error('fixture 仅支持 279/326');
  const W = 8, H = 8;
  const o = opts.options ?? {};
  const w = new Writer();

  w.i32(VERSION);
  w.bytes(new TextEncoder().encode('relogic'));
  w.u8(2);                       // fileType = World
  w.i32(1);                      // revision
  w.i32(0); w.i32(0);            // favorite u64
  w.i16(10);                     // sectionCount
  const ptrPos = w.out.length;
  for (let i = 0; i < 10; i++) w.i32(0);
  // tileFrameImportant 位图：len 30（LSB-first）
  const important = [4, 21];
  w.i16(30);
  const bits = new Uint8Array(4);
  for (const id of important) bits[id >> 3] |= 1 << (id & 7);
  w.bytes(bits);

  const pointers: number[] = [];
  const mark = () => pointers.push(w.out.length);

  // ---- header flags ----
  mark();
  w.str(opts.title ?? '秘种子测试').str(opts.seed ?? '');
  w.i32(0); w.i32(0);            // worldGenVersion u64
  w.bytes(new Array(16).fill(1)); // guid
  w.i32(777);                    // worldId
  w.i32(0); w.i32(W * 16); w.i32(0); w.i32(H * 16); // bounds
  w.i32(H); w.i32(W);            // tilesHigh, tilesWide
  w.i32(0);                      // gameMode (209+)
  if (VERSION >= 222) w.bool(!!o.drunk);
  if (VERSION >= 227) w.bool(!!o.ftw);
  if (VERSION >= 238) w.bool(!!o.anniversary);
  if (VERSION >= 239) w.bool(!!o.dontStarve);
  if (VERSION >= 241) w.bool(!!o.notTheBees);
  if (VERSION >= 249) w.bool(!!o.remix);
  if (VERSION >= 266) w.bool(!!o.noTraps);
  if (VERSION >= 267) w.bool(!!o.zenith);
  if (VERSION >= 302) w.bool(!!o.skyblock);
  w.i32(1000); w.i32(1000);      // creationTime i64
  if (VERSION >= 284) { w.i32(0); w.i32(0); } // lastPlayed i64
  w.u8(0);                       // moonType
  for (let i = 0; i < 3; i++) w.i32(0);   // treeX
  for (let i = 0; i < 4; i++) w.i32(0);   // treeStyle
  for (let i = 0; i < 3; i++) w.i32(0);   // caveBackX
  for (let i = 0; i < 4; i++) w.i32(0);   // caveBackStyle
  w.i32(0); w.i32(0); w.i32(0);           // ice/jungle/hell bg
  w.i32(2); w.i32(2);                     // spawn
  w.f64(20.5); w.f64(40.5); w.f64(13500); // ground/rock/time
  w.bool(true);                           // dayTime
  w.i32(0);                               // moonPhase
  w.bool(false); w.bool(false);           // bloodMoon / eclipse
  w.i32(0); w.i32(0);                     // dungeon
  w.bool(!!opts.crimson);                 // isCrimson
  for (let i = 0; i < 10; i++) w.bool(false); // downed boss 十连
  w.bool(false);                          // slime king (118)
  for (let i = 0; i < 7; i++) w.bool(false);  // saved 七连
  w.bool(false); w.bool(false);           // orb smashed / meteor
  w.u8(0); w.i32(0); w.bool(false);       // orbCount / altarCount / hardMode
  w.bool(false);                          // partyOfDoom (257)
  w.i32(0); w.i32(0); w.i32(0); w.f64(0); // invasion
  w.f64(0);                               // slimeRain (118)
  w.u8(0);                                // sundial (113)
  w.bool(false); w.i32(0); w.f32(0);      // rain
  w.i32(-1); w.i32(-1); w.i32(-1);        // savedOreTiers 三档未砸
  for (let i = 0; i < 8; i++) w.u8(0);    // bg
  w.i32(0); w.i16(0); w.f32(0);           // clouds/wind
  w.i32(0);                               // angler count
  w.bool(false); w.i32(0); w.bool(false); // savedAngler/quest/stylist
  w.bool(false); w.bool(false);           // taxCollector / golfer
  w.i32(0); w.i32(0);                     // invasionSizeStart / cultistDelay
  w.i16(0);                               // banners
  w.bool(false);                          // fastForwardTimeToDawn (128)
  w.bool(false);                          // fishron
  w.bool(false); w.bool(false); w.bool(false); // martians/cultist/moonlord
  for (let i = 0; i < 5; i++) w.bool(false);   // holiday bosses
  for (let i = 0; i < 4; i++) w.bool(false);   // celestial downed
  for (let i = 0; i < 4; i++) w.bool(false);   // celestial active
  w.bool(false);                          // apocalypse
  w.bool(false); w.bool(false); w.i32(0); w.i32(0); // party (170)
  w.bool(false); w.i32(0); w.f32(0); w.f32(0);      // sandstorm (174)
  w.bool(false); w.bool(false); w.bool(false); w.bool(false); // DD2 (178)
  w.u8(0); w.u8(0); w.u8(0); w.u8(0); w.u8(0);               // mushroom/underworld/bg10-12
  w.bool(false);                          // combatBook (204)
  w.i32(0); w.bool(false); w.bool(false); w.bool(false);     // lantern (207)
  w.i32(13); for (let i = 0; i < 13; i++) w.i32(0);          // treetops (211)
  w.bool(false); w.bool(false);          // forceH/X ForToday (212)
  w.i32(0); w.i32(0); w.i32(0); w.i32(0); // oreTiersPH (216)
  w.bool(false); w.bool(false); w.bool(false); // pets (217)
  w.bool(false); w.bool(false);          // empress/queenSlime (223)
  w.bool(false);                         // deerclops (240)
  w.bool(false);                         // slimeBlue (250)
  for (let i = 0; i < 8; i++) w.bool(false);  // unlocks (251)
  w.bool(false);                         // combatBook2 (259)
  w.bool(false);                         // peddler (260)
  for (let i = 0; i < 7; i++) w.bool(false);  // slimeRain colors (261)
  w.bool(false); w.u8(0);                // duskFastForward + moondial (264)
  if (VERSION >= 287) { w.bool(!!opts.forever?.halloween); w.bool(!!opts.forever?.xmas); }
  if (VERSION >= 288) w.bool(false);     // vampireSeed
  if (VERSION >= 296) w.bool(false);     // infectedSeed
  if (VERSION >= 291) { w.i32(0); w.i32(0); }
  if (VERSION >= 297) { w.bool(false); w.u8(0); } // teamBasedSpawnsSeed + ExtraSpawnPointManager
  if (VERSION >= 304) w.bool(false);     // dualDungeons
  if (VERSION >= 323) { w.bool(!!opts.lightning?.more); w.bool(!!opts.lightning?.less); }
  if (VERSION >= 299 && VERSION < 313) w.i32(0);
  if (VERSION >= 299) w.str('');         // manifest

  // ---- tiles 段：8×8 全泥土（每列一条满高游程，RLE 不跨列）----
  mark();
  for (let x = 0; x < W; x++) { w.u8(0x02 | 0x40); w.u8(0); w.u8(H - 1); }

  // ---- chests 段：空 ----
  mark();
  w.i16(0);

  // ---- signs 段：空 ----
  mark();
  w.i16(0);

  // ---- npcs 段：无城镇 NPC ----
  mark();
  w.i32(0);            // shimmered count (268)
  w.bool(false);       // end town loop

  for (let i = 0; i < 5; i++) mark();

  const u8 = new Uint8Array(w.out);
  for (let i = 0; i < 10; i++) {
    const v = pointers[i] ?? 0;
    u8[ptrPos + i * 4] = v & 0xff;
    u8[ptrPos + i * 4 + 1] = (v >> 8) & 0xff;
    u8[ptrPos + i * 4 + 2] = (v >> 16) & 0xff;
    u8[ptrPos + i * 4 + 3] = (v >> 24) & 0xff;
  }
  return u8;
}

describe('IIIII18 F-1：.wld 导入 header.seed 过 parseSeed 链（秘种子还原）', () => {
  it('单密码秘种子（"hocus pocus|hocus pocus|底种"，vanilla 自写重复段形态）导入不丢', () => {
    const buf = buildFixture({ version: 326, seed: 'hocus pocus|hocus pocus|77341' });
    const { save } = parseWldToSave(buf);
    // 数值种子保持 TranslateSeed 全串口径（vanilla SetSeed cs:393-397）
    expect(save.header.seed).toBe(translateSeed('hocus pocus|hocus pocus|77341'));
    // 硬等：派生只有该枚（旧实现此处为 undefined = 整枚丢失）
    expect(save.header.seedFlags).toEqual({ endlessHalloween: true });
  });

  it('多秘种子叠加（| 分段）全量并集还原，且 getfixedboi 权威位不受派生源污染', () => {
    const buf = buildFixture({
      version: 326,
      seed: 'purify this|jingle all the way|more traps please|12345',
      options: { zenith: true },
    });
    const { save } = parseWldToSave(buf);
    expect(save.header.seedFlags).toEqual({
      infectedSeed: true,
      endlessChristmas: true,
      actuallyNoTraps: true,
      everything: true,
    });
  });

  it('getfixedboi 形态：种子串为纯数字底种、内容旗全部由 section 权威位还原（不回退）', () => {
    const buf = buildFixture({ version: 326, seed: '52086', options: { zenith: true } });
    const { save } = parseWldToSave(buf);
    expect(save.header.seedFlags).toEqual({ everything: true });
  });

  it('drunk 数字路由自我恢复：section 位缺失时由种子数值路由补齐', () => {
    const buf = buildFixture({ version: 326, seed: '05162020' });
    const { save } = parseWldToSave(buf);
    expect(save.header.seedFlags).toEqual({ drunkWorld: true });
  });

  it('普通世界零漂移：纯数字种子空旗集保持 undefined，loadSave 后无节日永久位', () => {
    const buf = buildFixture({ version: 326, seed: '99912345' });
    const { save } = parseWldToSave(buf);
    expect(save.header.seedFlags).toBeUndefined();
    const { world } = loadSave(JSON.stringify(save));
    expect(world.seedFlags).toEqual({});
    expect(world.flags.forceHalloweenForever).toBeFalsy();
    expect(world.flags.forceXMasForever).toBeFalsy();
  });

  it('读档回归（随机正常样本 diff 快照）：loadSave 除 seedFlags 外零字段漂移、双载逐字节一致', () => {
    // 确定性伪随机（LCG），避开会话级随机抖动
    let s = 0x2545f491 >>> 0;
    const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
    const pickNine = (): NineBits => ({
      drunk: rand() < 0.5, ftw: rand() < 0.5, anniversary: rand() < 0.5,
      dontStarve: rand() < 0.5, notTheBees: rand() < 0.5, remix: rand() < 0.5,
      noTraps: rand() < 0.5, zenith: rand() < 0.5, skyblock: rand() < 0.5,
    });
    for (let caseN = 0; caseN < 4; caseN++) {
      const options = pickNine();
      const crimson = rand() < 0.5;
      const seed = String(Math.floor(rand() * 2 ** 31));
      const buf = buildFixture({ version: 326, seed, options, crimson });
      const expectFlags: Record<string, boolean> = {};
      if (options.drunk) expectFlags.drunkWorld = true;
      if (options.ftw) expectFlags.getGoodWorld = true;
      if (options.anniversary) expectFlags.tenthAnniversary = true;
      if (options.dontStarve) expectFlags.theConstant = true;
      if (options.notTheBees) expectFlags.notTheBees = true;
      if (options.remix) expectFlags.remix = true;
      if (options.noTraps) expectFlags.noTraps = true;
      if (options.zenith) expectFlags.everything = true;
      if (options.skyblock) expectFlags.skyblock = true;

      const { save } = parseWldToSave(buf);
      // 位面回填与派生源并集后与「位面期望」逐键硬等（随机数字种子不触任何路由）
      const sf = save.header.seedFlags ?? {};
      expect(Object.keys(sf).sort()).toEqual(Object.keys(expectFlags).sort());
      for (const k of Object.keys(expectFlags)) expect(sf[k]).toBe(true);
      const loadOnce = (): SaveData => JSON.parse(JSON.stringify(save));
      const { world } = loadSave(JSON.stringify(loadOnce()));
      expect(Object.keys(world.seedFlags).sort()).toEqual(Object.keys(expectFlags).sort());
      for (const k of Object.keys(expectFlags)) {
        expect((world.seedFlags as Record<string, boolean>)[k]).toBe(true);
      }
      expect(world.crimson).toBe(crimson);
      expect(world.name).toBe('秘种子测试');
      expect(world.spawnX).toBe(2);
      expect(world.difficulty).toBe(0);
      // 存量默认值守卫：随机样本（无 endless 旗语义）不得被桥写进任何节日永久位
      expect(world.flags.forceHalloweenForever).toBeFalsy();
      expect(world.flags.forceXMasForever).toBeFalsy();
      // 二次载入确定性：全图类型层与核心字段零漂移
      const { world: world2 } = loadSave(JSON.stringify(loadOnce()));
      expect(world2.store.type).toEqual(world.store.type);
      expect([world2.w, world2.h, world2.seed, world2.name]).toEqual(
        [world.w, world.h, world.seed, world.name]);
      expect(world2.chests).toEqual(world.chests);
    }
  });
});

describe('IIIII18 任务B：节日双旗 gen→flags 桥的存档往返（自有 .sbw.json 格式）', () => {
  it('桥写出的 forceHalloween/forceXMas 永久位随存档落盘并在读档复现', () => {
    const N = 4 * 4;
    const view = { type: new Uint16Array(N), flags: new Uint8Array(N), frameX: new Uint16Array(N),
      frameY: new Uint16Array(N), wall: new Uint16Array(N), liquid: new Uint8Array(N),
      liquidType: new Uint8Array(N), wire: new Uint8Array(N), half: new Uint8Array(N),
      slope: new Uint8Array(N), paint: new Uint8Array(N), paintWall: new Uint8Array(N) };
    const meta: SaveMeta = { name: 't', seed: translateSeed('hocus pocus'), w: 4, h: 4,
      spawnX: 0, spawnY: 0, groundLevel: 0, rockLevel: 0, timeOfDay: 0.2, dayCount: 1,
      chests: [], difficulty: 0,
      // Game.afterWorldLoad 桥写后的 world.flags 形（仅真值键，无旗世界保持 {}）
      flags: { forceHalloweenForever: true, forceXMasForever: true },
      seedFlags: { endlessHalloween: true, endlessChristmas: true } };
    const json = serializeSave(view, meta, { hp: 10, x: 0, y: 0, inventory: [], selected: 0 }, 0);
    const data = JSON.parse(json) as SaveData;
    expect(data.flags.forceHalloweenForever).toBe(true);
    expect(data.flags.forceXMasForever).toBe(true);
    const { world } = loadSave(json);
    expect(world.flags.forceHalloweenForever).toBe(true);   // checkSeasonal(Game:23877) 读位
    expect(world.flags.forceXMasForever).toBe(true);        // :23874
    expect(world.seedFlags.endlessHalloween).toBe(true);
    expect(world.seedFlags.endlessChristmas).toBe(true);
    // 复读（二次 loadSave）零漂移——桥幂等不重写
    const { world: w2 } = loadSave(json);
    expect(w2.flags).toEqual(world.flags);
  });
});
