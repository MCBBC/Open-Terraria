// ★BJ474（2026-10-03 第三轮定谳）蜂蜜中跑动绿叶尘——真凶=spawnFastRunParticles 门带
//  在蜜中张开的自造速度因子（speedMult 的 `(inHoney ? 0.5 : 1)`，本刀撤除）。
//
// ── 全案证据链 ──
//  · 真机探针（用户世界存档+角色，scripts/_bj474-honey-dust-live.mjs，5203 私有实例）：
//    尘 186 ×2/tick 脚下盒 (x-4, feetY, w+8, 4)，1826/1826 全 inHoney 侧、干地零发、
//    wet/wetCount 恒假（居中探针够不到 1 格浅洼=「缓慢液体」体感来自位移减速非湿位）。
//  · 尘 186 = 原版翼支快跑尘（Player.cs:20365 `wings == 3 || vanityRocketBoots == 6`
//    → NewDust(…,186,…,50,…,1.5)×2 + cWings 染料 shader）。用户装备 .plr 实证：
//    armor[6]=665 Red's Wings（原版 case 665 `wingSlot = 3`，Item.cs:9175）→
//    wing.logic=3 进翼支；dye[6]=1011 GreenDye → cWings=绿 → 186 渲染成绿叶色。
//  · 触发域=本仓自造因子：speedMult 乘 `(inHoney ? 0.5 : 1)` 把蜜中 maxRun 半缩而
//    accRun 不缩 → 门带 (accRun+maxRun)/2~accRun 由干地空带 [3,3) 张开为 (2.25,3)
//    → 跑动 vx 2.86-3.02 越门 → 翼支 186 误触发。原版 maxRunSpeed/accRunSpeed 全链
//    无 wet 因子（reset :24096-24099 / moveSpeed 乘区 :25694-25695 / 装备链
//    :26184-26300）——蜜减速全在位移积分层 WetCollision movementSpeed=0.25
//    （:28380，本仓 liqFactor 段 1:1 承载）→ 原版蜜中门带与干地同为空=原版不触发。
//  · 变异证红：把 speedMult 定义加回 `* (this.inHoney ? 0.5 : 1)` →
//    「蜜中跑动零快跑尘」用例即红（翼支 186 复现）。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

const W = 80, H = 200;
const FLOOR = 120;
const PW = 20, PH = 42;

/** 深蜜池（居中探针必湿=inHoney 必真）：row 60-119 灌蜜 type3、row 120 池底；
 *  x 62-76 为干台（干地对照面） */
function honeyWorld(): World {
  const w = new World(W, H, 11, 'bj474-deep-honey');
  const st = w.store;
  for (let x = 20; x < 60; x++) {
    st.setTile(x, FLOOR, 1);
    for (let y = 60; y < FLOOR; y++) st.setLiquid(x, y, 255, 3);
  }
  for (let x = 62; x < 76; x++) for (let y = 100; y < FLOOR; y++) st.setTile(x, y, 1);
  return w;
}

/** 快跑尘记录器：spawnFastRunParticles 直连 game.vanillaDust（非 game.spawnDust），
 *  故 wrap vanillaDust.spawn（BJ457 探针漏记口之二；spawnParticles 口由发射器面
 *  隔离，快跑尘不走该口） */
function makeDriver(world: World, px: number, py: number) {
  const p = new Player(px, py, new Inventory());
  p.hp = 400;
  p.inv.armor[6] = { id: 665, stack: 1 } as never;   // Red's Wings（原版 wingSlot 3）
  p.inv.dye[6] = { id: 1011, stack: 1 } as never;    // GreenDye（用户翼染料=绿叶色来源）
  const dust: Array<{ type: number; dyeVid: number; vx: number; vy: number; scale: number }> = [];
  const hooks = {
    world, player: p, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    playSfxWav: () => {},
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
    vanillaDust: {
      spawn: (_x: number, _y: number, _w: number, _h: number, type: number) => {
        const d = { vx: 0, vy: 0, scale: 1, dyeVid: -1, type };
        dust.push(d);   // 返回体=记录体：face 后置 d.dyeVid=…（翼染料）在记录上可见
        return d;
      },
    },
  } as unknown as GameHooks;
  return { p, hooks, dust };
}

const tick = (p: Player, hooks: GameHooks, input = 1) => {
  p.inputX = input;
  p.fixedUpdate(1 / 60, hooks);
};

beforeEach(() => { vi.restoreAllMocks(); });

describe('BJ474 蜂蜜中跑动绿叶尘——第三轮定谳（speedMult 自造 inHoney 因子撤除）', () => {
  it('前置：装备链生效（wing.logic=3）且深蜜中 inHoney=true、liqFactor=0.25（蜜减速仍在）', () => {
    const w = honeyWorld();
    const { p, hooks } = makeDriver(w, 30 * TILE, FLOOR * TILE - PH);
    p.vx = 0.5;
    for (let t = 0; t < 20; t++) tick(p, hooks, 0);
    const eq = (p as unknown as { equipStats: { wing?: { logic: number } | null }; inHoney: boolean; liqFactor: number });
    expect(eq.equipStats.wing?.logic).toBe(3);          // Red's Wings → 翼支（:9175 case 665 wingSlot=3）
    expect(eq.inHoney).toBe(true);                      // 深蜜居中探针必湿（用户「缓慢液体」体感域）
    expect(eq.liqFactor).toBe(0.25);                    // ★撤因子不撤减速：位移积分层照旧（:28380 1:1）
  });

  it('★判据：蜜中跑动（含快跑速度域）零快跑尘——门带与干地同为空（旧因子下 186×2/tick 复现=红）', () => {
    const w = honeyWorld();
    const { p, hooks, dust } = makeDriver(w, 30 * TILE, FLOOR * TILE - PH);
    p.vx = 2.9;                                          // 旧代码门带 (2.25,3) 内=必触发的速度
    for (let t = 0; t < 40; t++) { p.vx = Math.max(p.vx, 2.9); tick(p, hooks, 1); }
    expect(p.inHoney).toBe(true);
    const fastRun = dust.filter((d) => [186, 16, 76, 6, 32, 61, 242, 64, 63, 253].includes(d.type));
    expect(fastRun).toEqual([]);                         // 新代码：门带 [3,3) 空 → 原版同相零触发
  });

  it('干地对照（用户「干地草地跑动零尘」）：同装备同速度零快跑尘', () => {
    const w = honeyWorld();
    const { p, hooks, dust } = makeDriver(w, 68 * TILE, FLOOR * TILE - PH);   // 干台
    p.vx = 2.9;
    for (let t = 0; t < 40; t++) { p.vx = Math.max(p.vx, 2.9); tick(p, hooks, 1); }
    expect(p.inHoney).toBe(false);
    const fastRun = dust.filter((d) => [186, 16, 76, 6, 32, 61, 242, 64, 63, 253].includes(d.type));
    expect(fastRun).toEqual([]);
  });

  it('门带算术锚（原版 :19906 (accRun+maxRun)/2 · :20365 翼支 186×2+染料直连）', () => {
    const w = honeyWorld();
    const { p, hooks, dust } = makeDriver(w, 30 * TILE, FLOOR * TILE - PH);
    for (let t = 0; t < 10; t++) tick(p, hooks, 0);      // 装备链预热
    const self = p as unknown as {
      spawnFastRunParticles: (g: GameHooks, maxRun: number, accRun: number) => void;
      vy: number; vx: number;
    };
    // (maxRun=3, accRun=3)（撤因子后的蜜中/干地几何）：调用方可达 vx 域恒 ≤3=门(3+3)/2 恒拒
    self.vx = 2.9; self.vy = 0;
    self.spawnFastRunParticles(hooks, 3, 3);
    expect(dust).toEqual([]);
    // (maxRun=1.5, accRun=3)（撤因子前的蜜中几何）：门 (1.5+3)/2=2.25——
    //   2.2 ≤ 2.25 拒 / 2.9 > 2.25 触发 186×2，染料=翼染料 1011（绿叶色渲染来源，
    //   原版 cWings shader 同构）
    self.vx = 2.2; self.vy = 0;
    self.spawnFastRunParticles(hooks, 1.5, 3);
    expect(dust).toEqual([]);
    self.vx = 2.9; self.vy = 0;
    self.spawnFastRunParticles(hooks, 1.5, 3);
    expect(dust.length).toBe(2);
    expect(dust.every((d) => d.type === 186)).toBe(true);
    expect(dust.every((d) => d.dyeVid === 1011)).toBe(true);
  });

  it('源级钉：speedMult 定义不再含 inHoney 因子（防回归回填）', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/entities/Player.ts', import.meta.url)), 'utf8');
    const def = src.split('\n').find((l) => l.includes('const speedMult ='));
    expect(def).toBeTruthy();
    expect(def!.includes('inHoney')).toBe(false);
  });
});
