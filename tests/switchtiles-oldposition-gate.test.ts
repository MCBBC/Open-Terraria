// SW-AQ1 2026-09-05 回归：SwitchTiles 弹幕 oldPosition 门（Projectile.cs:19974
//  `!flag2 && … && position != oldPosition` position 臂 + Collision.cs:3314
//  442 子矩形新入旧出 / :3323 旧位排除带跳过,SW-AM2 2026-09-05 引注校准）
//  ——碰撞帧（本拍零位移/旧位在排除带）
//  不触发,自由位移进带才触发;FPD 豁免面 = flag4/flag5 两臂（:19974/:19977）,
//  新旧位门对 FPD 照施（原版 SwitchTiles 内判定 objType 全路统一）。flag2 置位链
//  实录：:17581 decl false → :17897 子步扫循环内置位（:17899 每子步自扫）,
//  非"碰撞改速度"——见 SW-AQ1 报告。
// SW-AL2 2026-09-05（F-1）重钉：旧位排除带 Y = [j*16+12, j*16+28.01)（:3323 逐字,
//  vector.Y=j*16+12 :3277——排除带=触发脚带向下延 12px,X 仍全格带）,非 SW-AQ1
//  旧注"全格 [j*16, j*16+16.01)"——旧带误吞终速<16px/t 竖向落板帧（test#2 期望
//  由 []. 重钉为触发）,上/下沿与 X 带域另设三案钉死。
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
// 盒 (8,20) 板格 [128,144)×[320,336):new 进脚带 [332,336.01)（Collision.cs:3323/:3277）
const shot = (id: number, over: object = {}) =>
  ({ x: 8 * TILE + 4, y: 20 * TILE + 8, w: 8, h: 8, id, ...over });

describe('SW-AQ1: SwitchTiles oldPosition 门', () => {
  it('碰撞帧不扫：本拍零位移（old≡new）→ :19974 position==oldPosition 不达', () => {
    const w = new World(80, 80, 7, 't'); w.store.setTileSilent(8, 20, PLATE);
    const p = shot(1, { oldX: 8 * TILE + 4, oldY: 20 * TILE + 8 });
    const { g, calls } = plateShell(w, [p]); g.updateEntityPlates();
    expect(calls).toEqual([]);
  });
  it('竖向落板 old 底∈(j*16,j*16+4]（SW-AL2 F-1 重钉:排除带 [j*16+12, j*16+28.01) 非全格）→ 触发', () => {
    const w = new World(80, 80, 7, 't'); w.store.setTileSilent(8, 20, PLATE);
    const { g, calls } = plateShell(w, [shot(1, { oldX: 8 * TILE + 4, oldY: 20 * TILE + 2 })]);
    g.updateEntityPlates();   // old 底 330 < 332(=320+12) → 旧位不在排除带 → 必触发
    expect(calls).toEqual([[8, 20]]);   // 终速<16px/t 落板帧 old 底恒在此域,旧全格带误吞（SW-AQ1 旧期望=[].已按 :3323 重钉）
  });
  it('排除带 Y=[j*16+12, j*16+28.01)（:3323 逐字）:old 底入带不触发;X 带仍全格不随 +12 延展', () => {
    const w = new World(80, 80, 7, 't'); w.store.setTileSilent(8, 20, PLATE);
    const a = plateShell(w, [shot(1, { oldX: 8 * TILE + 4, oldY: 20 * TILE + 6 })]);
    a.g.updateEntityPlates();                 // old 盒 [326,334):底 334>332 ∧ 顶 326<348.01 → 在带 → 不触发
    expect(a.calls).toEqual([]);
    const b = plateShell(w, [shot(2, { oldX: 8 * TILE + 17, oldY: 20 * TILE + 8 })]);
    b.g.updateEntityPlates();                 // old 盒 X [145,153) 出板格列 [128,144) → X 全格带不交 → 触发
    expect(b.calls).toEqual([[8, 20]]);
  });
  it('排除带下沿=j*16+28.01:old 盒整体在带下方（顶≥348.01,自下升入）不豁免 → 触发', () => {
    const w = new World(80, 80, 7, 't'); w.store.setTileSilent(8, 20, PLATE);
    const { g, calls } = plateShell(w, [shot(1, { oldX: 8 * TILE + 4, oldY: 20 * TILE + 29 })]);
    g.updateEntityPlates();                   // old 盒 [349,357):349≥348.01 → 带外 → 触发
    expect(calls).toEqual([[8, 20]]);
  });
  it('非碰撞帧扫：自由位移从板格外进带 → 触发;未上报弹 latch 口径不变', () => {
    const w = new World(80, 80, 7, 't'); w.store.setTileSilent(8, 20, PLATE);
    const a = plateShell(w, [shot(1, { oldX: 8 * TILE + 4, oldY: 20 * TILE - 14 })]);
    a.g.updateEntityPlates();
    expect(a.calls).toEqual([[8, 20]]);                       // old 底 314≤320 格外 → 触发
    const b = plateShell(w, [shot(2)]); b.g.updateEntityPlates();
    expect(b.calls).toEqual([[8, 20]]);                       // 无 oldX/oldY → latch 原路
  });
  it('442 新旧子矩形（:3314）：落板新入旧出触发,驻板（old 亦在）不重触发', () => {
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
