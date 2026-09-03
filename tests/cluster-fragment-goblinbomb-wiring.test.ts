// SW-Q1 2026-09-03：集束裂片 779/783/862/863 + 681 哥布林炸弹接线回归
// （标杆 Terarria1457/Terraria/Projectile.cs）：
//  ① 发射源表（Kill_Bombs_DoUsualKillCode :79803-79814 num52 选择式）+ 裂片
//     SetDefaults 共档（:7941-7952）+ Kill 爆盒半宽 24（PrepareBombToBlow :47674-78）
//  ② 裂片专支尾尘（:48265-48276）：Next(25)→228 / 独立 Next(5)→31,scale 绝对 1.3
//  ③ 重力门（:48377 第一析取支名单 ai[0]>10）
//  ④ 681 尾焰尘（:48324-48330）：每 tick 恰 1 粒尘 6,锚 (6×sign(vx),−h/2−6).RotBy(rot)×1.1
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { projectileData } from '../src/data/vanillaProjectiles';
import { ClusterFragmentProj, CLUSTER_FRAGMENT_OF, fragmentTrailDustSpecs } from '../src/entities/ClusterFragmentProj';
import { goblinBombTrailDustAnchor } from '../src/entities/bossAI_dd2';
import type { GameHooks } from '../src/entities/types';

function mkGame() {
  const dusts: Array<{ type: number; vx: number; vy: number; scale: number; noGravity: boolean; x: number; y: number }> = [];
  const w = new World(80, 60, 30, 'open');
  for (let x = 0; x < 80; x++) w.store.setTileSilent(x, 50, 1, 0, 0);
  const g = {
    world: w, player: null, enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: () => {} }, cutTile: () => {},
    spawnDust: (_x: number, _y: number, _w: number, _h: number, type: number, svx: number, svy: number) => {
      const d = { type, vx: svx, vy: svy, scale: 1, noGravity: false, x: 0, y: 0 };
      dusts.push(d); return d;
    },
  } as unknown as GameHooks;
  return { g, dusts };
}

afterEach(() => vi.restoreAllMocks());

describe('SW-Q1 集束裂片/681 哥布林炸弹接线', () => {
  it('发射源表+SetDefaults 档+爆盒半径（:79803-79814/:7941-7952/:47674-78/:79027）', () => {
    expect(CLUSTER_FRAGMENT_OF).toEqual({ 776: 779, 777: 779, 778: 779, 780: 783, 781: 783, 782: 783, 803: 862, 804: 863 });
    for (const id of [779, 783, 862, 863]) {
      const d = projectileData(id)!;
      expect([d.aiStyle, d.width, d.height, d.penetrate, d.friendly, d.ranged]).toEqual([16, 14, 14, -1, true, true]);
    }
    expect([Game.EXPLODE_RADIUS[779] ?? 0, Game.EXPLODE_RADIUS[783], Game.EXPLODE_RADIUS[862] ?? 0, Game.EXPLODE_RADIUS[863]])
      .toEqual([0, 3, 0, 3]);           // 783/863 ∈ ExplodeTiles 闸门 r3 组（:79052）,779/862 不毁地形
  });
  it('裂片专支尾尘纯函数（:48265-48276）：双掷独立同拍双出、spawn 速 −v/10、scale 绝对 1.3', () => {
    expect(fragmentTrailDustSpecs(5, -8, true, true)).toEqual([
      { type: 228, svx: -0.5, svy: 0.8, scale: 1.3 }, { type: 31, svx: -0.5, svy: 0.8, scale: 1.3 }]);
    expect(fragmentTrailDustSpecs(5, -8, false, false)).toEqual([]);
    const s = fragmentTrailDustSpecs(0, 0, false, true);
    expect(s.length).toBe(1);
    expect([s[0].type, s[0].scale, s[0].svx === 0, s[0].svy === 0]).toEqual([31, 1.3, true, true]);
  });
  it('裂片实体：重力门 10 拍（第 11 拍起 vy+0.2）/尘 228+31 归零缩放/引信 31..60 爆', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);        // 全中签:双尘齐出、frame=0
    const run = (ticks: number) => {
      const env = mkGame();
      const p = new ClusterFragmentProj(640, 640, 2, 0, 21, 779, 31, () => {});
      for (let i = 0; i < ticks; i++) p.fixedUpdate(0, env.g);
      return { p, dusts: env.dusts };
    };
    expect([run(10).p.vy, run(11).p.vy]).toEqual([0, 0.2]);
    const { dusts } = run(3);
    expect(dusts.length).toBe(6);                       // 2 粒/tick（228+31）
    expect(dusts.map((d) => d.type)).toEqual([228, 31, 228, 31, 228, 31]);
    expect(dusts[0].scale).toBe(1.3);
    expect(dusts[0].noGravity && dusts[0].vx === 0 && dusts[0].vy === 0).toBe(true);
    const boom = mkGame();
    let boomDmg = -1; let boomR = 0;
    const frag = new ClusterFragmentProj(640, 640, 0, 0, 21, 783, 31,
      (_x, _y, dmg) => { boomDmg = dmg; boomR += 1; });
    for (let i = 0; i < 30 && !frag.dead; i++) frag.fixedUpdate(0, boom.g);
    expect(frag.dead).toBe(true);                        // fuse 31 → 第 29 拍 post-dec 2 爆
    expect(boomDmg).toBe(21);                            // Kill 伤=发射伤（未减半,裂片伤由出生点定）
    expect(boomR).toBe(1);
  });
  it('681 尾焰尘锚点纯函数（:48324-48330）：rot0 → (±6.6,−14.3)、rotπ/2·vx<0 → (+14.3,−6.6)', () => {
    expect(goblinBombTrailDustAnchor(100, 200, 5, 0, 7, 3)).toEqual({ x: 106.6, y: 200 - 14.3, scale: 1.3 });
    const q = goblinBombTrailDustAnchor(100, 200, -5, Math.PI / 2, 7, 0);
    expect([q.x, q.y, q.scale].map((v) => Math.round(v * 10) / 10)).toEqual([114.3, 193.4, 1]);
  });
});
