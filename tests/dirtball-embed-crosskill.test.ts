// ★SW-AH1 2026-09-05 新回归（SW-N1 备案两翻转案的原版真值钉面）：出生嵌实心 →
// 嵌入不可见（Collision.cs 四 face 分支 :2388/:2406/:2426/:2446 全要求旧位盒完全
// 在格一侧;SlopeCollision 平坦格无动作 :1923）→ 原速下沉穿行（Projectile.cs
// UpdatePosition :20561）,弹底跨入【新】实心面那一拍才 down 钳+Kill（:18007 flag
// → :19964-19967 position+=velocity;Kill()）;死亡位=贴面 → 爆心=死亡位中心
// （:79120-79121）→ 嵌入深处案中心格落嵌入行 → occupied → num18 掉落支
// （:79298-79300）、零铺设。融合拍序与世界 h=120 理由见 dirtball-embed-blast 头注。
// 逐拍表（两案共用弹道,y(k)=634+0.205k(k+1) 盒顶,旧盒底=y+10,vy(k)=0.41k）:
//   T1 释放拍(tileCollide=false) y=634.41 | T2 635.23 | T3 636.46 | T4 638.10
//   T5 640.15 | T6 642.61 | T7 645.48(旧底 655.48) | T8 旧底 655.48≤656<新底 658.76
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { DirtBallProj } from '../src/entities/DirtBallProj';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

const DIRT = TILE_INTERNAL_BY_SHEET.get(0)!;
const CX = 40 * 16 + 8;

function mkEnv(): { w: World; g: GameHooks; drops: Array<{ x: number; y: number }> } {
  const w = new World(80, 120, 30, 'open');   // h−40=80 扫描端钳（Collision.cs:2317-2318）
  const drops: Array<{ x: number; y: number }> = [];
  const g = {
    world: w, player: null, enemies: () => [], critters: () => [],
    cutTile: () => {}, playSfx: () => {},
    spawnDrop: (x: number, y: number) => { drops.push({ x, y }); return null; },
    spawnDust: () => null,
  } as unknown as GameHooks;
  return { w, g, drops };
}

describe('SW-AH1 出生嵌实心 → 跨行 Kill/贯穿（原版逐拍对照）', () => {
  it('嵌 2 格厚墙：不死于释放拍,第 8 拍弹底跨入 row41 面 Kill → 掉落锚=贴面中心 651（嵌入行,occupied）,零铺设', () => {
    const { w, g, drops } = mkEnv();
    for (let x = 30; x < 50; x++) { w.store.setTileSilent(x, 40, DIRT, 0, 0); w.store.setTileSilent(x, 41, DIRT, 0, 0); }
    const p = new DirtBallProj(CX, 639, 0, 0, () => null, 'v_2');   // 盒[634,644] 嵌 row40
    let killTick = -1;
    for (let t = 1; t <= 200; t++) { p.fixedUpdate(0, g); if (p.dead) { killTick = t; break; } }
    expect(killTick).toBe(8);                     // 非释放拍即死（旧码 T2 即 Kill）——跨行时机
    expect(drops).toHaveLength(1);                // 爆心格=嵌入行 40 → occupied → 掉落支(:79298)
    expect(drops[0].x).toBe(CX);
    expect(drops[0].y).toBeCloseTo(651, 6);       // 贴面:盒底=656(row41 顶) → 中心 656−5
    expect(w.store.get(40, 40)).toBe(DIRT);       // 嵌入行原格不变（零铺设）
    expect(w.store.get(40, 41)).toBe(DIRT);       // 跨入面原格不变
    expect(w.store.get(40, 39)).toBe(0);          // 面上邻格未铺
    expect(w.store.get(41, 39)).toBe(0);
  });

  it('嵌 1 格厚薄架（下空）：30 拍不 Kill、整体穿出架底（嵌入不可见）,零掉落零铺设', () => {
    const { w, g, drops } = mkEnv();
    for (let x = 30; x < 50; x++) w.store.setTileSilent(x, 40, DIRT, 0, 0);
    const p = new DirtBallProj(CX, 639, 0, 0, () => null, 'v_2');   // 同弹道,但 row41 空
    for (let t = 0; t < 30; t++) p.fixedUpdate(0, g);
    expect(p.dead).toBe(false);                   // 旧码 T2 即 Kill → 翻转案
    expect(p.y).toBeGreaterThan(656);             // 盒顶过架底(656)=完全穿出
    expect(w.store.get(40, 40)).toBe(DIRT);       // 薄架原格不变
    expect(drops).toEqual([]);                    // 未 Kill → 无铺设无掉落
  });
});
