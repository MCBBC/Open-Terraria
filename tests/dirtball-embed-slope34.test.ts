// ★SW-AN1 2026-09-05 新回归（SW-AH1 残差备案①"slope3/4 侧向嵌入原版次拍死于坡底
// 面"的销案钉面）：SlopeCollision(Collision.cs:1796-2040)对 type17【全程不可达】——
// HandleMovement 的 aiStyle10 干路只走 TileCollision(Projectile.cs:17701-17720,该
// if/else-if 链里 SlopeCollision 仅存于 wet 支 :17767 与非 aiStyle10 子步支
// :17856/:17916/:17963)；而 type17 SetDefaults ignoreWater=true(:993) ⇒
// NewProjectile :10887-10891 强制 wet=false、Update :16895 `if(!ignoreWater)` 整段
// 跳过 WetCollision ⇒ wet 恒假 ⇒ SlopeCollision 的 slope3/4 下推解析(:1883-:1922)
// 对泥球零适用面。⇒ 弹与坡 3/4 的原版唯一机制=TileCollision 四 face(:2388/:2406/
// :2426/:2446 全要求旧位盒完全在格一侧)+坡门 flag3(:2361-2370):
//   · 坡 3 整脸(左)/坡 4 整脸(右)侧跨入 → face 钳+Kill(与整砖同);
//   · 剪角脸侧跨入(flag3 放行)或旧位已重叠(嵌入) → 不 Kill,原速续行,直至跨入
//     【新】实心面才 Kill——本仓 faceClamp 现行为即原版逐值,补"坡底 Kill"反破
//     parity。钉面以下四案;坡 3/4 不被 AI_010 削平链触及(topSlope=Tile.cs:292-300
//     只认 1/2,Projectile.cs:59044)。融合拍序/世界 h=120 理由见 dirtball-embed-blast
//     头注。逐拍公式:y(k)=y0+0.205k(k+1)(盒顶,vy(k)=0.41k)、x(k)=x0+6k(vx=6 案)。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { DirtBallProj } from '../src/entities/DirtBallProj';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

const DIRT = TILE_INTERNAL_BY_SHEET.get(0)!;
const CX = 40 * 16 + 8;   // 648

interface Env {
  drops: Array<{ x: number; y: number; key: string }>;
  sfx: string[];
}

function mkEnv(): { w: World; g: GameHooks; env: Env; restore: () => void } {
  const w = new World(80, 120, 30, 'open');   // h−40=80 扫描端钳(Collision.cs:2317-2318)
  const env: Env = { drops: [], sfx: [] };
  const g = {
    world: w, player: null, enemies: () => [], critters: () => [],
    cutTile: () => {},
    playSfx: (name: string) => { env.sfx.push(name); },
    spawnDrop: (x: number, y: number, key: string) => { env.drops.push({ x, y, key }); return null; },
    spawnDust: () => null,
  } as unknown as GameHooks;
  const orig = Math.random;
  Math.random = () => 0.9;              // 全静默(不断言尘计数)
  return { w, g, env, restore: () => { Math.random = orig; } };
}

/** 跑到死亡,返回 1-based Kill 拍;上限 200 拍 */
function runToDeath(p: DirtBallProj, g: GameHooks): number {
  for (let t = 1; t <= 200; t++) {
    p.fixedUpdate(0, g);
    if (p.dead) return t;
  }
  expect(p.dead).toBe(true);
  return -1;
}

describe('SW-AN1 坡 3/4 侧嵌/整脸钉面（原版=SlopeCollision 不可达,TileCollision 逐值）', () => {
  it('坡 3 整脸(左)侧跨入：flag3 假(:2363 x≥tx4 不成立) → :2406 左支钳 rx=0 → T6 Kill,贴脸铺设邻格', () => {
    const { w, g, env, restore } = mkEnv();
    try {
      w.store.setTileSilent(40, 40, DIRT, 0, 0);
      w.store.setSlope(40, 40, 3);                 // 悬顶坡:左脸全高实心
      const p = new DirtBallProj(605, 631, 6, 0, () => null, 'v_2');
      // 盒[600,610]×[626,636] 右行;x(k)=600+6k,y(k)=626+0.205k(k+1)。
      // T5:旧右缘 634,新右缘 640 不>640(严格)→ 不钳;T6:旧盒[630,640]全在脸左,
      // flag3=632.15+6≥640 不成立(x=630<640 亦不成立) → 左支 rx=640−640=0 → Kill。
      // 死亡位=(630+0,632.15+2.46)=(630,634.61) → 爆心(635,639.61) → 中心行 39
      // → 格(39,39)空 → 铺泥;下方(39,40)无半砖/坡 → 复原支空转(:79280-79287)。
      const killTick = runToDeath(p, g);
      expect(killTick).toBe(6);
      expect(w.store.get(39, 39)).toBe(DIRT);      // 爆心格(39,39)铺泥
      expect(w.store.get(39, 40)).toBe(0);         // 中心行以下不误铺
      expect(w.store.get(40, 40)).toBe(DIRT);      // 坡 3 格原样(未削平:slope 非 1/2)
      expect(w.store.slope[w.store.idx(40, 40)]).toBe(3);
      expect(env.drops).toEqual([]);               // 落点空 → 零掉落
      expect(env.sfx).toEqual(['dig']);
    } finally {
      restore();
    }
  });

  it('坡 4 剪角脸(左)侧跨入：flag3 真(:2367)跳格不 Kill → 嵌入续行 → T14 跨入下方地皮 down 支 Kill', () => {
    const { w, g, env, restore } = mkEnv();
    try {
      w.store.setTileSilent(40, 40, DIRT, 0, 0);
      w.store.setSlope(40, 40, 4);                 // 悬顶坡:左脸=剪角(右脸才全高)
      for (let x = 30; x < 50; x++) w.store.setTileSilent(x, 43, DIRT, 0, 0);   // 地皮带[688,704]
      const p = new DirtBallProj(605, 645, 6, 0, () => null, 'v_2');
      // 盒[600,610]×[640,650] 右行下坠。T6 跨入左脸:旧盒[630,640]×[646.15,656.15],
      // flag3=646.15+6≥640 且 x+W=640≤656 → 跳格 → 零钳不 Kill(T7-T9 嵌入态四支
      // 全不触发,T9 起 x+W>656 flag3 转假仍嵌入不可见);T14:旧盒底 677.31+10=
      // 687.31≤688<新盒底 693.05 → 地皮 down 支 ry=0.69 → Kill。死亡盒
      // [684,694]×[678,688](盒底贴面) → 爆心(689,683) → 格(43,42)空(面上一行)
      // → 铺泥贴地皮带顶;下方(43,43)整砖无半砖/坡 → 复原支空转(:79280-79287)。
      const killTick = runToDeath(p, g);
      expect(killTick).toBe(14);                   // 非 T6(剪角脸零 Kill)、非 T2
      expect(w.store.slope[w.store.idx(40, 40)]).toBe(4);   // 坡 4 原样未被削平
      expect(env.drops).toEqual([]);               // 落点(43,42)空 → 铺设不掉落
      expect(w.store.get(43, 42)).toBe(DIRT);      // 贴地皮带顶铺泥
      expect(w.store.get(43, 43)).toBe(DIRT);      // 地皮原格不变
    } finally {
      restore();
    }
  });

  it('出生嵌坡 3 格(无地皮)：30 拍不 Kill、整体穿出坡格底——嵌入不可见即原版(销案反证钉面)', () => {
    const { w, g, env, restore } = mkEnv();
    try {
      w.store.setTileSilent(40, 40, DIRT, 0, 0);
      w.store.setSlope(40, 40, 3);                 // 弹盒[643,653]×[634,644] 出生即嵌
      const p = new DirtBallProj(CX, 639, 0, 0, () => null, 'v_2');
      // T2-T5:旧位盒与坡格盒重叠 → 四支全不触发(flag3 虽假也不入支);T6 起
      // flag3 真(640.15+0≥640 且 643≥640)跳格。若按 SW-AH1 误诊"次拍死于坡底面"
      // 则 T2 即死——本钉面翻转。
      for (let t = 0; t < 30; t++) p.fixedUpdate(0, g);
      expect(p.dead).toBe(false);
      expect(p.y).toBeGreaterThan(656);            // 盒顶过坡格底(656)=完全穿出
      expect(w.store.slope[w.store.idx(40, 40)]).toBe(3);   // AI_010 削平链只认 topSlope
      expect(env.drops).toEqual([]);               // 未 Kill → 无铺设无掉落
      expect(env.sfx).toEqual([]);
    } finally {
      restore();
    }
  });

  it('出生嵌坡 3 格(下方地皮)：不死于坡格, T15 跨入地皮面 Kill → 铺泥贴地皮带顶(面上一行)', () => {
    const { w, g, env, restore } = mkEnv();
    try {
      w.store.setTileSilent(40, 40, DIRT, 0, 0);
      w.store.setSlope(40, 40, 3);
      for (let x = 30; x < 50; x++) w.store.setTileSilent(x, 43, DIRT, 0, 0);
      const p = new DirtBallProj(CX, 639, 0, 0, () => null, 'v_2');   // 盒顶 634
      // y(k)=634+0.205k(k+1):T14 旧盒底 681.31,新盒底 687.05≤688 不重叠;T15 旧盒底
      // 687.05≤688<新盒底 693.2 → down 支 ry=0.95 → Kill。死亡盒[643,653]×[678,688]
      // (盒底贴面) → 爆心(648,683) → 格(40,42)空(面上一行) → 铺泥贴地皮带顶。
      const killTick = runToDeath(p, g);
      expect(killTick).toBe(15);
      expect(env.drops).toEqual([]);               // 落点(40,42)空 → 铺设不掉落
      expect(w.store.get(40, 42)).toBe(DIRT);      // 贴地皮带顶铺泥
      expect(w.store.get(40, 43)).toBe(DIRT);      // 地皮原格不变
      expect(w.store.slope[w.store.idx(40, 40)]).toBe(3);
    } finally {
      restore();
    }
  });
});
