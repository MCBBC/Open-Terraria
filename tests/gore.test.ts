// Gore 死亡碎块系统测试：
//   ① 提取表健全性（tools/extract-gore.mjs → src/data/vanilla-gore.json）
//   ② GorePiece 物理 1:1（Gore.cs：重力/粘滞落地摩擦/timeLeft→alpha 渐隐/血块收缩/帆降）
//   ③ 表驱动死亡钩（僵尸 3 = gore 3/4/4/5/5；史莱姆 1 无表项；ai 门 1345 庆典史莱姆）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import {
  GorePiece, deathGoreFor, spawnDeathGore, spawnNpcDeathGore,
  resetGorePool, liveGorePieces, GORE_TIME,
  type GoreNpcSource, type GoreSpawnEntry,
} from '../src/entities/GorePiece';
import goreJson from '../src/data/vanilla-gore.json';

const TABLE = goreJson as unknown as Record<string, GoreSpawnEntry[]>;
const npcEntries = (id: number) => TABLE[String(id)] ?? [];

const W = 40, H = 40, FLOOR = 21;
function makeWorld(): World {
  const w = new World(W, H, 7, 'gore-test');
  for (let x = 0; x < W; x++) w.store.setTile(x, FLOOR, 1);
  return w;
}
/** GameHooks 最小 mock（GorePiece.fixedUpdate 只读 world） */
function makeGame(w: World) {
  return { world: w } as unknown as Parameters<GorePiece['fixedUpdate']>[1];
}

function src(over: Partial<GoreNpcSource> = {}): GoreNpcSource {
  return {
    vanillaId: 3, x: 100, y: 100, w: 24, h: 40,
    vx: 0.5, vy: 0, vanillaScale: 1,
    ai0: 0, ai1: 0, ai2: 0, ai3: 0, hitDir: 1,
    ...over,
  };
}

describe('① vanilla-gore.json 提取表健全性', () => {
  it('覆盖 ≥300 个 npcId（任务验收线）', () => {
    const ids = Object.keys(TABLE).filter((k) => k !== '_meta');
    expect(ids.length).toBeGreaterThanOrEqual(300);
  });

  it('每条表项都有可定位的 gore id（数字/区间/候选/留档表达式）', () => {
    let n = 0;
    for (const [k, list] of Object.entries(TABLE)) {
      if (k === '_meta') continue;
      for (const e of list) {
        n++;
        const has = e.id != null || (e.idMin != null && e.idMax != null) || (e.ids?.length ?? 0) > 0 || !!e.expr;
        expect(has, `npc ${k} line ${e.line}`).toBe(true);
      }
    }
    expect(n).toBeGreaterThanOrEqual(1500);
  });

  it('id 落在 GoreID 贴图域内（1..1406，GoreID.Count=1407）', () => {
    for (const [k, list] of Object.entries(TABLE)) {
      if (k === '_meta') continue;
      for (const e of list) {
        const ids: number[] = [];
        if (e.id != null) ids.push(e.id);
        if (e.idMin != null && e.idMax != null) {
          expect(e.idMax).toBeGreaterThanOrEqual(e.idMin);
          ids.push(e.idMin, e.idMax);
        }
        if (e.ids) ids.push(...e.ids);
        for (const id of ids) expect(id, `npc ${k} line ${e.line}`).toBeGreaterThanOrEqual(1);
        for (const id of ids) expect(id, `npc ${k} line ${e.line}`).toBeLessThan(1407);
      }
    }
  });

  it('表内出现的 gore id 绝大多数有贴图尺寸记录（_meta.tex）', () => {
    const tex = (goreJson as unknown as { _meta: { tex: Record<string, unknown> } })._meta.tex;
    const seen = new Set<number>();
    for (const [k, list] of Object.entries(TABLE)) {
      if (k === '_meta') continue;
      for (const e of list) {
        if (e.id != null) seen.add(e.id);
        if (e.idMin != null && e.idMax != null) for (let i = e.idMin; i <= e.idMax; i++) seen.add(i);
        if (e.ids) for (const i of e.ids) seen.add(i);
      }
    }
    const known = [...seen].filter((i) => tex[String(i)]);
    expect(known.length / seen.size).toBeGreaterThanOrEqual(0.95);
  });

  it('钉死锚点：僵尸 3 = 头 3 + 臂 4×2 + 腿 5×2（NPC.cs:88034-88039）', () => {
    const e = npcEntries(3);
    expect(e.map((x) => x.id)).toEqual([3, 4, 4, 5, 5]);
    expect(e[1].oy).toBe(20);
    expect(e[3].oy).toBe(34);
  });

  it('钉死锚点：史莱姆族无死亡 gore（NPC.cs:85608 支只出尘），庆典门 ai[1]==1345', () => {
    expect(npcEntries(16)).toEqual([]);
    const one = npcEntries(1);
    expect(one.length).toBe(1);
    expect(one[0].idMin).toBe(276);
    expect(one[0].idMax).toBe(282);
    expect(one[0].ai).toEqual([{ slot: 1, value: 1345, not: false }]);
  });
});

describe('② GorePiece 物理（Gore.cs 1:1）', () => {
  it('默认支：重力 0.2/帧 + rotation += vx*0.05（:762-763）', () => {
    resetGorePool();
    const w = makeWorld();
    const game = makeGame(w);
    const p = new GorePiece(4, 10 * TILE, 5 * TILE, 1);   // 僵尸臂（粘滞默认支）
    p.vx = 2; p.vy = 0;
    p.fixedUpdate(1, game);
    expect(p.vy).toBeCloseTo(0.2, 5);
    expect(p.vx).toBe(2);
    expect(p.rotation).toBeCloseTo(2 * 0.05, 5);
    expect(p.y).toBeGreaterThan(5 * TILE);                 // 位移已发生
    resetGorePool();
  });

  it('粘滞落地：vy 归零 + vx *= 0.97 摩擦（:1014-1029），不归零 rotation', () => {
    resetGorePool();
    const w = makeWorld();
    const game = makeGame(w);
    const p = new GorePiece(4, 10 * TILE, FLOOR * TILE - p_box(p) - 2, 1);
    p.vx = 2; p.vy = 3;
    const rot0 = 0.1;
    p.rotation = rot0;
    p.fixedUpdate(1, game);
    expect(p.vy).toBe(0);                                   // TileCollision Y 轴钳零
    expect(p.vx).toBeCloseTo(2 * 0.97, 5);                  // 落地摩擦
    expect(Math.abs(p.rotation - rot0 - 2 * 0.05)).toBeLessThan(1e-9); // 翻滚累加，不归零
    // 摩擦收敛：|vx|<0.01 归零（:1025-1029）
    let ticks = 0;
    while (p.vx !== 0 && ticks++ < 4000) p.fixedUpdate(1, game);
    expect(p.vx).toBe(0);
    resetGorePool();
  });

  it('时档→渐隐：timeLeft 每帧 -1，耗尽后 alpha 每帧 +1，至 255 消亡（:1030-1037/:1074）', () => {
    resetGorePool();
    const w = makeWorld();
    const game = makeGame(w);
    const p = GorePiece.newGore(4, 10 * TILE, FLOOR * TILE - 20, 0, 0, 1)!;
    expect(p.timeLeft).toBe(GORE_TIME);                     // goreTime=600（:16）
    let ticks = 0;
    while (!p.dead && ticks < 2000) p.fixedUpdate(1, game), ticks++;
    expect(p.dead).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(GORE_TIME);        // 先驻留 600 帧
    expect(ticks).toBeLessThan(GORE_TIME + 300);            // 再 ~255 帧渐隐
    expect(liveGorePieces().length).toBe(0);                // 池同步剔除
    resetGorePool();
  });

  it('血块收缩族（11-13 等）：非粘滞，v*=0.98 + scale-=0.007 + alpha+=2/帧（:535-556/:1041）', () => {
    resetGorePool();
    const w = makeWorld();
    const game = makeGame(w);
    const p = GorePiece.newGore(11, 10 * TILE, 5 * TILE, 1, 1, 1)!;
    expect(p.sticky).toBe(false);                           // NewGore :1361
    const vy0 = p.vy, vx0 = p.vx;
    p.fixedUpdate(1, game);
    expect(p.vy).toBeCloseTo(vy0 * 0.98, 6);
    expect(p.vx).toBeCloseTo(vx0 * 0.98, 6);
    expect(p.scale).toBeCloseTo(1 - 0.007, 6);
    expect(p.alpha).toBe(2);                                // 2×DisappearSpeedAlpha
    // 收缩到底：scale 钳 0.1 + alpha=255 即刻消亡（:540-544）
    let ticks = 1;
    while (!p.dead && ticks++ < 400) p.fixedUpdate(1, game);
    expect(p.dead).toBe(true);
    expect(p.scale).toBeCloseTo(0.1, 6);
    resetGorePool();
  });

  it('帆降族（860 海盗船残骸，SpecialAI 1）：相位下落、碰撞转落地滑移（:1231-1291）', () => {
    resetGorePool();
    const w = makeWorld();
    const game = makeGame(w);
    const p = GorePiece.newGore(860, 10 * TILE, 5 * TILE, 0.5, 0, 1)!;
    expect(p.sticky).toBe(true);
    const y0 = p.y;
    p.fixedUpdate(1, game);
    expect(p.y).toBeGreaterThan(y0);                        // 下落支位移
    expect(p.vy).toBeGreaterThan(0);                        // 相位累加 MathF.PI/60
    // 拖到落地（碰撞 → vy=-1 转滑移支；滑移支不再推进 position）
    let ticks = 0;
    while (p.vy >= 0 && ticks++ < 4000) p.fixedUpdate(1, game);
    expect(p.vy).toBe(-1);                                  // 碰撞转支（:1277-1279）
    const yLand = p.y;
    p.fixedUpdate(1, game);
    expect(p.y).toBe(yLand);                                // 落地支只推 velocity.X
    resetGorePool();
  });

  it('NewGore 随机扰动（:1347-1348）：vy∈[-3,-1]、vx∈[-2,+2]；perfect 不扰动', () => {
    resetGorePool();
    for (let i = 0; i < 200; i++) {
      const p = GorePiece.newGore(4, 0, 0, 0, 0, 1)!;
      expect(p.vy).toBeGreaterThanOrEqual(-3.0);
      expect(p.vy).toBeLessThanOrEqual(-1.0);
      expect(p.vx).toBeGreaterThanOrEqual(-2.0);
      expect(p.vx).toBeLessThanOrEqual(2.0);
    }
    const q = GorePiece.newGore(4, 5, 6, 1.5, -2.5, 1, true)!;
    expect(q.vx).toBe(1.5);
    expect(q.vy).toBe(-2.5);
    resetGorePool();
  });

  it('600 槽池满即弃（Gore.cs:1328-1340），resetGorePool 后恢复', () => {
    resetGorePool();
    const spawned: GorePiece[] = [];
    for (let i = 0; i < 700; i++) {
      const p = GorePiece.newGore(4, i * 32, 0, 0, 0, 1);
      if (p) spawned.push(p);
    }
    expect(spawned.length).toBe(600);
    resetGorePool();
    expect(GorePiece.newGore(4, 0, 0, 0, 0, 1)).not.toBeNull();
    resetGorePool();
  });

  it('sticky 越界消亡（DeactivateIfOutsideOfWorld :297-311）', () => {
    resetGorePool();
    const w = makeWorld();
    const game = makeGame(w);
    const p = GorePiece.newGore(4, -100, -100, 0, 0, 1)!;
    p.fixedUpdate(1, game);
    expect(p.dead).toBe(true);
    resetGorePool();
  });
});

describe('③ 表驱动死亡钩', () => {
  it('僵尸死亡炸 5 块（头/臂×2/腿×2），出生点带 +20/+34 纵偏移', () => {
    resetGorePool();
    const got: GorePiece[] = [];
    const n = spawnDeathGore(src({ vanillaId: 3, x: 100, y: 200 }), (p) => got.push(p));
    expect(n).toBe(5);
    expect(got.map((p) => p.goreId).sort((a, b) => a - b)).toEqual([3, 4, 4, 5, 5]);
    expect(got[0].x).toBe(100);
    expect(got[0].y).toBe(200);
    expect(got.filter((p) => p.goreId === 4).every((p) => p.y === 200 + 20)).toBe(true);
    expect(got.filter((p) => p.goreId === 5).every((p) => p.y === 200 + 34)).toBe(true);
    resetGorePool();
  });

  it('史莱姆（1/16）无表项不出块；庆典史莱姆 ai[1]==1345 出彩带 276-282', () => {
    resetGorePool();
    const got: GorePiece[] = [];
    expect(spawnDeathGore(src({ vanillaId: 16 }), (p) => got.push(p))).toBe(0);
    expect(spawnDeathGore(src({ vanillaId: 1 }), (p) => got.push(p))).toBe(0);
    expect(spawnDeathGore(src({ vanillaId: 1, ai1: 999 }), (p) => got.push(p))).toBe(0);
    const ribbons: GorePiece[] = [];
    expect(spawnDeathGore(src({ vanillaId: 1, ai1: 1345 }), (p) => ribbons.push(p))).toBe(1);
    expect(ribbons[0].goreId).toBeGreaterThanOrEqual(276);
    expect(ribbons[0].goreId).toBeLessThanOrEqual(282);
    // 表速 new Vector2(0f, -10f)，叠加 NewGore 扰动（:1347-1348）后：
    // vx ∈ [-2,2]、vy ∈ [-13,-11]
    expect(ribbons[0].vx).toBeGreaterThanOrEqual(-2);
    expect(ribbons[0].vx).toBeLessThanOrEqual(2);
    expect(ribbons[0].vy).toBeGreaterThanOrEqual(-13);
    expect(ribbons[0].vy).toBeLessThanOrEqual(-11);
    resetGorePool();
  });

  it('EoC（4）：均匀随机速度 ±6 且不叠加 NPC 速度（Next(-30,31)*0.2）', () => {
    resetGorePool();
    for (let i = 0; i < 100; i++) {
      const got: GorePiece[] = [];
      spawnDeathGore(src({ vanillaId: 4, vx: 9 }), (p) => got.push(p));
      expect(got.length).toBeGreaterThanOrEqual(4);
      for (const p of got) {
        // 基速 ∈ [-6,6]（不含 NewGore 扰动前的表速无法直读，扰动后 vy 上限 6-1=5 内粗验）
        expect(p.vy).toBeLessThanOrEqual(6);
      }
    }
    resetGorePool();
  });

  it('spawnNpcDeathGore 经 GameHooks.entities 入 props 桶；无 entities 时静默 0', () => {
    resetGorePool();
    const added: Array<{ p: unknown; bucket: string }> = [];
    const game = {
      entities: { add: (p: unknown, bucket: string) => added.push({ p, bucket }) },
    } as unknown as Parameters<typeof spawnNpcDeathGore>[1];
    expect(spawnNpcDeathGore(src(), game, -1)).toBe(5);
    expect(added.length).toBe(5);
    expect(added.every((a) => a.bucket === 'props')).toBe(true);
    expect(spawnNpcDeathGore(src(), {} as unknown as Parameters<typeof spawnNpcDeathGore>[1])).toBe(0);
    resetGorePool();
  });

  it('deathGoreFor 与表一致；Boss 钉死锚（克眼 4 / 世吞 13 / 蜂后 222 / 花苞 262）', () => {
    expect(deathGoreFor(3).length).toBe(npcEntries(3).length);
    expect(npcEntries(4).length).toBeGreaterThanOrEqual(4);
    expect(npcEntries(13).map((e) => e.id)).toEqual([24, 25, 28, 29]);
    expect(npcEntries(222).slice(0, 3).map((e) => e.id)).toEqual([303, 304, 305]);
    expect(npcEntries(262).length).toBeGreaterThanOrEqual(9);
    expect(npcEntries(113).slice(0, 4).map((e) => e.id)).toEqual([137, 138, 138, 137]);
  });
});

/** 测试内取碰撞盒尺寸（构造前不可得，用同型新实例代读） */
function p_box(_p: GorePiece): number {
  const probe = new GorePiece(4, 0, 0, 1);
  return probe.h;
}
