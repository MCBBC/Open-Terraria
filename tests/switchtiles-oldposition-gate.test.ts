// SW-AQ1 2026-09-05 回归：SwitchTiles 弹幕 oldPosition 门（Projectile.cs:19974
//  `!flag2 && … && position != oldPosition` position 臂 + Collision.cs:3346-3353
//  442 子矩形新入旧出 / :3356 旧位全格带跳过）——碰撞帧（本拍零位移/旧位已在板格）
//  不触发,自由位移进带才触发;FPD 豁免面 = flag4/flag5 两臂（:19974/:19977）,
//  新旧位门对 FPD 照施（原版 SwitchTiles 内判定 objType 全路统一）。flag2 置位链
//  实录：:17581 decl false → :17897 子步扫循环内置位（:17899 每子步自扫）,
//  非"碰撞改速度"——见 SW-AQ1 报告。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { Game } from '../src/core/Game';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';

const PLATE = TILE_BY_KEY['v_135_pressure_plates']!, PAD = TILE_BY_KEY['v_442_projectilepressurepad']!;

function plateShell(w: World, projs: unknown[]) {
  const wr = new Wiring(w.store);
  const calls: Array<[number, number]> = [];
  (wr as unknown as { hitSwitch: (x: number, y: number) => void }).hitSwitch = (x, y) => { calls.push([x, y]); };
  const g = Object.create(Game.prototype) as unknown as Record<string, any>;
  g.world = w; g.wiring = wr; g.breakTile = () => {};
  g.entityPlateLatch = new Set<string>(); g._entityPlatePressed = new Set<string>();
  g.entities = { projectiles: projs, critters: [], npcs: [], enemies: [] };
  return { g, calls };
}
// 盒 (8,20) 板格 [128,144)×[320,336):new 进脚带 [332,336.01)（Collision.cs:3352-3357）
const shot = (id: number, over: object = {}) =>
  ({ x: 8 * TILE + 4, y: 20 * TILE + 8, w: 8, h: 8, id, ...over });

describe('SW-AQ1: SwitchTiles oldPosition 门', () => {
  it('碰撞帧不扫：本拍零位移（old≡new）→ :19974 position==oldPosition 不达', () => {
    const w = new World(80, 80, 7, 't'); w.store.setTileSilent(8, 20, PLATE);
    const p = shot(1, { oldX: 8 * TILE + 4, oldY: 20 * TILE + 8 });
    const { g, calls } = plateShell(w, [p]); g.updateEntityPlates();
    expect(calls).toEqual([]);
  });
  it('碰撞帧不扫：落板帧旧位已在板格（:3356 旧位全格带跳过,竖向落板不触发）', () => {
    const w = new World(80, 80, 7, 't'); w.store.setTileSilent(8, 20, PLATE);
    const { g, calls } = plateShell(w, [shot(1, { oldX: 8 * TILE + 4, oldY: 20 * TILE + 2 })]);
    g.updateEntityPlates();   // old 底 330>320 且 322<336.01 = 旧位在格 → 新入脚带亦不响
    expect(calls).toEqual([]);
  });
  it('非碰撞帧扫：自由位移从板格外进带 → 触发;未上报弹 latch 口径不变', () => {
    const w = new World(80, 80, 7, 't'); w.store.setTileSilent(8, 20, PLATE);
    const a = plateShell(w, [shot(1, { oldX: 8 * TILE + 4, oldY: 20 * TILE - 14 })]);
    a.g.updateEntityPlates();
    expect(a.calls).toEqual([[8, 20]]);                       // old 底 314≤320 格外 → 触发
    const b = plateShell(w, [shot(2)]); b.g.updateEntityPlates();
    expect(b.calls).toEqual([[8, 20]]);                       // 无 oldX/oldY → latch 原路
  });
  it('442 新旧子矩形（:3346-3353）：落板新入旧出触发,驻板（old 亦在）不重触发', () => {
    const w = new World(80, 80, 7, 't'); const st = w.store;
    st.setTileSilent(8, 20, PAD);
    const a = plateShell(w, [shot(1, { oldX: 8 * TILE + 4, oldY: 20 * TILE - 6 })]);
    a.g.updateEntityPlates();
    expect(a.calls).toEqual([[8, 20]]);                       // old [310,318) 出子矩形 [326,336)
    const b = plateShell(w, [shot(2, { oldX: 8 * TILE + 4, oldY: 20 * TILE + 8 })]);
    b.g.updateEntityPlates();
    expect(b.calls).toEqual([]);                              // 驻板挡停帧零触发
  });
  it('FPD 豁免面：tileCollide=false ∧ FPD[37] 仍扫（:19977 flag5 臂）;零位移帧 :19974 照拦', () => {
    const w = new World(80, 80, 7, 't'); w.store.setTileSilent(8, 20, PLATE);
    const a = plateShell(w, [shot(1, { projId: 37, tileCollide: false, oldX: 8 * TILE + 4, oldY: 20 * TILE - 14 })]);
    a.g.updateEntityPlates();
    expect(a.calls).toEqual([[8, 20]]);
    const b = plateShell(w, [shot(2, { projId: 37, tileCollide: false, oldX: 8 * TILE + 4, oldY: 20 * TILE + 8 })]);
    b.g.updateEntityPlates();
    expect(b.calls).toEqual([]);                              // FPD 不豁免新旧位/零位移门（原版同）
  });
});
