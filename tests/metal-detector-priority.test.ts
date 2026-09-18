// 金属探测器（Metal Detector 3102）扫描/优先级判别（SceneMetrics.UpdateOreFinder
// SceneMetrics.cs:874-902 + 优先级表 Main.cs:6355-6391，1457=1458 逐条同值）：
//  ① 语义=全窗内优先级最高者胜；同优先级取距扫描中心平方最近；同优先级同距离=
//    原版首扫到者（X 外层升序/Y 内层升序 → (X,Y) 字典序首个）
//  ② 用户实报（2026-09-18）根因=优先级表 sheet 键被内部 id 直查：
//    叶绿矿(sheet211/内部40)恒 0 不可探测、火把(内部12)撞 sheet12 生命水晶(550)
//  ③ 有效性门 isValidForOreFinder(:904-918)：227 染料植物限 272≤fx≤374、
//    129 水晶碎晶限 fx≥324（大晶簇帧）
//  ④ bestOreSheet 输出域=原版 sheet id（消费端 Lang.tileName 按 sheet 键解析）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { scanScene } from '../src/world/SceneMetrics';
import { TILE_BY_KEY } from '../src/data/tiles';

const CHLORO = TILE_BY_KEY['ore_chlorophyte']!;            // sheet 211, 优先级 700
const HEART = TILE_BY_KEY['crystal_heart']!;               // sheet 12（生命水晶）, 550
const TORCH = TILE_BY_KEY['torch']!;                       // sheet 4 —— 不在表内
const GOLD = TILE_BY_KEY['ore_gold']!;                     // sheet 8, 260
const METEOR = TILE_BY_KEY['ore_meteorite']!;              // sheet 37, 400
const FOSSIL = TILE_BY_KEY['desert_fossil']!;              // sheet 404, 150
const STURDY = TILE_BY_KEY['v_407_sturdy_fossil_block']!;  // sheet 407, 150
const DYE = TILE_BY_KEY['v_227_dye_plants']!;              // sheet 227, 750（帧门）
const SHARD = TILE_BY_KEY['v_129_crystal_shard']!;         // sheet 129, 675（帧门）

function makeWorld(): World {
  const w = new World(400, 400, 42, 'metaldetector');
  w.groundLevel = 120; w.rockLevel = 200;
  return w;
}

/** 以玩家中心 (cx,cy)（tile 坐标）扫描，返回 bestOre 三元组 */
function scan(w: World, cx: number, cy: number) {
  const s = scanScene(w, cx * 16, cy * 16, 0);
  return { sheet: s.bestOreSheet, x: s.bestOreX, y: s.bestOreY };
}

describe('金属探测器优先级（SceneMetrics.UpdateOreFinder 1:1）', () => {
  it('★实报场景：窗内叶绿矿+生命水晶并存 → 显示叶绿矿（700 > 550，距离无关）', () => {
    const w = makeWorld();
    // 生命水晶更近（d²=1），叶绿矿更远（d²=25）——原版仍报叶绿矿
    w.store.setTileSilent(199, 99, HEART, 0, 0);
    w.store.setTileSilent(204, 100, CHLORO, 0, 0);
    const r = scan(w, 200, 100);
    expect(r.sheet).toBe(211);
  });

  it('高级别远胜低级别近：陨石(400,d²=64) 压 金矿(260,d²=1)', () => {
    const w = makeWorld();
    w.store.setTileSilent(201, 100, GOLD, 0, 0);
    w.store.setTileSilent(208, 100, METEOR, 0, 0);
    expect(scan(w, 200, 100).sheet).toBe(37);
  });

  it('同优先级取近：坚固化石(d²=1) 胜 沙漠化石(d²=2)（150=150;近者后扫到）', () => {
    const w = makeWorld();
    w.store.setTileSilent(199, 99, FOSSIL, 0, 0);    // d²=2，y=99 行先扫
    w.store.setTileSilent(201, 100, STURDY, 0, 0);   // d²=1，后扫到但更近
    const r = scan(w, 200, 100);
    expect(r.sheet).toBe(407);
    expect(r.x).toBe(201); expect(r.y).toBe(100);
  });

  it('同优先级同距离=(X,Y) 字典序首个（原版 X 外层/Y 内层扫描序）', () => {
    const w = makeWorld();
    // (202,100) d²=4 与 (200,102) d²=4：字典序 x=200 列先行 → (200,102) 胜
    w.store.setTileSilent(202, 100, FOSSIL, 0, 0);
    w.store.setTileSilent(200, 102, STURDY, 0, 0);
    const r = scan(w, 200, 100);
    expect(r.sheet).toBe(407);
    expect(r.x).toBe(200); expect(r.y).toBe(102);
  });

  it('★火把不再是「生命水晶」：只有火把在窗内 → 无珍宝（-1）', () => {
    const w = makeWorld();
    w.store.setTileSilent(199, 99, TORCH, 0, 0);
    w.store.setTileSilent(201, 101, TORCH, 0, 0);
    expect(scan(w, 200, 100).sheet).toBe(-1);
  });

  it('空窗 → -1（GameUI.NoTreasureNearby 灰行）', () => {
    expect(scan(makeWorld(), 200, 100).sheet).toBe(-1);
  });

  it('isValidForOreFinder：染料植物(sheet227) 仅 272≤fx≤374 可探', () => {
    const w1 = makeWorld();
    w1.store.setTileSilent(200, 100, DYE, 200, 0);   // 门区间外(下) → 不可探
    expect(scan(w1, 200, 100).sheet).toBe(-1);
    const w2 = makeWorld();
    w2.store.setTileSilent(200, 100, DYE, 340, 0);   // 门区间内 → 探出 227
    expect(scan(w2, 200, 100).sheet).toBe(227);
    const w3 = makeWorld();
    w3.store.setTileSilent(200, 100, DYE, 272, 0);   // 左端含边界
    expect(scan(w3, 200, 100).sheet).toBe(227);
    const w4 = makeWorld();
    w4.store.setTileSilent(200, 100, DYE, 375, 0);   // 右端排他
    expect(scan(w4, 200, 100).sheet).toBe(-1);
  });

  it('isValidForOreFinder：水晶碎晶(sheet129) 仅 fx≥324（大晶簇）可探', () => {
    const w1 = makeWorld();
    w1.store.setTileSilent(200, 100, SHARD, 306, 0); // 小碎晶 → 不可探
    expect(scan(w1, 200, 100).sheet).toBe(-1);
    const w2 = makeWorld();
    w2.store.setTileSilent(200, 100, SHARD, 324, 0); // 大晶簇 → 675
    expect(scan(w2, 200, 100).sheet).toBe(129);
  });

  it('帧门不可探 tile 让位真矿：门内 129(675) 胜门外 227', () => {
    const w = makeWorld();
    w.store.setTileSilent(200, 102, DYE, 200, 0);    // 750 级但门外 → 0
    w.store.setTileSilent(200, 100, SHARD, 324, 0);  // 675 级门内
    expect(scan(w, 200, 100).sheet).toBe(129);
  });
});
