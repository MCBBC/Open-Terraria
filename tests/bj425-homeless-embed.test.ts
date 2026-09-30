/**
 * ★BJ425 2026-10-01 回归锁（用户实报「发型师（Stylist Braianne）刷新在地牢入口的
 * 长梯位置里面——实心地牢砖、无足够刷新条件的空洞；小地图截图证实标记嵌在砖内」）。
 *
 * 定谳（机制级）：
 *   Game.updateTownNpcArrival ③ 流浪生成落位（旧 ±(30..80) 列/±20 行近似）三债同发：
 *   ① 锚池含 37 老人——vanilla SpawnHomelessNPC 锚数组 type!=37（WorldGen.cs:5019
 *      字面排除）；老人 home=地牢口 → 锚落 dungeonX 邻域、扫描列下探竖井。
 *   ② 落位无净空门 + isSolid 漏平台九件套（tileSolid[19]=true——长梯踏板不落、
 *      一路下探实心地牢砖）+ Bottom 传 (ay+1)*TILE=地面格【底边】（开阔地也嵌
 *      16px，与 SW-BJ37 旅行商②同款=其登记剩债）。
 *   ③ 扫描域越 worldSurface（vanilla :5060-5093 纵向钳 [bestY-n, worldSurface]——
 *      地牢竖井永不可达）。
 *   修复 = Housing.homelessWanderPlacement（WorldGen.cs:5037-5093 落位逐字：
 *   锚行走查→30 掷同层列→菱形扩环，floor=nactive&&tileSolid 平台可落、净空=
 *   Collision.SolidTiles 3×3 平台不阻、纵向钳 worldSurface）+ Game 侧锚改
 *   anchorPool（滤 37）+ 生成几何 NewNPC Bottom=(num8*16,num9*16) 顶边锚。
 *   本文件以 Housing 纯函数驱动（Game 无 DOM 不可构造，同 sw-bj2 备案）；
 *   Game 侧胶水（锚池选择/几何换算）由 T4 源码自包含块钉死。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world/World';
import {
  homelessWanderPlacement,
} from '../src/world/Housing';
import { spawnTileSolid, solidTilesCell } from '../src/world/spawn/VanillaSpawner';
import { TILE_BY_KEY } from '../src/data/tiles';

const DIRT = TILE_BY_KEY['dirt']!;
const BRICK = TILE_BY_KEY['v_41_blue_brick']!;   // 地牢蓝砖（sheet 41）
const PLAT = TILE_BY_KEY['platform']!;           // 平台 19（tileSolid=true/tileSolidTop=true）

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 手建场景：地表台地 + 地牢入口竖井（长梯=平台踏板）——用户实报几何。
 *  注：测试域 World 构造【无地形】（worldgen 不跑,全空仓——同 sw-bj2 备案），
 *  另铺全域基岩板（rows 324-329,竖井带断开）供菱形扫描确定性命中。 */
function buildDungeonEntrance(w: World, ws: number): void {
  const st = w.store;
  // 全域基岩板（扫描窗 [10,330) 内的确定性地板;竖井带 [593,614] 断开——该带由
  // 竖井本体/砖壁接管）
  for (let x = 10; x < 4190; x++) {
    if (x >= 593 && x <= 614) continue;
    for (let y = 324; y <= 329; y++) st.setTileSilent(x, y, DIRT, 0, 0);
  }
  // 地表台地 x∈[575,615]，地面行 y=320（上 3 行空气）
  for (let x = 575; x <= 615; x++) {
    for (let y = 320; y <= 340; y++) st.setTileSilent(x, y, DIRT, 0, 0);
    for (let y = 300; y <= 319; y++) st.setTileSilent(x, y, 0, 0, 0);
  }
  // 地牢入口竖井 x∈[600,607]：自 321 开挖到 419（穿过台地下方），两壁地牢砖
  for (let y = 321; y <= 419; y++) {
    for (let x = 600; x <= 607; x++) st.setTileSilent(x, y, 0, 0, 0);
    st.setTileSilent(599, y, BRICK, 0, 0);
    st.setTileSilent(608, y, BRICK, 0, 0);
  }
  // 竖井底地牢砖（420 起整片实心——旧扫描若下探到此即嵌砖）
  for (let y = 420; y <= 440; y++) for (let x = 595; x <= 612; x++) st.setTileSilent(x, y, BRICK, 0, 0);
  // 长梯踏板：平台行每 6 行横穿竖井（tileSolid[19]=true——原版菱形扫描可落踏板）
  for (let y = 326; y <= 416; y += 6) for (let x = 600; x <= 607; x++) st.setTileSilent(x, y, PLAT, 0, 0);
  void ws;
}

/** 落位结构有效性（vanilla 受理不变量：floor=tileSolid 行 + 上 3 行净空 + 无液） */
function expectValidLanding(
  w: World, r: NonNullable<ReturnType<typeof homelessWanderPlacement>>, ws: number,
): void {
  const st = w.store;
  expect(spawnTileSolid(st, r.spawnX, r.spawnY)).toBe(true);      // 落位行必是"地板"（实心/平台）
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -3; dy <= -1; dy++) {
      expect(solidTilesCell(st, r.spawnX + dx, r.spawnY + dy)).toBe(false);  // 3×3 净空
    }
  }
  for (let dy = -3; dy <= -1; dy++) {
    expect(st.liquid[st.idx(r.spawnX, r.spawnY + dy)]).toBe(0);   // 上 3 行无液
  }
  expect(r.spawnY).toBeLessThanOrEqual(ws);                       // 纵向钳 worldSurface
}

describe('BJ425 流浪落位核 homelessWanderPlacement（SpawnHomelessNPC WorldGen.cs:5037-5093 1:1）', () => {
  it('T1 长梯场景：地牢入口锚的流浪落位必为「地板行+3×3 净空+无液」，且不越过 worldSurface（旧码嵌竖井砖）', () => {
    const w = new World(4200, 1200, 51, 'open');
    buildDungeonEntrance(w, 330);
    for (const c of [0.001, 0.25, 0.5, 0.75, 0.999]) {
      const r = homelessWanderPlacement(w.store, 595, 320, 330, [], () => c);
      expect(r).not.toBeNull();
      expectValidLanding(w, r!, 330);
      // homeTile 锚 =（掷列, 锚地行）（:5107-5108 quirk——非落位列）
      expect(r!.homeY).toBe(320);
      // 落点不在竖井/砖壁带（600..608）——旧码在该带嵌实心地牢砖
      expect(r!.spawnX < 599 || r!.spawnX > 608).toBe(true);
    }
  });

  it('T2 地下平台锚（worldSurface 门关）：锚行走查认平台为地（tileSolidTop），落位=平台地板行本身（非 +1 嵌行）', () => {
    const w = new World(4200, 1200, 51, 'open');
    const st = w.store;
    // 地下空洞：平台行 y=400 x∈[600,607]，上方 3 行空气，锚列 603
    for (let y = 390; y <= 430; y++) for (let x = 590; x <= 617; x++) st.setTileSilent(x, y, 0, 0, 0);
    for (let x = 600; x <= 607; x++) st.setTileSilent(x, 400, PLAT, 0, 0);
    // rand=0.999 → 掷列 = 右端 607（离锚列 ≥2，m=0 即受理）
    const r = homelessWanderPlacement(w.store, 603, 400, 330, [], () => 0.999);
    expect(r).not.toBeNull();
    expect(r!.spawnX).toBe(607);
    expect(r!.spawnY).toBe(400);                                   // ★嵌砖判别：地板行本身（旧码=401）
    expect(r!.homeX).toBe(607);
    expect(r!.homeY).toBe(400);
    expect(r!.dir).toBe(0);                                        // 落位列==掷列 → 不改向
    expect(st.type[st.idx(607, 400)]).toBe(PLAT);                  // 平台=合法"地板"（tileSolid 表语义）
  });

  it('T3 菱形扩环可落「长梯踏板」：扫描列首个 tileSolid 行=平台行（nactive&&tileSolid），落踏板顶；dir=-1 朝家', () => {
    const w = new World(4200, 1200, 51, 'open');
    const st = w.store;
    // 地表台地同 T1（锚 595,320）；掷列 rand=0.999 → bestX=604
    buildDungeonEntrance(w, 330);
    // 扫描首列 = bestX+40 = 644：刻出空中平台行 y=310（x∈[642,646]），列内 [300,330) 其余全空
    for (let y = 295; y <= 335; y++) for (let x = 642; x <= 646; x++) st.setTileSilent(x, y, 0, 0, 0);
    for (let x = 642; x <= 646; x++) st.setTileSilent(x, 310, PLAT, 0, 0);
    const r = homelessWanderPlacement(w.store, 595, 320, 330, [], () => 0.999);
    expect(r).not.toBeNull();
    expect(r!.spawnX).toBe(644);                                   // n=20 首列（side 0 = +2n）
    expect(r!.spawnY).toBe(310);                                   // 平台行 = tileSolid 地板 → 落踏板顶
    expect(st.type[st.idx(644, 310)]).toBe(PLAT);
    expect(r!.homeX).toBe(604);
    expect(r!.dir).toBe(-1);                                       // num8(644) > bestX(604) → 朝家向左
  });

  it('T4 锚列低顶（净空门）：锚列上 3 格有实心 → 行走查不延展、掷列保锚，最终落位仍结构有效', () => {
    const w = new World(4200, 1200, 51, 'open');
    buildDungeonEntrance(w, 330);
    const st = w.store;
    st.setTileSilent(595, 318, DIRT, 0, 0);                        // 锚列上 2 行压实心 → walkCol(595) 败
    for (const c of [0.001, 0.5, 0.999]) {
      const r = homelessWanderPlacement(w.store, 595, 320, 330, [], () => c);
      expect(r).not.toBeNull();
      expectValidLanding(w, r!, 330);
    }
  });

  it('T8 扫描失败泄漏怪癖（原版字面,num8/num9 方法级外泄,照抄 BJ37 旅行商先例）：空域全列无效 → 落最后一次尝试位;调用方越界守卫弃生成', () => {
    const w = new World(4200, 1200, 51, 'open');                   // 全空世界（无任何地形）
    const r = homelessWanderPlacement(w.store, 595, 320, 330, [], () => 0.999);
    // 行走查败（无地）→ bestX=595;n=499 side1 列 = 595-998 = -403（越界,行循环
    // 未跑,num9 停在 side0 列的 num12-1=329）——NewNPC(-403*16, 329*16) vanilla 字面
    expect(r).toEqual({ spawnX: -403, spawnY: 329, homeX: 595, homeY: 320, dir: 1 });
    // Game 侧守卫：spawnX ≤ 3 → 放弃生成（本仓 TileStore 无世界外格,登记差异）
  });
});

describe('BJ425 Game 侧胶水自包含块钉死（37 锚排除 + NewNPC 顶边几何 + 宠物脚底锚）', () => {
  const src = () => readFileSync(join(GAME_ROOT, 'src/core/Game.ts'), 'utf8');

  it('T5 流浪锚 = anchorPool（:5019 type!=37 字面——老人 home=地牢口不可作锚）', () => {
    const s = src();
    expect(s).toContain('anchorPool[Math.floor(Math.random() * anchorPool.length)]');
    expect(s).not.toContain('homes[Math.floor(Math.random() * homes.length)]');
  });

  it('T6 流浪生成几何 = NewNPC Bottom 顶边锚（脚底=地面格顶；旧 (ay+1)*TILE 底边嵌 16px 禁回潮）', () => {
    const s = src();
    expect(s).toContain('homelessWanderPlacement(');
    expect(s).toContain('npc.x = placed.spawnX * TILE - npc.w / 2;');
    expect(s).toContain('new TownNPC(pick, placed.spawnX * TILE, placed.spawnY * TILE)');
    expect(s).not.toContain('(ay + 1) * TILE');                    // 旧嵌砖锚全仓绝迹
  });

  it('T7 宠物落位同族修：脚底 ay*TILE + spawnSpace 2×3 净空窗', () => {
    const s = src();
    expect(s).toContain('new TownNPC(pick, ax * TILE + 8, ay * TILE)');
    expect(s).toContain('spawnTileSolid(st, ax + dx, ay + dy)');
  });
});
