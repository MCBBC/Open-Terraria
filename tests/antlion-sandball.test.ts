// 蚁狮沙球（proj 31，ProjectileID.SandBallFalling 敌版 ai[0]=2）回归：
// 用户实报"蚁狮发射的东西不对"。标杆 Projectile.cs——AI_010 ai[0]==2 档
// （:55081-55100）：重力 0.2 + vx 侧摩 ±0.04 向 0 收 + vy 钳 10（曾误用
// ai[0]==1 落地态的 0.41=坠速翻倍）；spin 0.1 恒速（:55158）；timeLeft 300；
// 落地放沙 53（:75430-75536 PlaceTile，轨道314/传送带421-422 不放）；
// 沿途 KillTile 清单（:55106-55136）：12/105/165/178/185-187/639/665。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Dart } from '../src/entities/Dart';
import { TILE_BY_KEY, VANILLA_TILE_ID } from '../src/data/tiles';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import type { World as WorldT } from '../src/world/World';

const W = 120, H = 60, FLOOR = 50;

function makeWorld(): World {
  const w = new World(W, H, 11, 'sandball');
  const st = w.store;
  for (let x = 0; x < W; x++) st.setTile(x, FLOOR, 1);
  return w;
}

interface Rec { breaks: Array<[number, number]>; }
function makeHooks(w: World): { hooks: GameHooks; rec: Rec } {
  const rec: Rec = { breaks: [] };
  const player = new Player(80 * TILE, (FLOOR - 4) * TILE, new Inventory());
  const hooks = {
    world: w, player,
    enemies: () => [], critters: () => [], npcs: () => [],
    damagePlayer: (): number => 0, spawnDrop: () => null, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    spawnBurst: () => {}, addLightAt: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    breakTile: (x: number, y: number) => { rec.breaks.push([x, y]); w.store.setTile(x, y, 0); },
    scene: { zoneGraveyard: false },
    entities: { nextId: 1, add: () => {} },
  } as unknown as GameHooks;
  return { hooks, rec };
}

function step(d: Dart, h: GameHooks, n: number): void {
  for (let i = 0; i < n && !d.dead; i++) d.fixedUpdate(1 / 60, h);
}

describe('沙球物理（AI_010 ai[0]==2 档 :55081-55100）', () => {
  it('重力 0.2（曾误 0.41）+ vy 钳 10', () => {
    const w = makeWorld();
    const { hooks } = makeHooks(w);
    const d = new Dart(60 * TILE, 10 * TILE, 0, 0, 10, 31);
    d.hostile = true;
    // 空旷垂直下落 5 tick：vy = 0.2×5 = 1.0（0.41 档会是 2.05）
    step(d, hooks, 5);
    expect(d.vy).toBeCloseTo(1.0, 4);
    // 长落钳 10（0.41 档钳 16）
    step(d, hooks, 200);
    expect(d.dead, '落到 FLOOR 上消亡').toBe(true);
  });

  it('vx 侧摩 ±0.04 向 0 收（水平缓停，弧线"飘"感来源）', () => {
    const w = makeWorld();
    const { hooks } = makeHooks(w);
    const d = new Dart(60 * TILE, 10 * TILE, 8, 0, 10, 31);
    d.hostile = true;
    step(d, hooks, 10);
    expect(d.vx).toBeCloseTo(8 - 0.4, 4);   // 10 tick × 0.04
    // 摩到阈值内直接归零
    const d2 = new Dart(60 * TILE, 10 * TILE, 0.02, 0, 10, 31);
    step(d2, hooks, 1);
    expect(d2.vx).toBe(0);
  });

  it('寿命 300（原版 timeLeft，曾 600）', () => {
    const w = new World(W, H, 11, 'sandball-void');   // 全空世界：不触地
    const { hooks } = makeHooks(w);
    const d = new Dart(60 * TILE, 1 * TILE, 0, -0.01, 10, 31);
    let t = 0;
    while (!d.dead && t < 1000) { d.fixedUpdate(1 / 60, hooks); t++; }
    expect(t).toBe(300);
  });
});

describe('沙球落地放沙 + 沿途击碎（:75430-75536 / :55106-55136）', () => {
  it('落地在空格上 → 放沙（★本仓 id 域:原版 53 → TILE_BY_KEY.sand,曾硬编码 53=本仓第53号注册位）', () => {
    const w = makeWorld();
    const st = w.store;
    const { hooks } = makeHooks(w);
    const d = new Dart(60 * TILE, (FLOOR - 5) * TILE, 0, 2, 10, 31);
    step(d, hooks, 30);
    expect(d.dead).toBe(true);
    const cy = FLOOR - 1;   // 落点上一格
    expect(st.get(60, cy)).toBe(TILE_BY_KEY['sand']);
  });

  it('下方是轨道（原版 314 → 本仓 id）→ 不放沙', () => {
    const w = makeWorld();
    const st = w.store;
    st.setTile(60, FLOOR - 1, VANILLA_TILE_ID.get(314)!);   // 轨道占落点下方（本仓 id 域）
    st.setTile(60, FLOOR, TILE_BY_KEY['stone']!);
    const { hooks } = makeHooks(w);
    const d = new Dart(60 * TILE, (FLOOR - 5) * TILE, 0, 2, 10, 31);
    step(d, hooks, 30);
    expect(st.get(60, FLOOR - 2)).toBe(0);   // 未放沙
  });

  it('沿途击碎水晶/雕像/小石堆（原版 12/105/185 → 本仓 id,曾直比=真实世界永不命中）', () => {
    const w = makeWorld();
    const st = w.store;
    // 弹道路径上摆靶（x=60 列，从上往下穿过；★用本仓 id 摆放=真实世界真身）
    st.setTile(60, 10, VANILLA_TILE_ID.get(12)!);
    st.setTile(60, 15, VANILLA_TILE_ID.get(105)!);
    st.setTile(60, 20, VANILLA_TILE_ID.get(185)!);
    const { hooks, rec } = makeHooks(w);
    const d = new Dart(60 * TILE, 8 * TILE, 0, 3, 10, 31);
    step(d, hooks, 60);
    expect(rec.breaks.length).toBeGreaterThanOrEqual(3);
    expect(rec.breaks.some(([x, y]) => x === 60 && y === 10)).toBe(true);
    expect(rec.breaks.some(([x, y]) => x === 60 && y === 15)).toBe(true);
    expect(rec.breaks.some(([x, y]) => x === 60 && y === 20)).toBe(true);
  });
});

// ===================== ★④（2026-09-04 掉落/沙族批）沙球放置支 BBMSF 单源化 =====================
// 旧内联第 4 份副本 arm2 用 !isSolid（def.solid 域）代 !Main.tileSolid ——tileSolid∧
// tileSolidTop 九件套（19/239/380/427/435-439,Main.cs:10118-10136,含种植箱 380）被漏。
// 可观测面（落弹直落时死亡格下方恒=落面本身,arm2 无差）=水平切入:弹横移撞墙,死亡格
// =上一帧中心格,其正下=种植箱 → vanilla arm2（tileSolid[380]=true）不塌 → 照常放沙;
// 旧内联误判"沙塌"不放。
describe('★④ 沙球放置 BBMSF 单源（arm2 九件套 tileSolid 域）', () => {
  // 几何：沙球有重力 0.2/tick（ai[0]==2 档）→ 横移撞墙须 8 tick 内到位（下坠 <1 行）。
  // 弹从 cy=39*16+14+5=643（row40.2）出发 vx=3 → 死亡拍心 ∈ [61*16, 61*16+3) →
  // 上一帧中心格=(60,40),其正下 (60,41) 摆种植箱/工作台。（y=顶左锚,cy=y+h/2,h=10）
  it('死亡格正下=种植箱 380（tileSolid 九件套）→ arm2 不塌,沙放箱上', () => {
    const w = makeWorld();
    const st = w.store;
    st.setTile(60, 41, TILE_BY_KEY['v_380_planter_boxes']!, 0, 0);   // 种植箱（非 def.solid）
    st.setTile(61, 40, TILE_BY_KEY['stone']!, 0, 0);                 // 右侧石墙（横移撞点）
    const { hooks } = makeHooks(w);
    const d = new Dart(59 * TILE + 8, 39 * TILE + 14, 3, 0, 10, 31);
    d.hostile = true;
    step(d, hooks, 30);
    expect(d.dead).toBe(true);
    expect(st.get(60, 40)).toBe(TILE_BY_KEY['sand']);   // 箱上放沙（arm2 tileSolid[380]=true）
    expect(st.get(60, 41)).toBe(TILE_BY_KEY['v_380_planter_boxes']!);
  });

  it('对照:死亡格正下=悬空工作台（tileSolid=false 且再下格空）→ arm2 真 → 不放沙', () => {
    const w = makeWorld();
    const st = w.store;
    st.setTileSilent(60, 41, TILE_BY_KEY['workbench']!, 0, 0);
    st.setTile(61, 40, TILE_BY_KEY['stone']!, 0, 0);
    const { hooks } = makeHooks(w);
    const d = new Dart(59 * TILE + 8, 39 * TILE + 14, 3, 0, 10, 31);
    d.hostile = true;
    step(d, hooks, 30);
    expect(st.get(60, 40)).toBe(0);                   // BBMSF arm2（家具+再下空）→ 不放
  });
});
