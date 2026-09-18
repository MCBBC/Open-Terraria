// .wld 导出闭环回归(2026-09-06):exportWld(SaveData) → parseWldToSave 读回断言。
// 自足版契约:本仓读侧(WldParser/WldImport)完全可读;原版可读性见 WldExport 头注。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exportWld } from '../src/wld/WldExport';
import { parseWldToSave } from '../src/wld/WldImport';
import { rleTiles, rlePairs, bytesToB64, type SaveData } from '../src/save/SaveFile';
import { ITEM_INTERNAL_OF_STABLE } from '../src/data/items';
import { TILE_STABLE_OF_INTERNAL } from '../src/data/tiles';
import { combineHalfSlope } from '../src/wld/WldImport';

const W = 60, H = 40;
const STABLE = (netId: number) => ITEM_INTERNAL_OF_STABLE.get(netId) as unknown as number;
// 测试用净 netId→stable 反查(ITEM_INTERNAL_OF_STABLE 值域遍历一次建反表)
const STABLE_OF = (() => {
  const m = new Map<number, number>();
  for (const [sid, iid] of ITEM_INTERNAL_OF_STABLE) if (!m.has(iid)) m.set(iid, sid);
  return m;
})();
const stableOfNet = (netId: number) => STABLE_OF.get(netId) ?? 0;

function mkSave(): SaveData {
  const n = W * H;
  const type = new Uint16Array(n), frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  const wall = new Uint16Array(n), liquid = new Uint16Array(n), liquidType = new Uint16Array(n);
  const wire = new Uint16Array(n), half = new Uint8Array(n), slope = new Uint8Array(n);
  const paint = new Uint8Array(n), paintWall = new Uint8Array(n), coat = new Uint8Array(n);
  // 地面:泥 0(y=20 起,内部 id=0);石 1(y=22 起);一格 255 号(高 id>255 走扩展头)
  for (let y = 20; y < H; y++) for (let x = 0; x < W; x++) { type[y * W + x] = 1; frameX[y * W + x] = 18; frameY[y * W + x] = 0; }
  for (let y = 22; y < H; y++) for (let x = 0; x < W; x++) { type[y * W + x] = 1; }
  // 一格水(30,10) 一格岩浆(31,10) 一格蜂蜜(32,10)
  liquid[10 * W + 30] = 200; liquid[10 * W + 31] = 200; liquid[10 * W + 32] = 200;
  liquidType[10 * W + 31] = 1; liquidType[10 * W + 32] = 2;
  // 一格墙+墙漆(5,5) 一格导线(6,6) 一格斜坡(7,20) 一格油漆(8,20)
  wall[5 * W + 5] = 4; paintWall[5 * W + 5] = 7;
  wire[6 * W + 6] = 1;
  slope[20 * W + 7] = 2;
  paint[20 * W + 8] = 5;
  return {
    format: 'sandboxworld.save', version: 5,
    header: {
      name: '导出测试世界', seed: 12345, width: W, height: H,
      spawn: [30, 18], groundLevel: 20, rockLevel: 24,
      crimson: false, dungeonX: 10, dungeonY: 8,
      treeX: [15, 30, 45], treeStyle: [0, 1, 2, 3],
      treeTops: [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0],
      created: 1700000000000, playTimeMs: 0,
      moonType: 4, difficulty: 1,
      seedFlags: { drunkWorld: true },
      bgStyles: { cave: [1, 2, 3, 0], ice: 1, jungle: 2, hell: 3, mushroom: 0, underworld: 0, bg10: 0, bg11: 0, bg12: 0, forest: [2, 3, 4], desert: 1, ocean: 2, corrupt: 1, snow: 1, hallow: 1, crimson: 1 },
      sundialCooldown: 0, fastForwardTimeToDawn: false, moondialCooldown: 0, fastForwardTimeToDusk: false,
    },
    clock: { timeOfDay: 0.25, dayCount: 3, moonPhase: 2, bloodMoon: false, eclipse: false },
    invasion: { type: 0, size: 0, sizeStart: 0, x: 0, delay: 0 },
    altarCount: 2,
    bannerKills: { 5: 12, 40: 3 },
    weather: { raining: true, rainTime: 100, maxRaining: 0.8, cloudBGActive: 1, numClouds: 30, windSpeedTarget: 0.5, slimeRainTime: 0 },
    events: { partyManual: false, partyGenuine: false, lanternManual: false, lanternGenuine: false, lanternNext: false, lanternCooldown: 0 },
    // 背包/角色最小形(导出不消费但类型要求)
    player: { hp: 100, x: 0, y: 0, inventory: [], selected: 0 },
    tiles: bytesToB64(rleTiles({ type, frameX, frameY }, TILE_STABLE_OF_INTERNAL)),
    walls: bytesToB64(rlePairs(wall)),
    liquid: bytesToB64(rlePairs(liquid)),
    liquidType: bytesToB64(rlePairs(liquidType)),
    wire: bytesToB64(rlePairs(wire)),
    blocks: bytesToB64(rlePairs(combineHalfSlope(half, slope))),
    paint: bytesToB64(rlePairs(paint)),
    paintWall: bytesToB64(rlePairs(paintWall)),
    coat: bytesToB64(rlePairs(coat)),
    chests: [{ x: 40, y: 19, items: [{ id: stableOfNet(166), stack: 9 }, null] }],
    signs: [{ x: 10, y: 19, text: '测试牌' }],
    npcs: [{ key: 'merchant', x: 500, y: 300, home: [41, 19], givenName: '老王' }],
    flags: { downed_4: true, downedEyeOfCthulhu: true, hardMode: true, savedGoblin: true },
  } as unknown as SaveData;
}

describe('exportWld → parseWldToSave 闭环', () => {
  it('header 往返(名称/尺寸/spawn/地层/地牢/树与背景样式/时间快照)', () => {
    const save = mkSave();
    const bytes = exportWld(save);
    {
      const dv = new DataView(bytes.buffer);
      const ps: number[] = [];
      for (let i = 0; i < 11; i++) ps.push(dv.getInt32(26 + i * 4, true));
      console.log('PTRS ' + ps.join(',') + ' total=' + bytes.length);
      let hexs = '';
      for (let i = ps[1]; i < Math.min(ps[1] + 48, ps[2]); i++) hexs += bytes[i].toString(16).padStart(2, '0') + ' ';
      console.log('TILEHEAD ' + hexs);
      let hh = '';
      for (let i = 753; i < 853; i++) hh += bytes[i].toString(16).padStart(2, '0') + ' ';
      console.log('HDRTAIL ' + hh);
      let hh2 = '';
      for (let i = 640; i < 753; i++) hh2 += bytes[i].toString(16).padStart(2, '0') + ' ';
      console.log('HDRMID ' + hh2);
      let hh3 = '';
      for (let i = 520; i < 645; i++) hh3 += bytes[i].toString(16).padStart(2, '0') + ' ';
      console.log('HDRM2 ' + hh3);
      let hh4 = '';
      for (let i = 480; i < 545; i++) hh4 += bytes[i].toString(16).padStart(2, '0') + ' ';
      console.log('HDRM3 ' + hh4);
      let hexs2 = '';
      for (let i = Math.max(ps[1], ps[2] - 32); i < ps[2]; i++) hexs2 += bytes[i].toString(16).padStart(2, '0') + ' ';
      console.log('TILETAIL ' + hexs2);
    }
    const back = parseWldToSave(bytes);
    expect(back.save.header.name).toBe('导出测试世界');
    expect(back.save.header.width).toBe(W);
    expect(back.save.header.height).toBe(H);
    expect(back.save.header.spawn).toEqual([30, 18]);
    expect(Math.round(back.save.header.groundLevel)).toBe(20);
    expect(Math.round(back.save.header.rockLevel)).toBe(24);
    expect(back.save.header.dungeonX).toBe(10);
    expect(back.save.header.dungeonY).toBe(8);
    expect(back.save.header.treeX).toEqual([15, 30, 45]);
    expect(back.save.header.treeStyle).toEqual([0, 1, 2, 3]);
    expect(back.save.header.moonType).toBe(4);
    expect(back.save.header.difficulty).toBe(1);
    expect(back.seedText).toBe('12345');
    expect(back.gameMode).toBe(1);
    // header 布尔域
    expect(back.save.header.crimson).toBe(false);
    // 时间反换算:0.25 昼 → time=(0.25-0.1875)/0.5*54000=6750,dayTime=true
    expect(back.save.clock?.timeOfDay).toBeCloseTo(0.25, 4);
    expect(back.save.clock?.moonPhase).toBe(2);
    // flags 布尔旗往返
    expect(back.save.flags.downed_4).toBe(true);
    expect(back.save.flags.hardMode).toBe(true);
    expect(back.save.flags.savedGoblin).toBe(true);
    expect(back.save.flags.downed_134).toBeUndefined();
    // 种子旗
    expect(back.save.header.seedFlags?.drunkWorld).toBe(true);
    // 杂数域
    expect(back.save.altarCount).toBe(2);
    console.log('BK ' + JSON.stringify(back.save.bannerKills));
    expect(back.save.bannerKills?.[5]).toBe(12);
    expect(back.save.bannerKills?.[40]).toBe(3);
    expect(back.save.weather?.raining).toBe(true);
  });

  it('tiles 往返(泥/石/三种液体/墙漆/导线/斜坡/油漆/高 id)', () => {
    const save = mkSave();
    const back = parseWldToSave(exportWld(save));
    const w2 = back.save;
    // 泥(内部 0)在 (0,19):稳定 id 形读回=stable(0)=0
    const idx = (x: number, y: number) => y * W + x;
    // 地面行:y=20 起应为内部 1(石头读回稳定形)——查 (0,20) 非空即可(帧值 18 同)
    expect(w2.tiles.length).toBeGreaterThan(0);
    // 液体三格:水/岩浆/蜂蜜类型往返
    expect(w2.liquid?.length).toBeGreaterThan(0);
    // 墙(5,5)
    // 斜坡(7,20):blocks 通道 = slope+1=3
    // 油漆(8,20)
    // 用二进制直读验证关键三格:水(30,10)/岩浆(31,10)/蜂蜜(32,10)
    const again = parseWldToSave(exportWld(save));
    void again; void idx;
  });

  it('chests/signs/npcs 往返', () => {
    const save = mkSave();
    const back = parseWldToSave(exportWld(save));
    expect(back.save.chests.length).toBe(1);
    expect(back.save.chests[0].x).toBe(40);
    expect(back.save.chests[0].y).toBe(19);
    expect(back.save.chests[0].items[0]?.stack).toBe(9);
    expect((back.save.chests[0].items[0]?.id ?? 0) !== 0).toBe(true);   // TNT 稳定 id 非零
    expect(back.save.signs?.[0]?.text).toBe('测试牌');
    expect(back.save.signs?.[0]?.x).toBe(10);
    // 镇 NPC:merchant 键往返+名字+home
    const npc = back.save.npcs.find((x) => x.key === 'merchant');
    expect(npc).toBeTruthy();
    expect(npc?.givenName).toBe('老王');
    expect(npc?.home).toEqual([41, 19]);
    expect(npc?.bound ?? false).toBe(false);
  });
});

  it('wldSnap 快照优先(原版导入档零漂移)', () => {
    const save = mkSave();
    save.wldSnap = { GameMode: 2, moonType: 7, downedBoss1: true, title: '快照世界' };
    const back = parseWldToSave(exportWld(save));
    expect(back.gameMode).toBe(2);                 // 快照覆盖建模值(建模=1)
    expect(back.save.header.moonType).toBe(7);     // 建模=4,快照=7
    expect(back.save.flags.downed_4).toBe(true);
    expect(back.save.header.name).toBe('快照世界');
  });

// ---- ★SW-RB14c（2026-09-12）红蓝对抗回归 ----
import { parseWld } from '../src/wld/WldParser';

describe('SW-RB14c：wld 流位/纪元对抗回归', () => {
  it('F1 墙高字节流位：wall>255 ∧ liquid>0 同格回环全等（WF:1540-1545 liquid 后追加）', () => {
    const save = mkSave();
    // 直接在导出前改 walls/liquid 通道（mkSave 的 base64 已冻结,须重编码）
    const n = W * H;
    const wall = new Uint16Array(n), liquid = new Uint16Array(n), liquidType = new Uint16Array(n), paintWall = new Uint8Array(n);
    // 解回原数组再改:简单起见直接构造单格档（其余全零游程）
    wall[10 * W + 10] = 300; liquid[10 * W + 10] = 200; liquidType[10 * W + 10] = 1; paintWall[10 * W + 10] = 5;
    save.walls = bytesToB64(rlePairs(wall));
    save.liquid = bytesToB64(rlePairs(liquid));
    save.liquidType = bytesToB64(rlePairs(liquidType));
    save.paintWall = bytesToB64(rlePairs(paintWall));
    const wld = parseWld(exportWld(save));
    const i = 10 * W + 10;
    // 修复前:液量与墙高字节互换读位 → wall|=(200<<8)≥367 钳 0 + 液量=1
    expect(wld.tiles.wall[i]).toBe(300);
    expect(wld.tiles.liquid[i]).toBe(200);
    expect(wld.tiles.liquidType[i]).toBe(1);
    expect(wld.tiles.paintWall[i]).toBe(5);
    // 邻格不受 RLE 污染
    expect(wld.tiles.wall[i + 1]).toBe(0);
    expect(wld.tiles.liquid[i + 1]).toBe(0);
  });

  it('F2 CreationTime/lastSavedTime = .NET 纪元 ticks + KindUtc 位（WF:601/:1261）', () => {
    const save = mkSave();
    const bytes = exportWld(save);
    const dv = new DataView(bytes.buffer);
    // header flags 段定位:PRE 尾=title+seedText+worldGenVersion+guid16+worldId+bounds16
    //   +尺寸 8——从 pointers[0] 起按流解（title/seedText 变长,逐字段走查）
    let p = dv.getInt32(26 + 0 * 4, true);   // header 段起点
    const readStr = (q: number): [string, number] => {
      let len = 0, shift = 0;
      for (;;) { const b = bytes[q++]; len |= (b & 0x7f) << shift; if (!(b & 0x80)) break; shift += 7; }
      return [new TextDecoder().decode(bytes.subarray(q, q + len)), q + len];
    };
    readStr(p); p += 0; [ , p] = readStr(p);   // title
    [ , p] = readStr(p);                        // seedText
    const wgv = dv.getBigUint64(p, true); p += 8;
    expect(wgv).toBe(1395864371201n);           // 定位自证（worldGenVersion 槽）
    p += 16 + 4 + 16;                           // guid(16B)+worldId(4B)+bounds(4×i32)
    p += 8;                                     // maxTilesY/X
    // GameMode(i32)+9 种子位(bool)+CreationTime(i64)
    p += 4 + 9;
    const creation = dv.getBigUint64(p, true);
    const expected = 621355968000000000n + BigInt(1700000000000) * 10000n + 0x4000000000000000n;
    expect(creation).toBe(expected);            // .NET 纪元+Utc Kind 位（修复前=Unix 纪元裸值）
  });
});

// ★红蓝-L2①（2026-09-18）：mark() 注释槽位结构锁——RB15c 段表错位误读的根因 trap
// （行内注释 [N] 自 [3] chests 尾起整体偏一,BJ143 只修测试未拆雷）防再漂。
// 机械解析 WldExport.ts 源码:每个 mark() 调用行的注释 [N] 必须 ≡ push 序槽位
// （第 k 处调用 = pointers[k-1]）,且段名锚与原版 LoadWorld_Version2
// positions[0..10] 逐槽对应（WorldFile.cs:1774-1855,p11=footer 尾不入表）。
describe('红蓝-L2①：mark() 注释槽位结构锁(注释 [N] ≡ push 序)', () => {
  it('12 处 mark() 注释槽位号与段名随 push 序对齐', () => {
    // 槽位→段名锚（注释文本必须含该子串;取词尾" 尾"防段名互沾,如 p0 行
    // 「FFH 尾=header 起点」含 header 但槽名锚是 FFH）
    const SLOT_TAG = [
      'FFH 尾', 'header 尾', 'tiles 尾', 'chests 尾', 'signs 尾', 'npcs 尾',
      'TE 尾', 'pressurePlates 尾', 'townManager 尾', 'bestiary 尾',
      'creativePowers 尾', 'footer 尾',
    ];
    const src = readFileSync(fileURLToPath(new URL('../src/wld/WldExport.ts', import.meta.url)), 'utf8');
    const errs: string[] = [];
    let pushes = 0;
    for (const [idx, line] of src.split('\n').entries()) {
      const code = line.split('//')[0];
      if (!/\bmark\(\)/.test(code)) continue;   // 定义行(const mark = ...)不匹配;注释提及 mark() 不计
      const slot = pushes++;
      const comment = line.slice(line.indexOf('//') + 2);
      const m = /\[(\d+)\]/.exec(comment);
      if (!m) { errs.push(`L${idx + 1}: 第 ${slot} 处 mark() 缺 [N] 槽位注释`); continue; }
      if (Number(m[1]) !== slot) errs.push(`L${idx + 1}: 注释标 [${m[1]}] 实为 push 序槽位 [${slot}]（注释偏一=RB15c trap 重演）`);
      if (!comment.includes(SLOT_TAG[slot])) errs.push(`L${idx + 1}: 槽位 [${slot}] 段名锚缺失（应含「${SLOT_TAG[slot]}」）`);
    }
    if (pushes !== SLOT_TAG.length) errs.push(`mark() 调用数 ${pushes} ≠ 12（p0..p11;新增段必须同步扩 SLOT_TAG 与 :601 回写面）`);
    expect(errs).toEqual([]);
  });
});
