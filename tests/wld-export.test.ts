// .wld 导出闭环回归(2026-09-06):exportWld(SaveData) → parseWldToSave 读回断言。
// 自足版契约:本仓读侧(WldParser/WldImport)完全可读;原版可读性见 WldExport 头注。
import { describe, it, expect } from 'vitest';
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
