// SW-L1 2026-09-03 蓝队二轮钉面 → ★SW-AH1 2026-09-05 重基线（原版 TileCollision
// 语义,SW-N1 备案清偿;标杆 Collision.cs:2299-2460 + Projectile.cs :17578/:19964/
// :17307/:58809-59083/:79119-79300）：
//  ① F1 重钉（正常落地=face-crossing）:弹自空气落向实心面,弹底【跨入】面那一拍
//     Kill（:2388 down 支旧位盒全侧条件 + Projectile.cs:18007 flag + :19966）,
//     死亡位=旧位+钳后速度=贴面（盒底=面顶）,铺设爆心=死亡位中心（:79120-79121）
//     → 中心格=面上邻接空气格 → PlaceTile 成功、零掉落
//  ② F7 flag2 重钉:同①弹道,落点下方 422 传送带 → 拒铺掉落锚=Center+(0,-2)
//     （:79293-79296）
//  ③ up 支钉面（新增）:上升弹顶跨入悬顶底面 → ry=面底−旧顶+0.01ε（:2451）→
//     死亡位盒顶=面底+0.01 → 爆心格=悬顶下一行（空）→ 铺泥挂顶下
//  ④ 半砖钉面（新增）:落在半砖面（:2350-2353 ty4+=8/num7=8）→ 死亡位盒底=半砖面
//     → 爆心格=半砖自身行 → 半砖上推（:79243-79246 nactive+halfBrick+vy>0+
//     |vy|>|vx|,读 Kill 时钳后速度）→ 上一行铺泥;且铺设后下方半砖复原
//     （:79280-79287 SlopeTile → half 清零）
//  ⑤ F8 BBMSF nactive 位（不变）
// 融合拍序尘计数:本仓 fixedUpdate=AI+移动同拍（全实体统一）,尘先于碰撞判定 →
// Kill 拍的飞行尘照出（原版 AI 在 HandleMovement 后、碰撞 Kill 拍不再跑 AI=少
// 1 尘;融合拍序差 ±1,钉面按融合拍序推导）。世界 h=120:原版 TileCollision Y 扫
// 描端钳 maxTilesY−40（Collision.cs:2317-2318）→ 行 ≥80 不扫,测试世界须 ≥120。
// 弹道确定性:出生即断链（provider null）→ 第 1 拍 tileCollide=false 仅重力,
// 第 2 拍起 face-crossing 判定;各案 Kill 拍见用例内逐拍表（y(k)=y0+0.205k(k+1),
// vy(k)=0.41k）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { DirtBallProj } from '../src/entities/DirtBallProj';
import { blockBelowMakesSandFall } from '../src/entities/FallingBlock';   // ★M13 A-2 单源化：BBMSF 实现迁 FallingBlock
const blockBelowMakesSandFallAt = blockBelowMakesSandFall;               // 旧名别名（本文件断言不改）
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

const DIRT = TILE_INTERNAL_BY_SHEET.get(0)!;
const BELT = TILE_INTERNAL_BY_SHEET.get(422)!;   // v_422 conveyor belt（solid;flag2 拦铺档）
const CX = 40 * 16 + 8;

interface Env {
  drops: Array<{ x: number; y: number; key: string }>;
  sfx: string[];
  dusts: number[];
}

function mkEnv(randomValue = 0.9): { w: World; g: GameHooks; env: Env; restore: () => void } {
  const w = new World(80, 120, 30, 'open');   // h=120:TileCollision Y 端钳 h−40=80（:2313-2314）,row 40-41 须可扫
  const env: Env = { drops: [], sfx: [], dusts: [] };
  const g = {
    world: w,
    player: null,
    enemies: () => [],
    critters: () => [],
    cutTile: () => {},
    playSfx: (name: string) => { env.sfx.push(name); },
    spawnDrop: (x: number, y: number, key: string) => { env.drops.push({ x, y, key }); return null; },
    spawnDust: (_x: number, _y: number, _w2: number, _h2: number, type: number) => {
      env.dusts.push(type); return null;
    },
  } as unknown as GameHooks;
  const orig = Math.random;
  Math.random = () => randomValue;      // 0 → 飞行尘每拍必出;0.9 → 全静默
  return { w, g, env, restore: () => { Math.random = orig; } };
}

/** 跑到死亡,返回 1-based Kill 拍（逐拍表锚）;200 拍不死则爆红 */
function runToDeath(p: DirtBallProj, g: GameHooks): number {
  for (let t = 1; t <= 200; t++) {
    p.fixedUpdate(0, g);
    if (p.dead) return t;
  }
  expect(p.dead).toBe(true);
  return -1;
}

describe('SW-AH1 Dirt Ball face-crossing Kill 钉面（原版 TileCollision 重基线）', () => {
  it('F1 重钉：弹底跨入实心面拍 Kill → 铺泥在面上邻接空气格、零掉落、Kill 音+尘', () => {
    const { w, g, env, restore } = mkEnv(0);        // random=0 → 尘每拍必出
    try {
      for (let x = 30; x < 50; x++) w.store.setTileSilent(x, 40, DIRT, 0, 0);
      const p = new DirtBallProj(CX, 629, 0, 0, () => null, 'v_2');   // 盒[624,634] 面=640
      // 逐拍:y(k)=624+0.205k(k+1),旧盒底=y+10;T5:旧底 638.1≤640<新底 640.15 → down 钳
      // ry=640−638.1=1.9 → Kill。死亡盒[630,640] 贴面 → 爆心(648,635) → 格(40,39)
      const killTick = runToDeath(p, g);
      expect(killTick).toBe(5);
      expect(w.store.get(40, 39)).toBe(DIRT);       // 铺在面顶邻接空气格 39（非面内格 40）
      expect(w.store.get(40, 40)).toBe(DIRT);       // 地面原格不变
      expect(w.store.get(39, 39)).toBe(0);          // flush 中心列=40,邻列不误铺
      expect(env.drops).toEqual([]);                // 落点空 → 必铺设不掉落
      expect(env.sfx).toEqual(['dig']);             // F6:PlaySound(0) 恰一次
      expect(env.dusts.filter((t) => t === 0)).toHaveLength(10);  // 融合拍序:5 拍飞行尘 + F6:Kill 5 尘
    } finally {
      restore();
    }
  });

  it('F7 flag2 重钉：落点下方 422 传送带 → 拒铺掉泥块锚=Center+(0,-2)=633', () => {
    const { w, g, env, restore } = mkEnv(0.9);
    try {
      for (let x = 30; x < 50; x++) w.store.setTileSilent(x, 40, BELT, 0, 0);
      const p = new DirtBallProj(CX, 629, 0, 0, () => null, 'v_2');   // 同 F1 弹道
      expect(runToDeath(p, g)).toBe(5);
      expect(w.store.get(40, 39)).toBe(0);          // flag2 拒铺
      expect(env.drops).toHaveLength(1);
      expect(env.drops[0].key).toBe('v_2');
      expect(env.drops[0].y).toBeCloseTo(633, 6);   // :79293-79296 Center+(0,-2),爆心 635
      expect(env.drops[0].x).toBe(CX);
    } finally {
      restore();
    }
  });

  it('up 支钉面：上升弹顶跨入悬顶底面 → +0.01ε 贴面 Kill → 铺泥挂顶下一行', () => {
    const { w, g, env, restore } = mkEnv(0);
    try {
      for (let x = 30; x < 50; x++) w.store.setTileSilent(x, 35, DIRT, 0, 0);   // 悬顶:带[560,576]
      const p = new DirtBallProj(CX, 640, 0, -12, () => null, 'v_2');   // 盒[635,645] 上抛
      // 逐拍:y(k)=635−Σ0.41i+0.41(k−1)…（初速−12,首拍即吃重力）旧盒顶=y;T6:旧顶
      // 581.15≥576 且新顶 571.61<576 → up 钳 ry=576−581.15+0.01=−5.14 → Kill。
      // 死亡盒顶=576.01（面底+ε）→ 爆心(648,581.01) → 格(40,36)
      const killTick = runToDeath(p, g);
      expect(killTick).toBe(6);
      expect(w.store.get(40, 36)).toBe(DIRT);       // 挂在悬顶下方空气格
      expect(w.store.get(40, 35)).toBe(DIRT);       // 悬顶原格不变
      expect(env.drops).toEqual([]);                // 铺设支零掉落
      expect(env.dusts.filter((t) => t === 0)).toHaveLength(11);  // 6 拍飞行尘 + Kill 5 尘
    } finally {
      restore();
    }
  });

  it('半砖钉面：落半砖面 → 爆心=半砖自身行 → 上推一行铺泥 + 下方半砖复原(:79280-79287)', () => {
    const { w, g, env, restore } = mkEnv(0.9);
    try {
      w.store.setTileSilent(40, 41, DIRT, 0, 0);
      w.store.setHalfBrick(40, 41, true);           // 半砖面=664（41*16+8）
      const p = new DirtBallProj(CX, 619, 0, 0, () => null, 'v_2');   // 盒[614,624]
      // 逐拍:y(k)=614+0.205k(k+1);T14:旧底 661.31≤664<新底 667.05 → down 钳 ry=2.69
      // → Kill。死亡盒[654,664] 贴半砖面 → 爆心(648,659) → 格(40,41)=半砖自身行
      // → :79243-79246 上推（vy=2.69>0 且 |vy|>|vx|=0）→ (40,40) 铺泥
      const killTick = runToDeath(p, g);
      expect(killTick).toBe(14);
      expect(w.store.get(40, 40)).toBe(DIRT);       // 上推后铺在半砖上一行
      expect(w.store.get(40, 41)).toBe(DIRT);       // 半砖格仍在（铺设目标已是 40 行）
      expect(w.store.half[w.store.idx(40, 41)]).toBe(0);  // :79280-79287 铺设后下方半砖复原
      expect(env.drops).toEqual([]);
      expect(env.sfx).toEqual(['dig']);
    } finally {
      restore();
    }
  });

  it('F8：BlockBelowMakesSandFall 对已致动下格= true（nactive 含致动位）', () => {
    const w = new World(80, 60, 30, 'open');
    w.store.setTileSilent(10, 11, DIRT, 0, 0);
    // 未致动：下格 nactive、再下格空但下格实心 → false
    expect(blockBelowMakesSandFallAt(w.store, 10, 10)).toBe(false);
    // 致动后：下格 !nactive → true（曾用裸 active 位误判 false）
    w.store.setActuated(10, 11, true);
    expect(blockBelowMakesSandFallAt(w.store, 10, 10)).toBe(true);
  });
});
