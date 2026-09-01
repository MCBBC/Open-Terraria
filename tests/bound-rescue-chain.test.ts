// bound 救援 NPC 完整链回归（波 5 清单 #6 补齐）：
//  ① WorldEvolution.convert case 11（净化，WorldGen.cs:55792-55902）——净化粉弹体 10
//    的逐格 Convert 消费方（Projectile.cs:22494）
//  ② PowderProj（proj 10/11/463，aiStyle 6，Projectile.cs:22399-22533）：64×64 云、
//    速度 ×0.95 衰减、180 tick 寿命、每帧 applyPowder 回调
//  ③ bound 姿态贴图表：五张独立捆绑类型表（105/106/123/354/589）+ 税务官酷刑者
//    534 落位 sprites/vanilla；589 是 62×624 十三帧表（vanilla-npcs.json 缺登记，
//    显式帧高切片——vnpc 懒加载 frames=1 会把整条画出）
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { World } from '../src/world/World';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { PowderProj } from '../src/entities/WeaponProj';
import type { GameHooks } from '../src/entities/types';
import { Renderer } from '../src/render/Renderer';
import { TILE_DEFS } from '../src/data/tiles';

/** sheet id → 内部 tile id（与 WorldEvolution.SID 同构，模块私有故测试内重建） */
const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (typeof sh === 'number' && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? -1;

/** png 尺寸（IHDR：宽高各 4 字节大端，偏移 16/20） */
function pngSize(buf: Buffer): [number, number] {
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

function evoAt(jAbove: boolean) {
  const w = new World(24, 24, 7, 'evo');
  const host: EvolutionHost = {
    store: w.store, worldSurface: 12, rockLevel: 18,
    flags: w.flags, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    dungeonX: 0, difficulty: 0,   // Main.dungeonX（保底花苞搜索框；本测试无地牢）
  };
  return { w, st: w.store, evo: new WorldEvolution(host), j: jAbove ? 6 : 20 };
}

describe('Convert case 11 净化（WorldGen.cs:55792-55902）', () => {
  it.each([
    [25, 1],    // 黑檀石 → 石
    [23, 2],    // 腐化草 → 草
    [112, 53],  // 黑檀沙 → 沙
    [117, 1],   // 珍珠石（神圣）也还原为石——净化对邪恶/神圣双向生效
    [109, 2],   // 神圣草 → 草
    [400, 396], // 腐化沙岩 → 沙岩
    [661, 60],  // 腐化丛林草 → 丛林草
  ])('tile sheet %i → %i', (from, to) => {
    const { st, evo, j } = evoAt(false);
    st.setTileSilent(4, j, S(from));
    evo.convert(4, j, 11);
    expect(TILE_DEFS[st.type[st.idx(4, j)]]?.vanilla?.sheet).toBe(to);
  });

  it('墙：腐化草墙 69（地表）→ 原版草墙 63/65 档；石族墙 → 349', () => {
    const above = evoAt(true);
    above.st.setWallSilent(4, above.j, 69);
    const spy1 = vi.spyOn(Math, 'random').mockReturnValue(0); // 9/10 档 → 63
    above.evo.convert(4, above.j, 11);
    spy1.mockRestore();
    expect(above.st.wall[above.st.idx(4, above.j)]).toBe(63);

    const below = evoAt(false);
    below.st.setWallSilent(4, below.j, 69);
    below.evo.convert(4, below.j, 11);
    expect(below.st.wall[below.st.idx(4, below.j)]).toBe(64); // 地下档 64

    const stone = evoAt(false);
    stone.st.setWallSilent(6, stone.j, 83); // 猩红石墙 ∈ Stone 集 → 349
    stone.evo.convert(6, stone.j, 11);
    expect(stone.st.wall[stone.st.idx(6, stone.j)]).toBe(349);
  });
});

describe('PowderProj（proj 10，aiStyle 6，Projectile.cs:22399-22533）', () => {
  function hooks() {
    return {
      spawnParticles: vi.fn(),
      applyPowder: vi.fn(),
    } as unknown as GameHooks;
  }
  it('64×64 云：速度 ×0.95 衰减、每帧 applyPowder 回调、180 tick 寿命', () => {
    const g = hooks();
    const p = new PowderProj(0, 0, 4, 0, 10);
    expect([p.w, p.h]).toEqual([64, 64]);
    p.fixedUpdate(1, g);
    p.fixedUpdate(1, g);
    p.fixedUpdate(1, g);
    expect(g.applyPowder).toHaveBeenCalledTimes(3);
    // 回调携带 proj 10 + 命中盒（Game.applyPowder 据此逐格 Convert + 税务官转化）
    const args = (g.applyPowder as unknown as { mock: { calls: number[][] } }).mock.calls[0];
    expect(args[0]).toBe(10);
    expect(args[3]).toBe(64); expect(args[4]).toBe(64);
    expect(p.vx).toBeCloseTo(4 * 0.95 ** 3, 5);
    // 首帧尘团一次性（30 粒）
    expect(g.spawnParticles).toHaveBeenCalledTimes(1);
    expect(p.dead).toBe(false);
    for (let t = 3; t < 180; t++) p.fixedUpdate(1, g);
    expect(p.dead).toBe(true); // ai[0]==180 → Kill（cs:22406）
  });
});

describe('bound 姿态贴图表（Renderer.BOUND_NPC_SHEET）', () => {
  it('五张独立捆绑类型表 + 税务官酷刑者 534 均落位 sprites/vanilla', () => {
    const table = (Renderer as unknown as { BOUND_NPC_SHEET: Record<string, number> }).BOUND_NPC_SHEET;
    expect(table).toMatchObject({
      goblin_tinkerer: 105, wizard: 106, mechanic: 123, stylist: 354, golfer: 589, tax_collector: 534,
    });
    for (const id of Object.values(table)) {
      const buf = readFileSync(resolve(__dirname, `../public/sprites/vanilla/NPC_${id}.png`));
      expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
    }
    // 589 十三帧表（62×624）：json 缺登记族，boundNpcSheet 必须显式帧高切片
    const [w, h] = pngSize(readFileSync(resolve(__dirname, '../public/sprites/vanilla/NPC_589.png')));
    expect([w, h]).toEqual([62, 624]);
    expect(h / 48).toBe(13);
  });
});
