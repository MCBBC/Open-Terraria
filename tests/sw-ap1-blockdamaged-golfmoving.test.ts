// SW-AP1 2026-09-05 回归：①CanKillTile out blockDamaged 三置位支（WorldGen.cs:62780-62804）
// ②高尔夫球 AI_149 Moving 门（Projectile.cs:20477-20484）+ :3356 oldPosition 全格排除的
//   锁存等构（静置期 silent 预热;Resting→Moving 原地首拍不响板,离带再入才触发）
import { it, expect } from 'vitest';
import { canKillTileAt } from '../src/entities/Mounts';
import { TileStore } from '../src/world/TileStore';
import { TILE_INTERNAL_BY_SHEET, TILE_BY_KEY } from '../src/data/tiles';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { GolfBall } from '../src/entities/GolfBall';
import { BallState } from '../src/world/golf/golfPhysics';
const S = (sh: number) => TILE_INTERNAL_BY_SHEET.get(sh)!;
it('SW-AP1① blockDamaged 三置位支(:62782 巨石压箱/:62790 锁门/:62802 传送器顶箱);箱内容支与可杀格不置位', () => {
  const ctx = { hardMode: true, chestDestroyable: () => false };
  const mk = (fn: (s: TileStore) => void) => { const s = new TileStore(32, 32); fn(s); return s; };
  const cases: Array<[TileStore, number, number, boolean, boolean]> = [
    [mk((s) => s.setTile(6, 6, S(10), 0, 594)), 6, 6, false, true],                        // 神庙锁门
    [mk((s) => { s.setTile(10, 10, S(138), 0, 0); s.setTile(11, 9, S(21)); }), 10, 10, false, true],   // 巨石+右上压箱
    [mk((s) => { s.setTile(4, 8, S(235), 0, 0); s.setTile(5, 7, S(21)); }), 4, 8, false, true],        // 传送器+顶箱(scanForContainer)
    [mk((s) => s.setTile(12, 12, S(21))), 12, 12, false, false],                           // 箱内容支:拒而不置位
    [mk((s) => s.setTile(14, 12, S(1))), 14, 12, true, false],                             // 普通石:可杀不置位
  ];
  for (const [st, x, y, kill, dmg] of cases) {
    const o = { value: false };
    expect(canKillTileAt(st, x, y, ctx, o)).toBe(kill); expect(o.value).toBe(dmg);
  }
});
it('SW-AP1② 高尔夫 Moving 门:静球不触板/动球触板;静置预热=Resting→Moving 原地首拍不响板,离带再入才触', () => {
  const w = new World(80, 80, 7, 't'); w.store.setTileSilent(8, 20, TILE_BY_KEY['v_135_pressure_plates']!);
  const wr = new Wiring(w.store); const calls: Array<[number, number]> = [];
  (wr as unknown as { hitSwitch: (x: number, y: number) => void }).hitSwitch = (x, y) => { calls.push([x, y]); };
  const g = Object.create(Game.prototype) as any;
  Object.assign(g, { world: w, wiring: wr, breakTile: () => {}, entityPlateLatch: new Set<string>(), _entityPlatePressed: new Set<string>() });
  const mk = (s: BallState) => { const b = new GolfBall(132, 332, 721, () => null); b.ballState = s; return b; };   // 盒底 335.5 落板带 [332,336.01)
  const run = (b: GolfBall) => { g.entities = { projectiles: [b], critters: [], npcs: [], enemies: [] }; g.updateEntityPlates(); };
  const fresh = () => { g.entityPlateLatch.clear(); calls.length = 0; };
  run(mk(BallState.Resting)); expect(calls).toEqual([]);                 // :20477 State==Moving 门(修前静球误触)
  fresh(); run(mk(BallState.Moving)); expect(calls).toEqual([[8, 20]]);  // 动球触板
  fresh(); const b = mk(BallState.Resting); run(b);                      // 静置:silent 预热锁存
  b.ballState = BallState.Moving; run(b);                                // 原地首拍:预热拦截(=oldPosition :3356 排除)
  expect(calls).toEqual([]);
  b.y -= 20; run(b);                                                     // 离带:锁存清除
  b.y += 20; run(b);                                                     // 再入:触发
  expect(calls).toEqual([[8, 20]]);
});
