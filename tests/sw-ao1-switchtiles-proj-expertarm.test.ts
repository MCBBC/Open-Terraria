// SW-AO1 2026-09-05 回归：①SwitchTiles 弹幕消费面路由（Collision.cs:3240-3373 内联集
//   {135,210,443,442};Projectile.cs:19973-19979 objType4 门=!collided&&!flag4&&(tileCollide|flag5)、
//   :17195 objType3 白名单=巨石族;ForcePlateDetection 巨石族=false/爆炸箭族=true（ProjectileID.cs:297-373））
// ②TownNPC.hurt 大伤害门专家 ×15 臂（NPC.cs:82255-82259 num8=num*10→expertMode num*15）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { Game } from '../src/core/Game';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TownNPC } from '../src/entities/TownNPC';
import type { GameHooks } from '../src/entities/types';

const PLATE = TILE_BY_KEY['v_135_pressure_plates']!, PAD = TILE_BY_KEY['v_442_projectilepressurepad']!,
  MINE = TILE_BY_KEY['v_210_landmine']!, GEYSER = TILE_BY_KEY['v_443_geyser']!;

/** Game 壳（updateEntityPlates 消费面 = entities 四桶 + wiring/breakTile/双 latch;redblue-r8 同法） */
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
/** 弹体姿态：盒跨 (8,20) 板面带 [20*16+12, 20*16+16.01)（Collision.cs:3323/:3277） */
const shot = (id: number, over: object = {}) => ({ x: 8 * TILE + 4, y: 20 * TILE + 8, w: 8, h: 8, id, ...over });

describe('SW-AO1①: SwitchTiles 弹幕路由', () => {
  it('弹落压板 135 触发且同位滞留不重触发（:19978 objType 4 + latch 入带触发/离带复位）', () => {
    const w = new World(80, 80, 7, 't'); w.store.setTileSilent(8, 20, PLATE);
    const { g, calls } = plateShell(w, [shot(7)]);
    g.updateEntityPlates(); g.updateEntityPlates();
    expect(calls).toEqual([[8, 20]]);
    expect(w.store.frameX[w.store.idx(8, 20)]).toBe(0);   // 垫板帧不被本面误改
  });
  it('集路由：210 弹触 / 443 间歇泉 objType4 不触 / 442 垫板弹触而巨石族不触', () => {
    const w = new World(80, 80, 7, 't'); const st = w.store;
    st.setTileSilent(8, 20, MINE);
    const m = plateShell(w, [shot(1)]); m.g.updateEntityPlates();
    expect(m.calls).toEqual([[8, 20]]);                   // :3374-3378 地雷全体
    st.setTileSilent(8, 20, GEYSER);
    const q = plateShell(w, [shot(2)]); q.g.updateEntityPlates();
    expect(q.calls).toEqual([]);                          // :3379-3385 仅 objType 1/5
    st.setTileSilent(8, 20, PAD);
    const a = plateShell(w, [shot(3)]); a.g.updateEntityPlates();
    expect(a.calls).toEqual([[8, 20]]);                   // 442 仅 objType 4（:3287-3346）
    const b = plateShell(w, [shot(4, { w: 31, h: 31, projId: 1047 })]); b.g.updateEntityPlates();
    expect(b.calls).toEqual([]);                          // 巨石族 FPD=false → flag4 禁 objType 4（:19974）
  });
  it('风格 5 压板 objType4 禁、objType3 巨石族可触（:3361-3368 + :17195 白名单）', () => {
    const w = new World(80, 80, 7, 't'); const st = w.store;
    st.setTileSilent(8, 20, PLATE); st.frameY[st.idx(8, 20)] = 90;
    const o = plateShell(w, [shot(1)]); o.g.updateEntityPlates();
    expect(o.calls).toEqual([]);
    const b = plateShell(w, [shot(2, { w: 31, h: 31, projId: 99 })]); b.g.updateEntityPlates();
    expect(b.calls).toEqual([[8, 20]]);
  });
  it('tileCollide=false 非 FPD 弹不扫；FPD=true（37 炸弹）无碰撞态仍扫（:19977 tileCollide|flag5）', () => {
    const w = new World(80, 80, 7, 't'); w.store.setTileSilent(8, 20, PLATE);
    const c = plateShell(w, [shot(1, { tileCollide: false, projId: 151 })]); c.g.updateEntityPlates();
    expect(c.calls).toEqual([]);
    const d = plateShell(w, [shot(2, { tileCollide: false, projId: 37 })]); d.g.updateEntityPlates();
    expect(d.calls).toEqual([[8, 20]]);
  });
  it('442 取向读 frameX/22（Collision.cs:3287）且豁免脚带门（:3321 flag）——右带 pad 侧带可触', () => {
    const w = new World(80, 80, 7, 't'); const st = w.store;
    st.setTileSilent(8, 20, PAD); st.frameX[st.idx(8, 20)] = 66;   // 右带装（WorldGen.cs:87463）
    const r = plateShell(w, [{ x: 8 * TILE + 8, y: 20 * TILE - 4, w: 8, h: 8, id: 1 }]);
    r.g.updateEntityPlates();
    expect(r.calls).toEqual([[8, 20]]);
  });
  it('机关巨石（TrapShot kind，无 projId）按 vid 99 归 objType 3：垫板不触/风格 5 板可触', () => {
    const w = new World(80, 80, 7, 't'); const st = w.store;
    st.setTileSilent(8, 20, PAD);
    const a = plateShell(w, [{ x: 8 * TILE + 2, y: 20 * TILE + 2, w: 31, h: 31, id: 1, kind: 'boulder' }]);
    a.g.updateEntityPlates();
    expect(a.calls).toEqual([]);                          // FPD[99]=false → 禁 objType 4
    st.setTileSilent(8, 20, PLATE); st.frameY[st.idx(8, 20)] = 90;
    const b = plateShell(w, [{ x: 8 * TILE + 2, y: 20 * TILE + 2, w: 31, h: 31, id: 2, kind: 'boulder' }]);
    b.g.updateEntityPlates();
    expect(b.calls).toEqual([[8, 20]]);
  });
});

describe('SW-AO1②: TownNPC.hurt 大伤害门专家 ×15（NPC.cs:82255-82259）', () => {
  const hooks = (w: World) => ({ world: w, addDamageNumber: () => {}, spawnParticles: () => {},
    playSfxFiles: () => {}, recLog: () => {}, behavioLog: () => {} } as unknown as GameHooks);
  const hit = (diff: number) => {
    const w = new World(40, 40, 20, 't'); w.difficulty = diff;
    const n = new TownNPC('guide', 10 * TILE, 11 * TILE);   // lifeMax 250 / def 30 / resist 0.5
    const hp0 = n.hp;
    n.hurt(35, 10, 0, hooks(w));                            // 实伤 35−30×0.5 = 20
    return { dealt: hp0 - n.hp, vx: n.vx, vy: n.vy };
  };
  it('expert：20×15=300>250（×10=200≤250 不致）→ 大伤害门叠加钳 + vy=−kb×0.75', () => {
    const r = hit(1);
    expect(r.dealt).toBe(20);
    expect(r.vx).toBe(5); expect(r.vy).toBe(-3.75);         // kb=10×0.5=5
  });
  it('classic：20×10=200≤250 → 常规门 vx=kb·dir·resist（位次对照）', () => {
    const r = hit(0);
    expect(r.vx).toBe(2.5); expect(r.vy).toBe(-1.875);
  });
});
