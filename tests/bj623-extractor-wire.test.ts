// BJ623 提炼机电线触发（用户实报「接 1 秒计时器不自动提炼」+图 96）判别+回归锁。
//
// ★定谳（2026-10-10，反编译 1457 亲读 + 真机探针 scripts/_bj623-probe.mjs）：
//   原版锚：Wiring.cs:1996-1998 `case 219: case 642: Extractinator(i, j)`；
//   Extractinator :2563-2593（锚点回算 54px 三格 / CheckMech 60t / 邻域箱扫描
//   [ax-2..ax+5]×[ay-2..ay+5]（:2596-2622）/ 开箱中不转化（:2571 Chest.UsingChest）/
//   箱内自后向前逐格 roll、itemType>0 才扣 1 并 break（:2575-2592）/ 产物落锚点
//   32×32 判定框（:2588））——【原版通电提炼无音效无尘】（全支无 PlaySound/Dust，
//   音效 7 只在手动路径 Player.cs:41025/:41041）。计时器发射 = Wiring.UpdateMech
//   :178-201（1s 档 frameX/18==0 → _mechTime%60==0 时 TripWire(锚,1,1) 并重置 18000）。
//   HitWire 种子格 SkipWire（:843-853）= 计时器自环不被自己关断。
//   本仓 devices.ts case 219/642（:760-773）+ world/Extractinator.ts + Game
//   .extractinatorPullImpl（:30321-30327）全链在轨；真机探针复刻用户场景
//   （提取机+正上方箱雪泥+1s 计时器+红线）4 次提炼全命中——「电线触发支整缺」
//   假设被证伪，本文件把该链从「器件表直调」升级为「计时器驱动全链」回归锁。
//
// 判别面：
//   T1 全链提炼锁（计时器 250t → 恰 4 发 60t 节拍、消耗/掉落对账、双线格单提炼）
//   T2 计时器链路（OFF 不发射 / ON 精确 60t 节拍 / 种子跳过=计时器不被自身脉冲关断）
//   T3 手动桥回归（内部 id→原版 vid→mode 表桥接；箱消耗不越界触邻箱）
//   T4 音/尘面（通电提炼恒静默=原版；ctx.sfx 零调用）
import { describe, it, expect } from 'vitest';
import {
  findExtractinatorChest, extractinatorConsumeFromChest, mathRand,
  extractinatorMode, EXTRACTINATOR_MODE,
  type ExtractChest,
} from '../src/world/Extractinator';
import { deviceTable, type DeviceCtx } from '../src/world/wiring/devices';
import { Wiring } from '../src/world/Wiring';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

// ---------- 夹具：Wiring + 器件表 + 记账 ctx ----------
interface Rig {
  w: Wiring;
  pulls: Array<[number, number, number]>;
  drops: Array<{ vid: number; stack: number; px: number; py: number }>;
  sfxCalls: number;
  chests: ExtractChest[];
}

function makeRig(chests: ExtractChest[]): Rig {
  const world = new World(60, 60, 7, 'open');
  const w = new Wiring(world.store);
  const rig: Rig = { w, pulls: [], drops: [], sfxCalls: 0, chests };
  const ctx: DeviceCtx = {
    dropItem: () => {}, spawnNpc: () => true, mechSpawnOk: () => true, itemSpawnOk: () => true,
    shootProjectile: () => {}, countProjectiles: () => 0,
    doorOpen: () => true, doorClose: () => true, teleportPair: () => {},
    relocateTownNpc: () => true, explode: () => {}, toast: () => {},
    sfx: () => { rig.sfxCalls++; },
    extractinatorPull: (ax, ay, blockType) => {
      rig.pulls.push([ax, ay, blockType]);
      const chest = findExtractinatorChest(chests, ax, ay);
      if (!chest) return null;
      return extractinatorConsumeFromChest(chest, blockType, mathRand(), false);
    },
    dropItemStack: (vid, stack, px, py) => rig.drops.push({ vid, stack, px, py }),
    worldSurface: 30,
  };
  w.device = (ww, sheet, x, y) => deviceTable(ww, ctx, sheet, x, y);
  return rig;
}

/** 放置 3×3 提取机（style 0：frameX=col×18 / frameY=row×18） */
function placeExtractinator(w: Wiring, ox: number, oy: number): void {
  const t = TILE_BY_KEY['v_219_extractinator']!;
  for (let cx = 0; cx < 3; cx++) {
    for (let cy = 0; cy < 3; cy++) {
      w.st.setTileSilent(ox + cx, oy + cy, t, cx * 18, cy * 18);
    }
  }
}

/** 放 1s 计时器（frameX=0）并返回其格 */
function placeTimer(w: Wiring, tx: number, ty: number): void {
  w.st.setTileSilent(tx, ty, TILE_BY_KEY['v_144_timers']!, 0, 0);
}

// ---------- T1：全链提炼锁 ----------
describe('BJ623 T1 全链：计时器→红线→提炼机→邻域箱（图 96 场景）', () => {
  it('开 1s 计时器跑 250t：恰 60t 节拍 4 发、每发扣 1 出 1、掉落在锚点 32×32 中心', () => {
    // 用户场景：冰雪箱【正上方】贴放（锚 ay-2 = 扫描框 [ay-2..ay+5] 上边界行）
    const chests: ExtractChest[] = [{
      x: 10, y: 18, locked: false,
      items: [{ id: 1103, stack: 5 }, null, null, null, { id: 1103, stack: 5 }],  // 首格+末格各 5
    }];
    const rig = makeRig(chests);
    const { w } = rig;
    placeExtractinator(w, 10, 20);
    placeTimer(w, 5, 20);
    for (let x = 5; x <= 10; x++) w.placeWire(x, 20, TileStore.WIRE_RED);  // 计时器→提取机左上格

    w.hitSwitch(5, 20);                                   // 右键开计时器（Game.toggleSwitch 同落点）
    expect(w.st.frameY[w.st.idx(5, 20)]).toBe(18);        // ON

    const fireTicks: number[] = [];
    for (let t = 1; t <= 250; t++) {
      const n = rig.drops.length;
      w.updateMech();
      if (rig.drops.length > n) fireTicks.push(t);
    }
    // 60t 节拍：18000 首拍下沿 = 60/120/180/240（UpdateMech :193 IEEERemainder==0）
    expect(fireTicks).toEqual([60, 120, 180, 240]);
    expect(rig.pulls).toHaveLength(4);
    expect(rig.pulls.every((p) => p[0] === 10 && p[1] === 20 && p[2] === 219)).toBe(true);
    // 消耗对账：自后向前——末格 5→1（4 发），首格未动
    expect(chests[0]!.items[4]).toEqual({ id: 1103, stack: 1 });
    expect(chests[0]!.items[0]).toEqual({ id: 1103, stack: 5 });
    // 掉落对账：每发 1 项 @ 锚点 32×32 判定框中心（Wiring.cs:2588 → ax*16+16, ay*16+16）
    expect(rig.drops).toHaveLength(4);
    for (const d of rig.drops) {
      expect(d.px).toBe(10 * 16 + 16);
      expect(d.py).toBe(20 * 16 + 16);
      expect(d.vid).toBeGreaterThan(0);
      expect(d.stack).toBeGreaterThanOrEqual(1);
    }
  });

  it('红线压提取机两格：checkMech(60) 拦同拍二连提炼（Wiring.cs:2571 一发一提炼）', () => {
    const chests: ExtractChest[] = [{ x: 10, y: 18, locked: false, items: [{ id: 1103, stack: 99 }] }];
    const rig = makeRig(chests);
    const { w } = rig;
    placeExtractinator(w, 10, 20);
    placeTimer(w, 5, 20);
    for (let x = 5; x <= 10; x++) w.placeWire(x, 20, TileStore.WIRE_RED);
    w.placeWire(10, 21, TileStore.WIRE_RED);              // 竖段连通
    w.placeWire(10, 22, TileStore.WIRE_RED);              // 提取机左下格（同锚点第二线格）
    w.hitSwitch(5, 20);
    w.updateMech();                                        // 第 1 tick（未到 60 不发射）
    for (let t = 2; t <= 60; t++) w.updateMech();
    // 单发脉冲压两格：锚点冷却锁 → 恰 1 次提炼
    expect(rig.pulls).toHaveLength(1);
    expect(chests[0]!.items[0]!.stack).toBe(98);
  });
});

// ---------- T2：计时器链路 ----------
describe('BJ623 T2 计时器链路（Wiring.UpdateMech :178-201 + HitWire 种子跳过）', () => {
  it('计时器 OFF（frameY=0）不发射；ON 后每 60t 发射', () => {
    const chests: ExtractChest[] = [{ x: 10, y: 18, locked: false, items: [{ id: 1103, stack: 99 }] }];
    const rig = makeRig(chests);
    const { w } = rig;
    placeExtractinator(w, 10, 20);
    placeTimer(w, 5, 20);
    for (let x = 5; x <= 10; x++) w.placeWire(x, 20, TileStore.WIRE_RED);
    for (let t = 0; t < 120; t++) w.updateMech();          // OFF：零发射
    expect(rig.pulls).toHaveLength(0);
    w.hitSwitch(5, 20);                                     // ON
    for (let t = 1; t <= 130; t++) w.updateMech();
    expect(rig.pulls).toHaveLength(2);                      // 60/120 两拍
  });

  it('种子跳过：计时器不被自身脉冲关断（HitWire :843-853 SkipWire 种子）', () => {
    const rig = makeRig([{ x: 10, y: 18, locked: false, items: [{ id: 1103, stack: 99 }] }]);
    const { w } = rig;
    placeExtractinator(w, 10, 20);
    placeTimer(w, 5, 20);
    for (let x = 5; x <= 10; x++) w.placeWire(x, 20, TileStore.WIRE_RED);
    w.hitSwitch(5, 20);
    for (let t = 0; t < 200; t++) w.updateMech();
    // 若种子被 HitSwitch（case 144）翻转，首拍后计时器即 OFF → 发射停在 1
    expect(rig.w.st.frameY[rig.w.st.idx(5, 20)]).toBe(18);
    expect(rig.pulls.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------- T3：手动桥回归 ----------
describe('BJ623 T3 手动交互桥（Game.useExtractinator 消费原语）', () => {
  it('内部 id→原版 vid→mode 表桥接（slotVanillaId 语义）：雪泥/泥沙/沙漠化石恒可达', () => {
    // Game.extractinatorPullImpl 以 slotVanillaId（ITEM_DEFS[].vid）桥接箱内内部 id——
    // 桥断 = 箱内有货仍零提炼（用户症状的候选根因之一），此处锁桥面语义
    expect(extractinatorMode(1103)).toBe(0);   // 雪泥
    expect(extractinatorMode(424)).toBe(0);    // 泥沙
    expect(extractinatorMode(3347)).toBe(1);   // 沙漠化石
    expect(EXTRACTINATOR_MODE[409]).toBeUndefined(); // 雪块【不可】提炼（mode 表不收）
    expect(extractinatorMode(-1)).toBe(-1);
    // 桥断变异判别：恒等桥下内部 id（≠原版 id）必须落 -1 → 不消耗
    const chest: ExtractChest = { x: 0, y: 0, items: [{ id: 7777, stack: 3 }] };
    const d = extractinatorConsumeFromChest(chest, 219, mathRand(), false, () => -1);
    expect(d).toBeNull();
    expect(chest.items[0]).toEqual({ id: 7777, stack: 3 });
  });

  it('箱消耗只触扫描窗内命中箱：邻箱越界不串（Wiring.cs:2596-2622 框语义）', () => {
    const near: ExtractChest = { x: 8, y: 18, locked: false, items: [{ id: 1103, stack: 4 }] };
    const far: ExtractChest = { x: 10, y: 11, locked: false, items: [{ id: 1103, stack: 4 }] }; // ay-9 越界
    const hit = findExtractinatorChest([far, near], 10, 20);
    expect(hit).toBe(near);
    const none = findExtractinatorChest([far], 10, 20);
    expect(none).toBeUndefined();
  });
});

// ---------- T4：音/尘面 ----------
describe('BJ623 T4 音/尘面（原版通电提炼全支静默：Wiring.cs:2563-2593 无 PlaySound/Dust）', () => {
  it('4 发提炼 ctx.sfx 零调用（发明自创音效=偏离原版）', () => {
    const rig = makeRig([{ x: 10, y: 18, locked: false, items: [{ id: 1103, stack: 9 }] }]);
    const { w } = rig;
    placeExtractinator(w, 10, 20);
    placeTimer(w, 5, 20);
    for (let x = 5; x <= 10; x++) w.placeWire(x, 20, TileStore.WIRE_RED);
    w.hitSwitch(5, 20);
    for (let t = 0; t < 250; t++) w.updateMech();
    expect(rig.pulls.length).toBeGreaterThanOrEqual(3);
    expect(rig.sfxCalls).toBe(0);
  });
});
