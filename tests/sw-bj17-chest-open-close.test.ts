// ★SW-BJ17 2026-09-07 宝箱开/关盖动画帧 + 开/关/换箱音效（用户实报）回归——
//  原版语义（1457 反编译锚）：
//   · 盖帧驱动 = Chest.UpdateChestFrames（Chest.cs:3599-3657，Main.cs:17993 每
//     world-update 60Hz 调）：在用（任一玩家 player.chest==该箱）→ frameCounter++
//     否则 --，钳 [0,10]；frame = 0（关）/1（半开）/2（全开）。走远/关背包/死亡/
//     开他箱 → 旧箱脱离在用集 → 帧衰减还原（关面板静默、走远播 Sound 11）。
//   · 绘制 = TileDrawing.CacheSpecialDraws_Part2（TileDrawing.cs:4321-4347）：
//     BasicChest{21,467}（TileID.cs:315）按 frameX%36/frameY%36 归一 2×2 锚点，
//     addFrY = frame×38 —— Tiles_21 三姿态竖带带距 38（PNG 高 114 实证，测试直读）。
//   · 音效 = Player.cs:33497-33509 尾部（BasicChest∪29/97/463/491 同分支）：
//     同箱再点 → chest=-1 + Sound 11（menuClose）;无容器 → 开 + Sound 10
//     （menuOpen）;有容器异箱 → 开 + Sound 12（menuTick,旧箱隐式关无 11 音）。
//  本测：行为面（Game 桩例程）+ 结构锁（渲染/烘焙接线）双轨。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { chestLidPoseAt } from '../src/render/VanillaTiler';
import type { ChestData } from '../src/world/World';

const TILE = 16;
const CHEST_T = TILE_BY_KEY['chest'];   // tile 16（sheet 21）

type GameHooks = import('../src/entities/types').GameHooks;

/** 2×2 style-0 木箱写入（四格帧 TL(0,0)/TR(18,0)/BL(0,18)/BR(18,18)）+ 登记容器 */
function placeChest(w: World, x: number, y: number): ChestData {
  const t = CHEST_T;
  w.store.setTileSilent(x, y, t, 0, 0);
  w.store.setTileSilent(x + 1, y, t, 18, 0);
  w.store.setTileSilent(x, y + 1, t, 0, 18);
  w.store.setTileSilent(x + 1, y + 1, t, 18, 18);
  const c: ChestData = { x, y, items: Array(10).fill(null) };
  w.chests.push(c);
  return c;
}

interface Rig {
  g: Game;
  sfx: string[];
  opened: ChestData[];
  closedCount: number;
  dirties: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  setOpen: (c: ChestData | null) => void;
  chestA: ChestData;
  chestB: ChestData;
}

/** Game 原型桩（tests/achievements-trigger-surface.test.ts 同式）：
 *  UI 注入面（openChestRef/closeChestPanel/openChest）按真实装配语义镜像——
 *  openChest 回调 = UI.openChestPanel（登记 openChest 引用）;closeChestPanel =
 *  UI.closeInventory 收面板（openChest=null）。sfx/chunks 记录器。 */
function makeRig(): Rig {
  const w = new World(160, 200, 30, 'open');
  const chestA = placeChest(w, 60, 100);
  const chestB = placeChest(w, 70, 100);
  const sfx: string[] = [];
  const opened: ChestData[] = [];
  const dirties: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  let openRef: ChestData | null = null;
  let closedCount = 0;
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.world = w;
  g.achievements = { handleSpecialEvent: () => {} };
  g.sfx = { play: (n: string) => { sfx.push(n); } };
  g.input = { rightDown: true };
  g.chunks = { markDirtyArea: (x0: number, y0: number, x1: number, y1: number) => { dirties.push({ x0, y0, x1, y1 }); } };
  g.openChestRef = () => openRef;
  g.openChest = (c: ChestData) => { openRef = c; opened.push(c); };
  g.closeChestPanel = () => { openRef = null; closedCount++; };
  return {
    g: g as unknown as Game, sfx, opened, closedCount, dirties,
    setOpen: (c) => { openRef = c; },
    chestA, chestB,
  };
}

const frameOf = (c: ChestData) => c.frame ?? 0;
const counterOf = (c: ChestData) => c.frameCounter ?? 0;
/** 驱动 n 个 world-update 拍（UpdateChestFrames 60Hz 消费面） */
function drive(rig: Rig, n: number) {
  for (let i = 0; i < n; i++) (rig.g as unknown as { updateChestFrames: () => void }).updateChestFrames();
}

// ---------------------------------------------------------------------------
// 盖帧驱动（Chest.cs:3599-3657 1:1）
// ---------------------------------------------------------------------------
describe('SW-BJ17 盖帧驱动 updateChestFrames', () => {
  it('开箱在用 → 10 拍渐进开盖：counter 0→10、frame 0→1→2,帧变化重烘周边块', () => {
    const rig = makeRig();
    rig.setOpen(rig.chestA);
    drive(rig, 1);
    expect(counterOf(rig.chestA)).toBe(1);
    expect(frameOf(rig.chestA)).toBe(1);          // 首拍即半开档（counter≠0 且 ≠10）
    expect(rig.dirties.length).toBe(1);
    expect(rig.dirties[0]).toEqual({ x0: 59, y0: 99, x1: 62, y1: 102 });  // ±1 协商边距
    drive(rig, 8);                                 // 共 9 拍
    expect(counterOf(rig.chestA)).toBe(9);
    expect(frameOf(rig.chestA)).toBe(1);
    drive(rig, 1);                                 // 第 10 拍全开
    expect(counterOf(rig.chestA)).toBe(10);
    expect(frameOf(rig.chestA)).toBe(2);
    const dirtyAfter = rig.dirties.length;
    drive(rig, 5);                                 // 钳 [0,10]（:3636-3643）：稳态不再重烘
    expect(counterOf(rig.chestA)).toBe(10);
    expect(rig.dirties.length).toBe(dirtyAfter);
  });

  it('脱离在用（关箱/走远/死亡/开他箱）→ 帧衰减还原到关态', () => {
    const rig = makeRig();
    rig.setOpen(rig.chestA);
    drive(rig, 10);
    expect(frameOf(rig.chestA)).toBe(2);
    rig.setOpen(null);                             // walk-away / ESC / 死亡收面板（vanilla 静默关）
    drive(rig, 1);
    expect(frameOf(rig.chestA)).toBe(1);           // 先回落半开档
    drive(rig, 9);
    expect(counterOf(rig.chestA)).toBe(0);
    expect(frameOf(rig.chestA)).toBe(0);           // 10 拍全关
  });

  it('多箱互斥：开 B 关 A（A 脱离在用衰减）——两箱盖帧独立', () => {
    const rig = makeRig();
    rig.setOpen(rig.chestA);
    drive(rig, 10);
    expect(frameOf(rig.chestA)).toBe(2);
    rig.setOpen(rig.chestB);                       // OpenChest 重赋 chest → A 隐式关
    drive(rig, 10);
    expect(frameOf(rig.chestA)).toBe(0);           // A 还原
    expect(frameOf(rig.chestB)).toBe(2);           // B 全开
  });

  it('banks/容器宠物槽位（x<0）不计入在用集（Chest.cs:3604-3606 chest>=0 门）', () => {
    const rig = makeRig();
    const bank: ChestData = { x: -2, y: 0, items: Array(40).fill(null) };
    rig.g.world.chests.push(bank);
    rig.setOpen(bank);                             // 面板挂着 bank（x=-2）
    drive(rig, 12);
    expect(frameOf(bank)).toBe(0);                 // 无 tile 姿态：counter 恒 0（跳过臂）
    expect(frameOf(rig.chestA)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 开/关/换箱音效 + 同箱再点关（Player.cs:33497-33509 尾部 1:1）
// ---------------------------------------------------------------------------
describe('SW-BJ17 开/关/换箱音效链 tryOpenChest', () => {
  it('无容器开箱 → Sound 10 menuOpen + 开面板', () => {
    const rig = makeRig();
    (rig.g as unknown as { tryOpenChest: (c: ChestData) => void }).tryOpenChest(rig.chestA);
    expect(rig.opened).toEqual([rig.chestA]);
    expect(rig.sfx).toEqual(['menuOpen']);
    expect(rig.closedCount).toBe(0);
  });

  it('同箱再点 → 关面板 + Sound 11 menuClose,不重开', () => {
    const rig = makeRig();
    rig.setOpen(rig.chestA);                       // chest == num77（:33497）
    (rig.g as unknown as { tryOpenChest: (c: ChestData) => void }).tryOpenChest(rig.chestA);
    expect(rig.closedCount).toBe(1);               // chest = -1（:33498）
    expect(rig.sfx).toEqual(['menuClose']);        // Sound 11（:33499）
    expect(rig.opened).toEqual([]);                // 不走 OpenChest
  });

  it('异箱切换（A 开着点 B）→ 开 B + Sound 12 menuTick,旧箱隐式关（无 11 双响）', () => {
    const rig = makeRig();
    rig.setOpen(rig.chestA);
    (rig.g as unknown as { tryOpenChest: (c: ChestData) => void }).tryOpenChest(rig.chestB);
    expect(rig.opened).toEqual([rig.chestB]);
    expect(rig.sfx).toEqual(['menuTick']);         // :33508（无 menuClose——OpenChest 重赋）
    expect(rig.closedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 渲染：姿态解析 + 姿态带位移（TileDrawing.cs:4321-4347）
// ---------------------------------------------------------------------------
describe('SW-BJ17 渲染姿态 chestLidPoseAt / drawVanillaCell', () => {
  it('锚点归一：TL(fx%36==0) 不退、TR/BL/BR 按 frameX/frameY%36 退一格（:4325-4330）', () => {
    const chests = [{ x: 10, y: 20, frame: 2 }];
    expect(chestLidPoseAt(chests, 10, 20, 0, 0)).toBe(2);    // TL → 锚点
    expect(chestLidPoseAt(chests, 11, 20, 18, 0)).toBe(2);   // TR → x-1
    expect(chestLidPoseAt(chests, 10, 21, 0, 18)).toBe(2);   // BL → y-1
    expect(chestLidPoseAt(chests, 11, 21, 18, 18)).toBe(2);  // BR → 双退
    expect(chestLidPoseAt(chests, 12, 21, 18, 18)).toBe(0);  // 非本件格 → 无位移
  });

  it('查无箱登记（wld 缺箱数据）→ 0 不位移（vanilla FindChest==-1 门 :4335）', () => {
    expect(chestLidPoseAt(undefined, 10, 20, 0, 0)).toBe(0);
    expect(chestLidPoseAt([], 10, 20, 0, 0)).toBe(0);
    expect(chestLidPoseAt([{ x: 50, y: 50 }], 10, 20, 0, 0)).toBe(0);
  });

  it('姿态带距 38 = Tiles_21/467 高 114 ÷ 3 带直证（关 0 / 半开 38 / 全开 76）', () => {
    for (const f of ['Tiles_21.png', 'Tiles_467.png']) {
      const b = readFileSync(new URL(`../public/sprites/vanilla/${f}`, import.meta.url));
      const h = b.readUInt32BE(20);
      expect(h).toBe(114);            // 3 姿态带 × 38px（带内容 36px + 2px 隔）
      expect(h / 3).toBe(38);         // addFrY = frame×38 的素材面依据
    }
  });

  it('结构锁：drawVanillaCell 姿态带位移挂 vframeAt 前（21/467 门）;烘焙两路喂 chestLidPoseAt;fixedUpdate 挂驱动', () => {
    const vt = readFileSync(new URL('../src/render/VanillaTiler.ts', import.meta.url), 'utf8');
    expect(vt).toContain('chestPose > 0 && (sheet === 21 || sheet === 467)) ofy += chestPose * 38');
    const cc = readFileSync(new URL('../src/render/ChunkCache.ts', import.meta.url), 'utf8');
    expect(cc.match(/chestLidPoseAt\(this\.world\.chests/g)?.length).toBe(2);  // 主遍+上溢补绘条带
    const g = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    expect(g).toContain('this.updateChestFrames();   // ★SW-BJ17 2026-09-07');
  });
});

// ---------------------------------------------------------------------------
// 储物族（29/97/463/491）同链音效（Player.cs:33314 同分支 → :33497-33509 尾部）
// ---------------------------------------------------------------------------
describe('SW-BJ17 储物族开/关/换音（BANK_TILES 分支结构锁）', () => {
  it('bank 分支播 menuOpen/menuClose/menuTick（同 vanilla 尾部）,不再播非原版链的 tink', () => {
    const g = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    const start = g.indexOf('for (const [key, bi] of BANK_TILES)');
    const body = g.slice(start, g.indexOf('if (type === T.DOOR_CLOSED', start));
    expect(body).toContain("sfx.play('menuOpen'");
    expect(body).toContain("sfx.play('menuClose'");
    expect(body).toContain("sfx.play(curB ? 'menuTick' : 'menuOpen'");
    expect(body).not.toContain("sfx.play('tink')");
  });
});
