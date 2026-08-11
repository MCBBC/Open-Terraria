// 器件态机族回归：八音盒 / 喷泉 / 天塔柱（SwitchMB/SwitchFountain/SwitchMonolith，
// WorldGen.cs:50977-51209）+ SceneMetrics 器件态扫描（:471-585）+ BGM 覆盖
// （Main.cs:11002-11405）+ 传送门落点（PortalHelper.cs:218-248）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import {
  deviceTable, switchMB, switchFountain, switchMonolith,
  musicBoxStyleOf, fountainColorOf, monolithTypeOf, bloodMoonMonolithOf,
  MB_STYLE_TO_MUSIC, type DeviceCtx,
} from '../src/world/wiring/devices';
import { scanScene } from '../src/world/SceneMetrics';
import { pickMusic, newMusicState, MUSIC } from '../src/data/Music';
import { placePortal, portalRegistry, clearPortals, portalOutingPoint } from '../src/entities/Portal';
import { TILE_BY_KEY } from '../src/data/tiles';

function makeCtx(): DeviceCtx {
  return {
    dropItem: () => {}, spawnNpc: () => true, mechSpawnOk: () => true, itemSpawnOk: () => true,
    shootProjectile: () => {}, countProjectiles: () => 0,
    doorOpen: () => true, doorClose: () => true, teleportPair: () => {},
    relocateTownNpc: () => true, explode: () => {}, toast: () => {}, sfx: () => {},
    extractinatorPull: () => null, dropItemStack: () => {},
    worldSurface: 100,
  };
}

function freshWiring() {
  const world = new World(80, 80, 7, 'open');
  return { world, w: new Wiring(world.store) };
}

/** 放 2×2 八音盒（tile 139）：style s → frameY = s*36 + 行*18，frameX = 列*18（off 带 <36） */
function placeMusicBox(w: Wiring, ox: number, oy: number, style: number) {
  const t = TILE_BY_KEY['v_139_musicboxes']!;
  for (let cx = 0; cx < 2; cx++) {
    for (let cy = 0; cy < 2; cy++) {
      w.st.setTileSilent(ox + cx, oy + cy, t, cx * 18, style * 36 + cy * 18);
    }
  }
}

/** 放 2×4 喷泉（tile 207）：style s → frameX = s*36 + 列*18 */
function placeFountain(w: Wiring, ox: number, oy: number, style: number) {
  const t = TILE_BY_KEY['v_207_water_fountains']!;
  for (let cx = 0; cx < 2; cx++) {
    for (let cy = 0; cy < 4; cy++) {
      w.st.setTileSilent(ox + cx, oy + cy, t, style * 36 + cx * 18, cy * 18);
    }
  }
}

/** 放 2×3 天塔柱（tile 410 style s / 480 / 509）：off 帧 frameY = 行*18 */
function placeMonolith(w: Wiring, ox: number, oy: number, key: string, style = 0) {
  const t = TILE_BY_KEY[key]!;
  for (let cx = 0; cx < 2; cx++) {
    for (let cy = 0; cy < 3; cy++) {
      w.st.setTileSilent(ox + cx, oy + cy, t, style * 36 + cx * 18, cy * 18);
    }
  }
}

describe('八音盒 SwitchMB（WorldGen.cs:50977-51021）', () => {
  it('2×2 frameX ±36 翻转，任意格命中整块翻转', () => {
    const { w } = freshWiring();
    placeMusicBox(w, 10, 20, 3);
    expect(deviceTable(w, makeCtx(), 139, 11, 21)).toBe(true); // 右下格触发
    for (let cx = 0; cx < 2; cx++) {
      for (let cy = 0; cy < 2; cy++) {
        const i = w.st.idx(10 + cx, 20 + cy);
        expect(w.st.frameX[i]).toBe(36 + cx * 18); // +36 = on 带
      }
    }
    // 再触发一次回到 off
    deviceTable(w, makeCtx(), 139, 10, 20);
    expect(w.st.frameX[w.st.idx(10, 20)]).toBe(0);
  });

  it('开关态读取（SceneMetrics.cs:471-486）：off=-1 / on=style / 100=静音', () => {
    expect(musicBoxStyleOf(0, 0)).toBe(-1);
    expect(musicBoxStyleOf(36, 3 * 36)).toBe(3);
    expect(musicBoxStyleOf(36, 3 * 36 + 18)).toBe(3); // 块内第二行整除不变
    expect(musicBoxStyleOf(36, 100 * 36)).toBe(100);
  });

  it('style→MusicID 全表锚点（Main.cs:11002-11403）', () => {
    expect(MB_STYLE_TO_MUSIC).toHaveLength(100);
    expect(MB_STYLE_TO_MUSIC[0]).toBe(1);    // OverworldDay
    expect(MB_STYLE_TO_MUSIC[3]).toBe(6);    // TitleClassic（乱序 if-chain）
    expect(MB_STYLE_TO_MUSIC[36]).toBe(34);  // LunarPillars
    expect(MB_STYLE_TO_MUSIC[94]).toBe(92);  // Destroyer
    expect(MB_STYLE_TO_MUSIC[99]).toBe(103); // Skeletron
  });
});

describe('BGM 覆盖（Main.cs:11002-11405：DecideOnNewMusic 之后，最高优先级）', () => {
  const base = {
    scene: { townNPCCount: 0 } as never, isDay: true, bossMusic: 5, invasionMusic: 0,
    worldSurface: 200, rockLevel: 400, lavaLine: 900, maxTilesX: 4200,
    centerX: 2100 * 16, centerY: 3000, state: newMusicState(),
    weather: { storm: false, rain: false, windy: false, timeOfDay01: 0.5 },
  };
  it('音乐盒覆盖 Boss 曲；静音 style 100 → 0', () => {
    expect(pickMusic({ ...base, musicBox: 0 })).toBe(1);
    expect(pickMusic({ ...base, musicBox: 100 })).toBe(MUSIC.None);
    expect(pickMusic(base)).toBe(5); // 无盒 → Boss 曲
  });
});

describe('喷泉 SwitchFountain（WorldGen.cs:51171-51209）', () => {
  it('2×4 frameY ±72；水色映射（SceneMetrics.cs:488-523）', () => {
    const { w } = freshWiring();
    placeFountain(w, 30, 20, 4); // style 4 → 水色 2（腐化）
    deviceTable(w, makeCtx(), 207, 31, 23); // 块内右列底行触发
    for (let cx = 0; cx < 2; cx++) {
      for (let cy = 0; cy < 4; cy++) {
        expect(w.st.frameY[w.st.idx(30 + cx, 20 + cy)]).toBe(72 + cy * 18);
      }
    }
    expect(fountainColorOf(4 * 36, 72)).toBe(2);
    expect(fountainColorOf(0, 0)).toBe(-1);   // 关
    expect(fountainColorOf(9 * 36, 72)).toBe(6); // style 9 → 6
  });
});

describe('天塔柱 SwitchMonolith（WorldGen.cs:51023-51169）', () => {
  it('410：frameY ±56；类型 = frameX/36（SceneMetrics.cs:524-530）', () => {
    const { w } = freshWiring();
    placeMonolith(w, 40, 20, 'v_410_lunarmonolith', 2); // 星尘
    deviceTable(w, makeCtx(), 410, 41, 22);
    expect(w.st.frameY[w.st.idx(40, 20)]).toBe(56);
    expect(monolithTypeOf(410, 2 * 36, 56)).toBe(2);
    expect(monolithTypeOf(410, 2 * 36, 0)).toBe(-1); // 关
    // 再触发关闭
    deviceTable(w, makeCtx(), 410, 40, 20);
    expect(w.st.frameY[w.st.idx(40, 20)]).toBe(0);
  });
  it('509 → 月总 4；480 → 血月柱标志（SceneMetrics.cs:533-546）', () => {
    const { w } = freshWiring();
    placeMonolith(w, 50, 20, 'v_509_voidmonolith');
    deviceTable(w, makeCtx(), 509, 50, 21);
    expect(monolithTypeOf(509, 0, 56)).toBe(4);
    placeMonolith(w, 60, 20, 'v_480_bloodmoonmonolith');
    deviceTable(w, makeCtx(), 480, 60, 21);
    expect(bloodMoonMonolithOf(480, 54)).toBe(true);
    expect(bloodMoonMonolithOf(480, 0)).toBe(false);
  });
  it('switchMonolith 直调与 deviceTable 等价（右键链路共用）', () => {
    const { w } = freshWiring();
    placeMonolith(w, 40, 40, 'v_410_lunarmonolith', 1);
    switchMonolith(w, 41, 41);
    expect(w.st.frameY[w.st.idx(40, 40)]).toBe(56);
  });
});

describe('SceneMetrics 器件态扫描（ScanEnums 精简核）', () => {
  it('激活的八音盒/喷泉被扫出；关闭态回 -1', () => {
    const { world, w } = freshWiring();
    placeMusicBox(w, 10, 20, 7);
    deviceTable(w, makeCtx(), 139, 10, 20); // 开
    const f = scanScene(world, 11 * 16, 21 * 16, 0);
    expect(f.musicBoxStyle).toBe(7);
    deviceTable(w, makeCtx(), 139, 10, 20); // 关
    expect(scanScene(world, 11 * 16, 21 * 16, 0).musicBoxStyle).toBe(-1);
  });
  it('partyUp 透传（BirthdayParty.PartyIsUp）', () => {
    const { world } = freshWiring();
    expect(scanScene(world, 400, 400, 0, true).partyUp).toBe(true);
    expect(scanScene(world, 400, 400, 0, false).partyUp).toBe(false);
  });
});

describe('传送门落点（PortalHelper.cs:218-248 + AddPortal :328-353）', () => {
  it('向下弹落在平地顶面：门中心 = 命中格中心上方 8px，门线水平（angle=PI）', () => {
    clearPortals();
    const { world } = freshWiring();
    const st = world.store;
    const dirt = TILE_BY_KEY['dirt']!;
    for (let x = 20; x <= 30; x++) st.setTileSilent(x, 40, dirt);
    // 弹体紧贴地表上一格（FindCollision 只外推 速度+方向×32px，原版同半径）
    const p = placePortal(st, 25 * 16, 39 * 16, 0, 10, 0);
    expect(p).not.toBeNull();
    // 命中格 (25,40)：中心 = (25*16+8, 40*16+8) 沿法线 (0,1) 上偏 8px → (408, 640)
    expect(p!.centerX).toBe(25 * 16 + 8);
    expect(p!.centerY).toBe(40 * 16);
    expect(p!.angle).toBeCloseTo(Math.PI, 6); // atan2(1,0)+PI/2 → 水平门线
    expect(portalRegistry()).toHaveLength(1);
    clearPortals();
  });

  it('同 form 旧门被移除（RemoveMyOldPortal :342-353）；异 form 配对共存', () => {
    clearPortals();
    const { world } = freshWiring();
    const st = world.store;
    const dirt = TILE_BY_KEY['dirt']!;
    for (let x = 20; x <= 30; x++) st.setTileSilent(x, 40, dirt);
    for (let x = 50; x <= 60; x++) st.setTileSilent(x, 60, dirt);
    const a = placePortal(st, 25 * 16, 39 * 16, 0, 10, 0);
    const b = placePortal(st, 55 * 16, 59 * 16, 0, 10, 1);
    expect(a && !a.dead).toBe(true);
    expect(b && !b.dead).toBe(true);
    expect(portalRegistry()).toHaveLength(2);
    // 再落一个 form 0 → 旧橙门移除，蓝门保留
    const c = placePortal(st, 55 * 16, 59 * 16, 0, 10, 0);
    expect(a!.dead).toBe(true);
    expect(portalRegistry().filter((p) => !p.dead)).toHaveLength(2);
    expect(c).not.toBeNull();
    clearPortals();
  });

  it('空中落门失败（无支承返回 null）', () => {
    clearPortals();
    const { world } = freshWiring();
    expect(placePortal(world.store, 40 * 16, 10 * 16, 0, 5, 0)).toBeNull();
    clearPortals();
  });

  it('出口点分桶（GetPortalOutingPoint :372-394）：四面门法线各向', () => {
    // 底部门（edge (0,1) → angle=PI，wrap 到 -PI → default 桶）：出口 = 门位，零法线
    const [x, y, bx, by] = portalOutingPoint(20, 42, 100, 200, Math.PI);
    expect([x, y, bx, by]).toEqual([100, 200, 0, 0]);
    // 顶部门（edge (0,-1) → angle=0）：出口水平居中，法线向下（+Y）
    const [x2, y2, bx2, by2] = portalOutingPoint(20, 42, 100, 200, 0);
    expect([x2, y2, bx2, by2]).toEqual([90, 200, 0, 1]);
    // 右墙门（edge (1,0) → angle=PI/2）：出口在门左侧，法线 -X
    const [x3, y3, bx3, by3] = portalOutingPoint(20, 42, 100, 200, Math.PI / 2);
    expect([x3, y3, bx3, by3]).toEqual([80, 179, -1, 0]);
    // 左墙门（edge (-1,0) → angle=-PI/2）：出口在门右侧，法线 +X
    const [x4, y4, bx4, by4] = portalOutingPoint(20, 42, 100, 200, -Math.PI / 2);
    expect([x4, y4, bx4, by4]).toEqual([100, 179, 1, 0]);
  });
});
