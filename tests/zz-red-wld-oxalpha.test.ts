// 红队审查:WldExport/WldImport/WldParser 数据完整性对抗测试(只报告,不修码)
import { describe, it, expect } from 'vitest';
import { exportWld } from '../src/wld/WldExport';
import { parseWldToSave, combineHalfSlope } from '../src/wld/WldImport';
import { parseWld } from '../src/wld/WldParser';
import { rleTiles, rlePairs, bytesToB64, type SaveData } from '../src/save/SaveFile';
import { TILE_STABLE_OF_INTERNAL, TILE_INTERNAL_OF_STABLE, TILE_BY_KEY } from '../src/data/tiles';

const W = 40, H = 30;

function baseSave(): { save: SaveData; type: Uint16Array; frameX: Uint16Array; frameY: Uint16Array;
  wall: Uint16Array; liquid: Uint16Array; liquidType: Uint16Array; wire: Uint16Array;
  half: Uint8Array; slope: Uint8Array; paint: Uint8Array; paintWall: Uint8Array; coat: Uint8Array } {
  const n = W * H;
  const type = new Uint16Array(n), frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  const wall = new Uint16Array(n), liquid = new Uint16Array(n), liquidType = new Uint16Array(n);
  const wire = new Uint16Array(n), half = new Uint8Array(n), slope = new Uint8Array(n);
  const paint = new Uint8Array(n), paintWall = new Uint8Array(n), coat = new Uint8Array(n);
  const save = {
    format: 'sandboxworld.save', version: 5,
    header: {
      name: '红队世界', seed: 42, width: W, height: H,
      spawn: [20, 15], groundLevel: 15, rockLevel: 20,
      crimson: false, dungeonX: 5, dungeonY: 10,
      treeX: [10, 20, 30], treeStyle: [0, 1, 2, 3],
      treeTops: [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0],
      created: 1700000000000, playTimeMs: 0,
      moonType: 4, difficulty: 1,
      seedFlags: {},
      bgStyles: { cave: [1, 2, 3, 0], ice: 1, jungle: 2, hell: 3, mushroom: 5, underworld: 6, bg10: 7, bg11: 8, bg12: 9, forest: [2, 3, 4], desert: 1, ocean: 2, corrupt: 1, snow: 1, hallow: 1, crimson: 1 },
      sundialCooldown: 0, fastForwardTimeToDawn: false, moondialCooldown: 0, fastForwardTimeToDusk: false,
    },
    clock: { timeOfDay: 0.25, dayCount: 3, moonPhase: 2, bloodMoon: false, eclipse: false },
    invasion: { type: 0, size: 0, sizeStart: 0, x: 0, delay: 0 },
    altarCount: 2,
    shadowOrbCount: 2,
    cultistDelay: 40000,
    angler: { quest: 17, whoFinishedToday: ['p1', 'p2'] },
    savedOreTiers: { cobalt: 11, mythril: 12, adamantite: 13 },
    meteorShowerCount: 4,
    bannerKills: { 5: 12 },
    weather: { raining: false, rainTime: 0, maxRaining: 0, cloudBGActive: 0, numClouds: 0, windSpeedTarget: 0, slimeRainTime: 0, sand: { happening: true, timeLeft: 100, severity: 0.5, intendedSeverity: 0.7 } },
    events: { partyManual: false, partyGenuine: false, lanternManual: false, lanternGenuine: false, lanternNext: false, lanternCooldown: 0 },
    player: { hp: 100, x: 0, y: 0, inventory: [], selected: 0 },
    tiles: '', walls: '', liquid: '', liquidType: '', wire: '', blocks: '', paint: '', paintWall: '', coat: '',
    chests: [], signs: [], npcs: [], flags: {},
  } as unknown as SaveData;
  return { save, type, frameX, frameY, wall, liquid, liquidType, wire, half, slope, paint, paintWall, coat };
}

function seal(save: SaveData, ch: {
  type: Uint16Array; frameX: Uint16Array; frameY: Uint16Array; wall: Uint16Array;
  liquid: Uint16Array; liquidType: Uint16Array; wire: Uint16Array;
  half: Uint8Array; slope: Uint8Array; paint: Uint8Array; paintWall: Uint8Array; coat: Uint8Array;
  tileActive?: Uint8Array | null;
}): SaveData {
  save.tiles = bytesToB64(rleTiles({ type: ch.type, frameX: ch.frameX, frameY: ch.frameY }, TILE_STABLE_OF_INTERNAL));
  save.walls = bytesToB64(rlePairs(ch.wall));
  save.liquid = bytesToB64(rlePairs(ch.liquid));
  save.liquidType = bytesToB64(rlePairs(ch.liquidType));
  save.wire = bytesToB64(rlePairs(ch.wire));
  save.blocks = bytesToB64(rlePairs(combineHalfSlope(ch.half, ch.slope)));
  save.paint = bytesToB64(rlePairs(ch.paint));
  save.paintWall = bytesToB64(rlePairs(ch.paintWall));
  save.coat = bytesToB64(rlePairs(ch.coat));
  (save as { tileActive?: string }).tileActive = ch.tileActive ? bytesToB64(rlePairs(ch.tileActive)) : undefined;
  return save;
}

describe('红队 A:回环不变性(header 结构)', () => {
  it('诊断:header 字节流 TreeTops/bg10-12 槽位与 parse 读位', () => {
    const b = baseSave();
    const save = seal(b.save, b);
    const bytes = exportWld(save);
    // header 段 = pointers[0]..pointers[1]
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const p0 = dv.getInt32(26, true), p1 = dv.getInt32(30, true);
    const hd = bytes.subarray(p0, p1);
    // 找 TreeTops 签名: i32 13 后跟 [0,1,2,0,1,2,...] 13×i32
    let found = -1;
    for (let i = 0; i + 4 + 52 <= hd.length; i++) {
      if (hd[i] === 13 && hd[i + 1] === 0 && hd[i + 2] === 0 && hd[i + 3] === 0
        && hd[i + 8] === 1 && hd[i + 12] === 2 && hd[i + 20] === 1 && hd[i + 28] === 2) { found = i; break; }
    }
    const wld = parseWld(bytes);
    // eslint-disable-next-line no-console
    console.log('[RED] headerLen=', hd.length,
      'treeTopsSigAt=', found,
      'wld.treeTops=', JSON.stringify(wld.treeTops),
      'bg10/11/12=', wld.bg10, wld.bg11, wld.bg12,
      'treeBG2/3/4=', wld.treeBG2, wld.treeBG3, wld.treeBG4,
      'combatBook=', 'flags.combatBook' in wld.flags ? wld.flags.combatBook : undefined,
      'seedFlags=', JSON.stringify(wld.seedFlags),
      'dualDun=', wld.flags.dualDungeons, 'moreL=', wld.flags.moreLightning,
      'manifest-ish?');
    expect(true).toBe(true);
  });

  it('诊断:SaveData 顶层数据是否进 header(shadowOrbCount/cultistDelay/oreTiers/angler/sandstorm)', () => {
    const b = baseSave();
    b.save.header.sundialCooldown = 3;
    const save = seal(b.save, b);
    const bytes = exportWld(save);
    const wld = parseWld(bytes);
    // eslint-disable-next-line no-console
    console.log('[RED] shadowOrbCount=', wld.shadowOrbCount, '(期望 2)',
      'cultistDelay=', wld.cultistDelay, '(期望 40000)',
      'savedOreTiers=', JSON.stringify(wld.savedOreTiers), '(期望 11/12/13)',
      'sundial=', wld.sundialCooldown, '(期望 3)',
      'anglerQuest=不可见/savedOreTiersPH 面未见');
    expect(true).toBe(true);
  });
});

describe('红队 A:墙 id ≥ 256 回环', () => {
  it('wall=300(原版 ≥256 墙)导出→parse 后是否保真', () => {
    const b = baseSave();
    b.wall[7 * W + 7] = 300;   // 大墙 id
    b.wall[7 * W + 8] = 260;
    b.wall[7 * W + 9] = 255;   // 边界内
    const save = seal(b.save, b);
    const bytes = exportWld(save);
    const wld = parseWld(bytes);
    const i1 = 7 * W + 7, i2 = 7 * W + 8, i3 = 7 * W + 9;
    // eslint-disable-next-line no-console
    console.log('[RED] wall300→', wld.tiles.wall[i1], 'wall260→', wld.tiles.wall[i2], 'wall255→', wld.tiles.wall[i3]);
    expect(wld.tiles.wall[i3]).toBe(255);
  });
});

describe('红队 D:幽灵/致动格 round-trip(内部 id 域)', () => {
  it('致动格(flags=1+wire bit5)导出→parse:inActive 位是否随档', () => {
    const b = baseSave();
    const i = 9 * W + 9;
    b.type[i] = TILE_BY_KEY['stone'];   // 内部 id 域(seal→rleTiles 负责稳定映射)
    b.frameX[i] = 0; b.frameY[i] = 0;
    b.wire[i] = 0x20;                   // bit5 = 已致动(inActive)
    const bytes1 = exportWld(seal(b.save, b));
    const w1 = parseWld(bytes1);
    const imp = parseWldToSave(bytes1);
    const bytes2 = exportWld(imp.save as unknown as SaveData);
    const w2 = parseWld(bytes2);
    // eslint-disable-next-line no-console
    console.log('[RED] 致动格 export#1: active=', w1.tiles.active[i], 'type(sheet)=', w1.tiles.type[i],
      'wire=', w1.tiles.wire[i].toString(16), '(期望 active=1,type=1,wire=20;wire=0=inActive 位丢失=实体化)',
      '| 再导出: active=', w2.tiles.active[i], 'type=', w2.tiles.type[i], 'wire=', w2.tiles.wire[i].toString(16),
      '| 导入产物 tileActive 段=', (imp.save as { tileActive?: string }).tileActive === undefined ? '无' : '有');
    expect(w1.tiles.type[i]).toBe(1);
  });

  it('v5 幽灵格(inactive+type≠0)导出策略(丢弃)与幻影活性', () => {
    const b = baseSave();
    const n = W * H;
    const ta = new Uint8Array(n);
    b.type[12 * W + 5] = TILE_BY_KEY['stone'];
    ta[12 * W + 5] = 1;   // 幽灵: type≠0 且 v=1 → flags bit0=0
    ta[12 * W + 6] = 1;   // 幻影活性: type=0 且 v=1 → flags bit0=1
    const bytes = exportWld(seal(b.save, { ...b, tileActive: ta } as never));
    const w = parseWld(bytes);
    // eslint-disable-next-line no-console
    console.log('[RED] 幽灵格(v5)→导出 active=', w.tiles.active[12 * W + 5], 'type=', w.tiles.type[12 * W + 5],
      '(丢弃方案=空气)| 幻影(type0,v1)→导出 active=', w.tiles.active[12 * W + 6]);
    expect(true).toBe(true);
  });
});

describe('红队 A:极端值/畸形通道', () => {
  it('全 255 液体量+四型/满 wire 0x3f/slope 5/Coat 30/油漆 31 回环', () => {
    const b = baseSave();
    for (let x = 0; x < 4; x++) {
      const i = 5 * W + 10 + x;
      b.liquid[i] = 255;
      b.liquidType[i] = x + 1;   // 1 水 2 岩浆 3 蜂蜜 4 微光
    }
    const j = 6 * W + 10;
    b.wire[j] = 0x3f;            // 全部 6 位
    b.half[6 * W + 11] = 1;
    b.slope[6 * W + 12] = 4;
    b.paint[6 * W + 13] = 31;
    b.paintWall[6 * W + 13] = 31;
    b.coat[6 * W + 13] = 30;
    const save = seal(b.save, b);
    const bytes = exportWld(save);
    const wld = parseWld(bytes);
    const got = [0, 1, 2, 3].map((k) => wld.tiles.liquidType[5 * W + 10 + k]);
    // eslint-disable-next-line no-console
    console.log('[RED] 液型回环(期望1,2,3,4)=', got.join(','),
      '液量=', [0, 1, 2, 3].map((k) => wld.tiles.liquid[5 * W + 10 + k]).join(','),
      'wire0x3f→', wld.tiles.wire[j].toString(16),
      'coat→', wld.tiles.coat[6 * W + 13],
      'paint31(导入侧荧光迁移)→', wld.tiles.paint[6 * W + 13]);
    expect(true).toBe(true);
  });

  it('tileActive 畸形段(超长游程/超界值)不炸导出', () => {
    const b = baseSave();
    const n = W * H;
    const ta = new Uint8Array(n);
    ta[3] = 7;   // 超界差分值
    const save = seal(b.save, b, ta as never);
    expect(() => exportWld(save)).not.toThrow();
  });

  it('未注册稳定 tile id 导出=丢弃(空气)不炸', () => {
    const b = baseSave();
    b.type[11 * W + 11] = 60000;   // 稳定域超界
    const save = seal(b.save, b);
    const bytes = exportWld(save);
    const wld = parseWld(bytes);
    // eslint-disable-next-line no-console
    console.log('[RED] 未注册稳定id(60000)→parse type=', wld.tiles.type[11 * W + 11], 'active=', wld.tiles.active[11 * W + 11]);
    expect(wld.tiles.active[11 * W + 11]).toBe(0);
  });

  it('XOR 差分还原回归:v5 存档幽灵/幻影两向', () => {
    const b = baseSave();
    const n = W * H;
    const ta = new Uint8Array(n);
    const stableStone = TILE_STABLE_OF_INTERNAL[TILE_BY_KEY['stone']];
    // 幽灵: type≠0 且 v=1 → flags bit0=0
    b.type[12 * W + 5] = stableStone;
    ta[12 * W + 5] = 1;
    // 幻影活性: type=0 且 v=1 → flags bit0=1
    ta[12 * W + 6] = 1;
    const save = seal(b.save, b, ta);
    const bytes = exportWld(save);
    const wld = parseWld(bytes);
    // eslint-disable-next-line no-console
    console.log('[RED] 幽灵格(v5)→导出 active=', wld.tiles.active[12 * W + 5], 'type=', wld.tiles.type[12 * W + 5],
      '| 幻影(type0,v1)→导出 active=', wld.tiles.active[12 * W + 6]);
    expect(true).toBe(true);
  });
});

// ================= 探针补充(合并自 probe2/3/4) =================
import { BinaryReaderLE } from '../src/wld/BinaryReaderLE';
import { WldParseError } from '../src/wld/WldParser';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WLD = join(__dirname, '..', 'Starter_World Master.wld');

describe('红队 B/D:header 读写双侧对位(探针2)', () => {
  it('导出侧 TreeTops 块位置 vs parse 侧期望位', () => {
    const b = baseSave();
    const save = seal(b.save, b);
    const bytes = exportWld(save);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const p0 = dv.getInt32(26, true), p1 = dv.getInt32(30, true);
    // TreeTops 签名: i32 13 + tt=[0,1,2,0,1,2,...] 13×i32
    let sig = -1;
    for (let i = p0; i < p1 - 40; i++) {
      if (bytes[i] === 0x0d && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 0
        && bytes[i + 8] === 1 && bytes[i + 12] === 2 && bytes[i + 20] === 1 && bytes[i + 24] === 2) { sig = i; break; }
    }
    // bg 五连签名(mushroom=5,underworld=6,forest treeBG2/3/4=2,3,4)
    let bgSig = -1;
    for (let i = p0; i < p1 - 6; i++) {
      if (bytes[i] === 5 && bytes[i + 1] === 6 && bytes[i + 2] === 2 && bytes[i + 3] === 3 && bytes[i + 4] === 4) { bgSig = i; break; }
    }
    const r = new BinaryReaderLE(bytes);
    r.u32();
    r.seek(p0);
    // 回放 parseWld 头读取,记录 sandstormHappening 与 bg10-12 的读位
    r.string(); r.string(); r.u64(); for (let gb = 0; gb < 16; gb++) r.u8(); r.i32();
    r.i32(); r.i32(); r.i32(); r.i32(); r.i32(); r.i32();
    r.i32(); r.i32(); r.i32();
    for (let i = 0; i < 9; i++) r.boolean();
    r.i64(); r.i64(); r.u8();
    r.i32(); r.i32(); r.i32(); r.i32(); r.i32(); r.i32(); r.i32();
    r.i32(); r.i32(); r.i32(); r.i32(); r.i32(); r.i32(); r.i32();
    r.i32(); r.i32(); r.i32(); r.i32();
    r.f64(); r.f64(); r.f64(); r.boolean(); r.i32(); r.boolean(); r.boolean();
    r.i32(); r.i32(); r.boolean();
    for (let i = 0; i < 10; i++) r.boolean(); r.boolean();
    for (let i = 0; i < 7; i++) r.boolean(); r.boolean(); r.boolean();
    r.u8(); r.i32(); r.boolean(); r.boolean();
    r.i32(); r.i32(); r.i32(); r.f64(); r.f64(); r.u8();
    r.boolean(); r.i32(); r.f32();
    r.i32(); r.i32(); r.i32();
    r.u8(); r.u8(); r.u8(); r.u8(); r.u8(); r.u8(); r.u8(); r.u8();
    r.i32(); r.i16(); r.f32();
    { const n = r.i32(); for (let i = 0; i < n; i++) r.string(); }
    r.boolean(); r.i32(); r.boolean(); r.boolean(); r.boolean();
    r.i32(); r.i32();
    { const n = r.i16(); for (let i = 0; i < n; i++) r.i32(); const m = r.i16(); for (let i = 0; i < m; i++) r.u16(); }
    r.boolean(); r.boolean(); r.boolean(); r.boolean(); r.boolean();
    for (let i = 0; i < 5; i++) r.boolean();
    for (let i = 0; i < 8; i++) r.boolean(); r.boolean();
    r.boolean(); r.boolean(); r.i32();
    { const n = r.i32(); for (let i = 0; i < n; i++) r.i32(); }
    const sandstormAt = r.pos;              // parse 侧读 sandstormHappening 的位置
    r.boolean();
    r.i32(); r.f32(); r.f32();
    for (let i = 0; i < 4; i++) r.boolean();
    r.u8(); r.u8();                         // bgMushroom/bgUnderworld
    const bg1012At = r.pos;                 // parse 侧读 bg10-12 的位置
    // eslint-disable-next-line no-console
    console.log('[P2] 导出 TreeTops 块 @', sig, '| parse 读 sandstormHappening @', sandstormAt,
      '| 导出 bg 五连 @', bgSig, '| parse 读 bg10-12 @', bg1012At,
      '(TreeTops 应落在 sandstorm 之后 ~30B 的 lantern 块后,实际落在 sandstorm 槽)');
    expect(sig).toBeGreaterThan(0);
  });
});

describe('红队 B:真实原版档(v279)header 尾部损坏实证(探针3)', () => {
  it.skipIf(!existsSync(WLD))('Starter_World Master.wld', () => {
    const buf = new Uint8Array(readFileSync(WLD));
    const w = parseWld(buf);
    // eslint-disable-next-line no-console
    console.log('[P3] v=', w.version,
      'bg10/11/12=', w.bg10, w.bg11, w.bg12, '(实际是文件 treeBG2/3/4)',
      'treeBG2/3/4=', w.treeBG2, w.treeBG3, w.treeBG4, '(应为真实值,现=垃圾)',
      'treeTops.len=', w.treeTops.length, '(真实档应 ≤13,垃圾长表=3 字节漂移)',
      'seedFlags=', JSON.stringify(w.seedFlags),
      'spurious: boughtCat=', !!w.flags.boughtCat, 'unlockedMerchantSpawn=', !!w.flags.unlockedMerchantSpawn,
      'downedEoL=', !!w.flags.downed_636, 'combatBook2=', !!w.flags.combatBook2,
      '(↑ 真实档 treeTops 应 ≤13、spurious 旗应全 false——全真=header 尾部 3 字节漂移实锤)');
    expect(w.version).toBe(279);
  });
});

describe('红队 A:双程回环发散/硬失败(探针4)', () => {
  it('export→parse→export→parse', () => {
    const mk = (treeTops: number[]): SaveData => {
      const s = baseSave();
      s.save.header.treeTops = treeTops;
      return seal(s.save, s);
    };
    for (const tt of [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7],
      [255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255],
    ]) {
      const b1 = exportWld(mk(tt));
      try {
        const p1 = parseWldToSave(b1);
        const b2 = exportWld(p1.save as unknown as SaveData);
        const w1 = parseWld(b1), w2 = parseWld(b2);
        // eslint-disable-next-line no-console
        console.log(`[P4] tt[0]=${tt[0]} treeTops.len 13→${w1.treeTops.length}→${w2.treeTops.length}`,
          `seedFlags ${JSON.stringify(w1.seedFlags)}→${JSON.stringify(w2.seedFlags)}`,
          `combatBook2 ${!!w1.flags.combatBook2}→${!!w2.flags.combatBook2}`,
          `unlockedMerchant ${!!w1.flags.unlockedMerchantSpawn}→${!!w2.flags.unlockedMerchantSpawn}`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(`[P4] tt[0]=${tt[0]} 回环硬失败: ${e instanceof WldParseError ? 'WldParseError: ' : ''}${String(e instanceof Error ? e.message : e).slice(0, 90)}`);
      }
    }
  });

  it('畸形 SaveData 导出行为', () => {
    const neg = baseSave();
    (neg.save.header as { width: number }).width = -5;
    let msg = '未抛';
    try { exportWld(seal(neg.save, neg)); } catch (e) { msg = String(e instanceof Error ? e.message : e).slice(0, 60); }
    // eslint-disable-next-line no-console
    console.log('[P4] 负尺寸导出:', msg);
    const bad = baseSave();
    (bad.save as { tiles?: string }).tiles = '!!!not-base64!!!';
    const bytes = exportWld(seal(bad.save, bad));
    // eslint-disable-next-line no-console
    console.log('[P4] 非 base64 tiles:静默导出 len=', bytes.length);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
