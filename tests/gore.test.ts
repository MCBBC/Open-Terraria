// Gore 死亡碎块系统测试（★BJ329 2026-09-24 line 域金标重冻：提取锚 1456→1457,三钉
//   84540→84611/84554→84625/83038→83109,注释 span 逐站重锚——语义面对拍零差,仅 provenance 平移）：
//   ① 提取表健全性（tools/extract-gore.mjs → src/data/vanilla-gore.json）
//   ② GorePiece 物理 1:1（Gore.cs：重力/粘滞落地摩擦/timeLeft→alpha 渐隐/血块收缩/帆降/16-17 火苗）
//   ③ 表驱动死亡钩（僵尸 3 = gore 3/4/4/5/5；史莱姆 1 无表项；ai 门 1345 庆典史莱姆）
//   ④ 结构化 gates 真/假两路（altTexture/spriteDirection/dmg/netMode/概率/redhat）
//   ⑤ posExpr 编译产物（荷兰人 vector19/20 旋转向量链、循环变量逐值展开）
//   ⑥ post 实例后处理（scale 设定/乘域、velocity 加减/缩放、rotation/MathF.PI）
//   ⑦ ChildSafety 替换（童模：危险 gore → 11-13 落叶）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { moveAndCollide } from '../src/physics/TileCollision';
import {
  GorePiece, deathGoreFor, spawnDeathGore, spawnNpcDeathGore,
  resetGorePool, liveGorePieces, GORE_TIME, ChildSafety,
  setGoreNetMode, goreNetModeValue,
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

  it('运行时直调面 tex 金标（extract-gore EXTRA_TEX_FAMILIES，83 id）：{w,h}=贴图 IHDR 实测', () => {
    // 32px 回退清偿（2026-09-02 十批备案）：原 _meta.tex 只含 HitEffect 表内 id，
    // GorePiece.newGore 的非 HitEffect 调用点（罐破/二段跳/药水 Kill/弹 Kill/BOSS
    // 演出）全部落 Gore.cs:999 的 32px 回退盒。钉值 = 本仓 Gore_<id>.png IHDR，
    // 已与 terraria-assets/Images/Gore_<id>.png（原版 XNB 提取）逐 id 实测零偏差。
    // 引文：罐瓦砾 WorldGen.cs:57358-57427；火苗 NewGore :1487-1490 + Player.cs:45182；
    // 沙暴 Player.cs:22102；心 Projectile.cs:78898；克脑 NPC.cs:32658-32661；
    // 气泡 Player.cs:45438-45459；骨尘 Player.cs:21030/Projectile.cs:78915；
    // 猪鲨 NPC.cs:72721-72724；毒瓶 Projectile.cs:75096；DD2 Projectile.cs:36999；
    // 火溅 Projectile.cs:72044-72047；微光变体 NPC.cs:89207/:89209（idAlt 面；1457 域原生）。
    const tex = (goreJson as unknown as { _meta: { tex: Record<string, { w: number; h: number }> } })._meta.tex;
    const want: Record<number, [number, number]> = {
      16: [22, 24], 17: [22, 24],
      51: [18, 16], 52: [14, 16], 53: [16, 20],
      166: [20, 12], 167: [12, 16], 168: [12, 16], 169: [20, 14], 170: [12, 16],
      171: [12, 18], 172: [16, 14], 173: [12, 16], 174: [12, 14],
      197: [16, 12], 198: [12, 16], 199: [14, 18], 200: [12, 20],
      201: [22, 16], 202: [18, 12], 203: [20, 12], 204: [14, 16],
      217: [18, 20], 218: [16, 20], 219: [22, 20],
      220: [38, 36], 221: [34, 36], 222: [36, 32],
      315: [16, 30], 316: [12, 24],
      331: [14, 14],
      392: [40, 44], 393: [38, 44], 394: [32, 26], 395: [32, 28],
      411: [10, 10], 412: [20, 20], 413: [32, 32], 414: [48, 48], 415: [64, 64],
      416: [10, 10], 417: [20, 20], 418: [32, 32], 419: [48, 48], 420: [64, 64],
      421: [10, 10], 422: [20, 20], 423: [32, 32], 424: [48, 48], 425: [64, 64],
      426: [10, 10], 427: [20, 20], 428: [32, 32], 429: [48, 48], 430: [64, 64],
      435: [34, 36], 436: [38, 36], 437: [36, 32],
      619: [30, 42], 620: [34, 42], 621: [32, 38], 622: [32, 44],
      698: [12, 14], 699: [12, 12], 700: [10, 12], 701: [14, 16],
      702: [16, 18], 703: [16, 18],
      704: [8, 10], 705: [10, 14],
      1027: [22, 18], 1028: [14, 16], 1029: [16, 20], 1030: [18, 18],
      1122: [20, 24], 1123: [14, 20], 1124: [12, 16],
      1351: [24, 24], 1352: [38, 24],
      1394: [10, 14], 1395: [10, 16], 1396: [16, 12], 1397: [16, 18],
    };
    for (const [id, [w, h]] of Object.entries(want)) {
      expect(tex[Number(id)], `gore ${id}`).toEqual({ w, h });
    }
    // 直调面登记数与 _meta 账面一致（81 入 EXTRA_TEX_FAMILIES + 1351/1352 走 idAlt 面）
    const meta = (goreJson as unknown as { _meta: { texExtraCount: number } })._meta;
    expect(meta.texExtraCount).toBe(81);
  });

  it('1457 语义钉补（extract-gore MANUAL_1457_DELTAS）：发型师头块变体 1351/1352、独角兽 alpha 继承', () => {
    // ★BJ329 起提取锚=1457 原生（本 delta 层退化为幂等钉补），line 域=1457 行号：
    // 1456 :89135 `IsShimmerVariant ? 1353 : 544` → 1457 :89207 `? 1351 : 544`
    // 1456 :89139 `if (!IsShimmerVariant) NewGore(543)` → 1457 :89209 无条件
    //   `IsShimmerVariant ? 1352 : 543`（shim 门移除、变体改 idAlt 承载）
    for (const id of [353, 354]) {
      const e544 = npcEntries(id).find((x) => x.id === 544);
      const e543 = npcEntries(id).find((x) => x.id === 543);
      expect(e544?.idAlt).toBe(1351);
      expect(e543?.idAlt).toBe(1352);
      expect(e543?.gates).toBeUndefined();
    }
    // 1456 :86351 裸 NewGore → 1457 :86422 NewGoreDirect + gore.alpha = alpha
    const e121 = npcEntries(121)[0];
    expect(e121.post).toContainEqual(['al', 'npc']);
    // 微光变体消费面：idAlt 1351/1352 有贴图尺寸（表内 idAlt 亦入 tex 面）
    const tex = (goreJson as unknown as { _meta: { tex: Record<string, unknown> } })._meta.tex;
    expect(tex[1351]).toEqual({ w: 24, h: 24 });
    expect(tex[1352]).toEqual({ w: 38, h: 24 });
  });

  it('钉死锚点：僵尸 3 = 头 3 + 臂 4×2 + 腿 5×2（NPC.cs:88106-88111；1456 :88034-88039）', () => {
    const e = npcEntries(3);
    expect(e.map((x) => x.id)).toEqual([3, 4, 4, 5, 5]);
    expect(e[1].oy).toBe(20);
    expect(e[3].oy).toBe(34);
  });

  it('钉死锚点：史莱姆族无死亡 gore（NPC.cs:85679 支只出尘；1456 :85608），庆典门 ai[1]==1345', () => {
    expect(npcEntries(16)).toEqual([]);
    const one = npcEntries(1);
    expect(one.length).toBe(1);
    expect(one[0].idMin).toBe(276);
    expect(one[0].idMax).toBe(282);
    expect(one[0].ai).toEqual([{ slot: 1, value: 1345, not: false }]);
  });

  it('提取残留清单：0 个不可求值 id/守卫/后处理/位置表达式；WoF 屏幕网格已结构化', () => {
    const meta = (goreJson as unknown as { _meta: Record<string, unknown> })._meta;
    expect(meta.unresolved).toEqual([]);
    expect(meta.unresolvedGates).toEqual([]);
    expect(meta.unresolvablePost).toEqual([]);
    expect(meta.unresolvedCount).toBe(0);
    expect(meta.velExprCount).toBe(0);
    // WoF 屏幕级尘幕（num593/594 依赖 Main.screenPosition）已由提取器
    // compileScreenGrid 编译为 screenGrid 域（NPC.cs:88379-88399；1456 :88307-88327），posExpr 清零
    expect(meta.posExprCount).toBe(0);
    expect(meta.screenGridCount).toBe(1);
    const residual: string[] = [];
    for (const [k, list] of Object.entries(TABLE)) {
      if (k === '_meta') continue;
      for (const e of list as GoreSpawnEntry[]) if (e.posExpr) residual.push(`${k}:${e.posExpr}`);
    }
    expect(residual).toEqual([]);
  });

  it('WoF 屏幕网格尘幕域常量对拍源码（NPC.cs:88379-88399；1456 :88307-88327）且仅 113 持有', () => {
    const curtain = npcEntries(113).filter((e) => e.screenGrid);
    expect(curtain.length).toBe(1);
    expect(curtain[0].screenGrid).toEqual({
      yStep: 50, ySpan: 'screenWidth', xSpan: 140, xStep: 46, dirShift: -80,
      gate: 'playerDeepHell', gateTiles: 250,
    });
    expect(curtain[0].idMin).toBe(140);
    expect(curtain[0].idMax).toBe(142);
    // 早退排除（:88363-88370 `if (type == 114) {…; return;}`；1456 :88291-88298）：114 只剩 4 件眼 gore，
    // 不再误摊嘴部四件 + 尘幕网格
    expect(npcEntries(114).filter((e) => e.screenGrid)).toEqual([]);
    expect(npcEntries(114).map((e) => e.id)).toEqual([137, 139, 139, 137]);
  });

  it('结构化 gates 全表可运行时求值（无 skip 残留门）', () => {
    const kinds = new Set<string>();
    for (const [k, list] of Object.entries(TABLE)) {
      if (k === '_meta') continue;
      for (const e of list as GoreSpawnEntry[]) {
        for (const g of e.gates ?? []) {
          expect(g.k, `npc ${k} line ${e.line}`).not.toBe('skip');
          kinds.add(g.k);
        }
      }
    }
    // HitEffect 守卫全集（提取器 _meta.notes 逐项对应原版守卫）。
    // 1457 移除了最后一处 shim 门（发型师 353/354 头部 gore 第二段
    // `!IsShimmerVariant` → 无条件 `IsShimmerVariant ? 1352 : 543`,:89209）——
    // shim 语义改由 idAlt 承载,门集不再含 'shim'
    expect([...kinds].sort()).toEqual(['alt', 'dmg', 'net', 'redhat', 'rnd', 'sdir']);
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
    const box = new GorePiece(4, 0, 0, 1).h;
    const p = new GorePiece(4, 10 * TILE, FLOOR * TILE - box - 2, 1);
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
    // alpha 先于 scale 收到底（255/2≈128 帧 vs 0.9/0.007≈129 帧）→ 消亡时 scale≈0.104
    let ticks = 1;
    while (!p.dead && ticks++ < 400) p.fixedUpdate(1, game);
    expect(p.dead).toBe(true);
    expect(p.scale).toBeLessThanOrEqual(0.104 + 1e-9);
    resetGorePool();
  });

  it('帆降族（860 海盗船残骸，SpecialAI 1）：相位下落、碰撞转落地滑移（:1231-1291）', () => {
    resetGorePool();
    const w = makeWorld();
    const game = makeGame(w);
    const p = GorePiece.newGore(860, 10 * TILE, 5 * TILE, 0.5, 0, 1)!;
    expect(p.sticky).toBe(true);
    // SpecialAI 1 初速覆写（:1423-1425）：vx ∈ [-1.5,1.5]、vy ∈ [0,2π)
    expect(p.vx).toBeGreaterThanOrEqual(-1.5);
    expect(p.vx).toBeLessThanOrEqual(1.5);
    expect(p.vy).toBeGreaterThanOrEqual(0);
    expect(p.vy).toBeLessThan(Math.PI * 2);
    p.vy = 0.5;                                            // 固定相位走下落支
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

  it('直调面 tex 消费：盒 = min(w,h)*0.9*scale（Gore.cs:999-1014），不再落 32px 回退', () => {
    resetGorePool();
    // 罐瓦砾 51（18×16，WorldGen.cs:57358）→ floor(16*0.9)=14（回退档曾是 32）
    const pot = new GorePiece(51, 0, 0, 1);
    expect([pot.texW, pot.texH]).toEqual([18, 16]);
    expect(pot.w).toBe(14);
    expect(pot.h).toBe(14);
    // 火苗 16（22×24）：NewGore 置 scale=0.7 → floor(22*0.9*0.7)=13
    const fire = GorePiece.newGore(16, 0, 0, 0, 0, 1)!;
    expect([fire.texW, fire.texH]).toEqual([22, 24]);
    expect(fire.w).toBe(13);
    // 毒瓶玻璃 704（8×10，Projectile.cs:75096）→ floor(8*0.9)=7
    expect(new GorePiece(704, 0, 0, 1).w).toBe(7);
    // 气泡 413（32×32）：与 BUBBLE_TEX 兜底档同值 → floor(32*0.9)=28
    expect(new GorePiece(413, 0, 0, 1).w).toBe(28);
    // 爱情药水心 331（14×14，Projectile.cs:78898）→ floor(14*0.9)=12
    expect(new GorePiece(331, 0, 0, 1).w).toBe(12);
    // 克脑血块 392（40×44，NPC.cs:32658）→ floor(40*0.9)=36
    expect(new GorePiece(392, 0, 0, 1).w).toBe(36);
    // 微光变体头块 1352（38×24，NPC.cs:89209）→ floor(24*0.9)=21
    expect(new GorePiece(1352, 0, 0, 1).w).toBe(21);
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
    // vy ∈ [-13,-11]；vx 含 post `velocity.X += Next(-50,51)*0.05`（±2.5）→ [-4.5,4.5]
    expect(ribbons[0].vx).toBeGreaterThanOrEqual(-4.5);
    expect(ribbons[0].vx).toBeLessThanOrEqual(4.5);
    expect(ribbons[0].vy).toBeGreaterThanOrEqual(-13);
    expect(ribbons[0].vy).toBeLessThanOrEqual(-11);
    resetGorePool();
  });

  it('EoC（4）：for(<2) 循环体 4 调用 = 8 块（loop 字段），速度为均匀随机 ±6', () => {
    for (let i = 0; i < 50; i++) {
      resetGorePool();                                    // 600 槽池：循环内复位防满池截断
      const got: GorePiece[] = [];
      spawnDeathGore(src({ vanillaId: 4, vx: 9 }), (p) => got.push(p));
      expect(got.length).toBe(8);                         // NPC.cs:88273-88284（2 次迭代 × 4 调用；1456 :88201-88211）
      expect(new Set(got.map((p) => p.goreId))).toEqual(new Set([2, 7, 9, 10]));
      for (const p of got) {
        // 表速 = Next(-30,31)*0.2 ∈ [-6,6]（替换而非叠加 NPC 速度 9）
        expect(p.vy).toBeGreaterThanOrEqual(-9);          // 含 NewGore 扰动 -1..-3
        expect(p.vy).toBeLessThanOrEqual(6);
        expect(p.vx).toBeGreaterThanOrEqual(-8);          // ±6 再叠加扰动 ±2
        expect(p.vx).toBeLessThanOrEqual(8);
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
    expect(npcEntries(4).length).toBe(4);
    expect(npcEntries(4).every((e) => e.loop === 2)).toBe(true);
    // 世吞 13 死亡 gore=[24,25]（else-if 链 28,29 只归尾段 15——提取器 else
    // 剔除修复后正确化,曾 [24,25,28,29] 误摊,2026-08-17）
    expect(npcEntries(13).map((e) => e.id)).toEqual([24, 25]);
    expect(npcEntries(222).slice(0, 3).map((e) => e.id)).toEqual([303, 304, 305]);
    expect(npcEntries(262).length).toBeGreaterThanOrEqual(9);
    expect(npcEntries(113).slice(0, 4).map((e) => e.id)).toEqual([137, 138, 138, 137]);
  });
});

describe('④ 结构化 gates（真/假两路，1:1 HitEffect 守卫语义）', () => {
  it('altTexture==0：变体贴图槽门（NPC.cs:88657；1456 :88585），微光变体取 idAlt（NPC.cs:6643）', () => {
    resetGorePool();
    const e = npcEntries(17).find((x) => x.gates?.length);
    expect(e?.gates).toEqual([{ k: 'alt', op: '==', v: 0 }]);
    expect(e?.id).toBe(30);
    expect(e?.idAlt).toBe(1320);
    // altTexture=0（缺省）→ 5 块含头 30；=1 → 变体无头碎块，只出其余 4 块
    expect(spawnDeathGore(src({ vanillaId: 17 }), () => {})).toBe(5);
    expect(spawnDeathGore(src({ vanillaId: 17, altTexture: 1 }), () => {})).toBe(4);
    // 微光变体：头碎块换 1320（`IsShimmerVariant ? 1320 : 30`）
    const got: GorePiece[] = [];
    spawnDeathGore(src({ vanillaId: 17, isShimmerVariant: true }), (p) => got.push(p));
    expect(got.some((p) => p.goreId === 1320)).toBe(true);
    expect(got.some((p) => p.goreId === 30)).toBe(false);
    resetGorePool();
  });

  it('spriteDirection 镜像分支（NPC.cs:83062/:83075；1456 :82992/:83005）：!==-1 与 ===-1 互斥各出 10 块', () => {
    resetGorePool();
    const gates = new Set(npcEntries(551).map((e) => JSON.stringify(e.gates)));
    expect(gates).toEqual(new Set([
      JSON.stringify([{ k: 'sdir', op: '!=', v: -1 }]),
      JSON.stringify([{ k: 'sdir', op: '==', v: -1 }]),
    ]));
    const right: GorePiece[] = [];
    spawnDeathGore(src({ vanillaId: 551, spriteDirection: 1 }), (p) => right.push(p));
    expect(right.length).toBe(10);
    expect(right.every((p) => [1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086].includes(p.goreId))).toBe(true);
    // facing=-1 走镜像偏移支（ox 176 起）
    const left: GorePiece[] = [];
    spawnDeathGore(src({ vanillaId: 551, spriteDirection: -1 }), (p) => left.push(p));
    expect(left.length).toBe(10);
    expect(left.some((p) => p.goreId === 1079 && p.x === 100 + 176)).toBe(true);
    resetGorePool();
  });

  it('dmg==9999 门（NPC.cs:83558；1456 :83487）：EoL 式脚本化死亡才出 728-733 六向碎块', () => {
    resetGorePool();
    // `for (num97 < 6) NewGore(..., 728 + num97)`（NPC.cs:83560-83563；1456 :83488-83493）→ 循环变量
    // 逐值展开成 6 条固定 id（728-733），各带 dmg 门
    expect(npcEntries(437).map((e) => e.id)).toEqual([728, 729, 730, 731, 732, 733]);
    expect(npcEntries(437).every((e) => e.gates)).toBe(true);
    expect(npcEntries(437).every((e) => e.gates![0].k === 'dmg')).toBe(true);
    // 死亡钩缺省 dmg=9999（原版 HitEffect(0, 9999) 死亡调用约定）→ 出 6 块
    const got: GorePiece[] = [];
    spawnDeathGore(src({ vanillaId: 437 }), (p) => got.push(p));
    expect(got.length).toBe(6);
    // 速度 = 均匀随机方向 × 5（UnitY.RotatedByRandom(2π)*5f），叠 NewGore 扰动
    // （vx ±2 / vy -3..-1，最大模 √13≈3.606）→ 模长 ∈ [5-3.606, 5+3.606]
    for (const p of got) {
      expect(Math.hypot(p.vx, p.vy)).toBeGreaterThanOrEqual(1.3);
      expect(Math.hypot(p.vx, p.vy)).toBeLessThanOrEqual(8.7);
    }
    // 显式 dmg=10（普通打击路径）→ 门不满足，0 块
    expect(spawnDeathGore(src({ vanillaId: 437, dmg: 10 }), () => {})).toBe(0);
    resetGorePool();
  });

  it('Main.netMode!=1 门（NPC.cs:86414；1456 :86345）：单人(0)出块、客户端(1)不出', () => {
    resetGorePool();
    expect(npcEntries(121)[0].gates).toEqual([{ k: 'net', op: '!=', v: 1 }]);
    setGoreNetMode(0);
    expect(goreNetModeValue()).toBe(0);
    expect(spawnDeathGore(src({ vanillaId: 121 }), () => {})).toBe(1);
    setGoreNetMode(1);
    expect(spawnDeathGore(src({ vanillaId: 121 }), () => {})).toBe(0);
    setGoreNetMode(0);                                   // 复位，勿污染其他用例
    resetGorePool();
  });

  it('Main.rand.Next(2)==0 概率门（NPC.cs:90296）：仅概率性追加，常驻块恒出', () => {
    resetGorePool();
    const gated = npcEntries(134).filter((e) => e.gates?.length);
    expect(gated.length).toBe(4);
    expect(gated.every((e) => e.gates![0].k === 'rnd' && e.gates![0].n === 2)).toBe(true);
    let min = Infinity, max = -Infinity, saw156 = false;
    for (let i = 0; i < 200; i++) {           // 4 门全过/全不过各需 ≥1 样本：(1/16)^k 收敛
      resetGorePool();                        // 600 槽池：循环内复位防满池截断
      const got: GorePiece[] = [];
      spawnDeathGore(src({ vanillaId: 134 }), (p) => got.push(p));
      min = Math.min(min, got.length);
      max = Math.max(max, got.length);
      if (got.some((p) => p.goreId === 156)) saw156 = true;
    }
    expect(min).toBe(1);                                // 1 常驻 + 0..4 概率块（全不过样本）
    expect(max).toBe(5);                                // 4 门全过样本
    expect(saw156).toBe(true);
    resetGorePool();
  });

  it('RedHatSkeletronAdjustmentsEnabled（NPC.cs:67282）：ai[3]==1 切红帽碎块，else 支取反', () => {
    resetGorePool();
    const gates = [...new Set(npcEntries(35).map((e) => JSON.stringify(e.gates)))];
    expect(gates).toContain(JSON.stringify([{ k: 'redhat' }]));
    expect(gates).toContain(JSON.stringify([{ k: 'redhat', not: true }]));
    // type 35 + ai[3]==1 → 红帽 1398/1399/1400（3 块——1401/1402×3 与 56/57×3 是
    // `if(t==35||t==68){A} else if(RedHat){B} else{C}` 的 B/C 支=只归手 36,
    // 曾误摊给 35/68,提取器 else-if 续链剔除修复后正确化,2026-08-17）
    const red: GorePiece[] = [];
    spawnDeathGore(src({ vanillaId: 35, ai3: 1 }), (p) => red.push(p));
    expect(red.length).toBe(3);
    expect(red.filter((p) => p.goreId === 1398).length).toBe(1);
    expect(red.some((p) => p.goreId === 1402)).toBe(false);
    // ai[3]!=1 → 常规 54/55（2 块——56/57×3 同上只归 36）
    const plain: GorePiece[] = [];
    spawnDeathGore(src({ vanillaId: 35, ai3: 0 }), (p) => plain.push(p));
    expect(plain.length).toBe(2);
    expect(plain.some((p) => p.goreId === 54)).toBe(true);
    expect(plain.some((p) => p.goreId >= 1398)).toBe(false);
    resetGorePool();
  });
});

describe('⑤ posExpr 编译产物（Vector2 局部流 + 项式代数）', () => {
  it('荷兰人 491：vector19(中心-60) + vector20(朝向单位轴).RotatedBy(rotation) × 尺寸系数', () => {
    const e = npcEntries(491)[0];
    expect(e.id).toBe(858);
    expect(e.ox).toBe(-60);
    expect(e.oy).toBe(-60);
    expect(e.fx).toBe(0.5);
    expect(e.fy).toBe(0.5);
    expect(e.rot).toEqual([{ a: 'x', s: 'sd', k: 0.5, dim: 'w' }]);
    // 运行时（w=120/h=40/x=100/y=100）：sdir=1 → sd 符号 -1 →
    // x = 100 - 60(ox) + 60(fx·w) - 60(rot) = 40；y = 100 - 60 + 20 = 60
    resetGorePool();
    const got: GorePiece[] = [];
    spawnDeathGore(src({ vanillaId: 491, w: 120, h: 40, spriteDirection: 1, vanillaScale: 1 }), (p) => got.push(p));
    const head = got.find((p) => p.goreId === 858)!;
    expect(head).toBeTruthy();
    expect(head.x).toBe(40);
    expect(head.y).toBe(60);
    // sdir=-1 → sd 符号 +1 → x = 100 + 60 - 60 + 60 = 160（镜像到右舷）
    resetGorePool();
    const got2: GorePiece[] = [];
    spawnDeathGore(src({ vanillaId: 491, w: 120, h: 40, spriteDirection: -1 }), (p) => got2.push(p));
    expect(got2.find((p) => p.goreId === 858)!.x).toBe(160);
    resetGorePool();
  });

  it('循环变量逐值展开：num189∈{-1,0,1} → 3 条 loop=1、rot 系数 0.35/0.45/0.55（NPC.cs:84610-84615；1456 :84539-84544）', () => {
    const vars = npcEntries(491).filter((e) => e.line === 84611);
    expect(vars.length).toBe(3);
    expect(vars.every((e) => (e.loop ?? 1) === 1)).toBe(true);
    expect(vars.map((e) => e.rot![0].k).sort((a, b) => a - b)).toEqual([0.35, 0.45, 0.55]);
    // num191/num192 混用：`160 + 60*num191` 的 y 偏移也逐值编译
    const n191 = npcEntries(491).filter((e) => e.line === 84625);
    expect(n191.length).toBe(2);
    // vector19 自带 oy=-60：-(160 + 60*num191) - 60 → -220 / -280
    expect(n191.map((e) => e.oy).sort((x, y) => (x ?? 0) - (y ?? 0))).toEqual([-280, -220]);
  });

  it('rotation.ToRotationVector2()*k（vector25 链）：rv 字段 + spriteDirection==1 时 X 取反', () => {
    const e = npcEntries(399).find((x) => x.rv);
    expect(e?.rv).toEqual([5, 1]);
    resetGorePool();
    const got: GorePiece[] = [];
    spawnDeathGore(src({ vanillaId: 399, spriteDirection: 1 }), (p) => got.push(p));
    // 旋转缺省 0 → (5,0)，flip 奇数次 + sdir==1 → vx=-5（再叠 NewGore 扰动 ±2）
    for (const p of got) {
      expect(p.vx).toBeGreaterThanOrEqual(-7);
      expect(p.vx).toBeLessThanOrEqual(-3);
    }
    resetGorePool();
  });

  it('Vector2 局部链（vector10）：中心偏移 + 逐轴分量引用编译（NPC.cs:83107-83112；1456 :83036-83041）', () => {
    // `vector10 = base.Center - new Vector2(10f, 10f)` 直接引用
    const first = npcEntries(572)[0];
    expect(first.fx).toBe(0.5);
    expect(first.fy).toBe(0.5);
    expect(first.ox).toBe(-10);
    expect(first.oy).toBe(-10);
    // `new Vector2(vector10.X, vector10.Y + 20f)` → 分量引用展开（oy = -10 + 20）
    const sub = npcEntries(572).find((e) => e.line === 83109);
    expect(sub?.fx).toBe(0.5);
    expect(sub?.ox).toBe(-10);
    expect(sub?.oy).toBe(10);
  });
});

describe('⑥ post 实例后处理（NewGore 之后的赋值流）', () => {
  it('庆典彩带（NPC.cs:85698-85700；1456 :85627-85629）：scale *= 0.8..1.2 + velocity.X += ±2.5', () => {
    resetGorePool();
    const e = npcEntries(1)[0];
    expect(e.post).toEqual([['sm', 0.8, 1.2], ['va', 'x', -2.5, 2.5]]);
    for (let i = 0; i < 40; i++) {
      const got: GorePiece[] = [];
      spawnDeathGore(src({ vanillaId: 1, ai1: 1345 }), (p) => got.push(p));
      const p = got[0];
      expect(p.scale).toBeGreaterThanOrEqual(0.8);
      expect(p.scale).toBeLessThanOrEqual(1.2);
      // 表速 vx=0 → post ±2.5 后 ∈ [-2.5,2.5]，再叠 NewGore 扰动 ±2 → [-4.5,4.5]
      expect(p.vx).toBeGreaterThanOrEqual(-4.5);
      expect(p.vx).toBeLessThanOrEqual(4.5);
    }
    resetGorePool();
  });

  it('城镇宠物族（NPC.cs:88978-88993）：scale=1 + 四象限 velocity ±1 偏置', () => {
    resetGorePool();
    const first = npcEntries(369)[0];
    expect(first.post).toEqual([['ss', 1], ['va', 'x', 1, 1], ['va', 'y', 1, 1]]);
    const second = npcEntries(369)[1];
    expect(second.post).toEqual([['ss', 1], ['va', 'x', -1, -1], ['va', 'y', 1, 1]]);
    // 运行时四条各出 1 块且 scale 恒 1
    const got: GorePiece[] = [];
    expect(spawnDeathGore(src({ vanillaId: 369 }), (p) => got.push(p))).toBe(4);
    expect(got.every((p) => p.scale === 1)).toBe(true);
    expect(got.every((p) => p.goreId >= 61 && p.goreId <= 63)).toBe(true);
    resetGorePool();
  });

  it('血块速度缩放（NPC.cs:85032-85033 gore2.velocity *= 0.8f）与 rotation=MathF.PI（:83208）', () => {
    resetGorePool();
    const vm = npcEntries(78).find((e) => e.post?.some((op) => op[0] === 'vm'));
    expect(vm?.post).toContainEqual(['vm', 0.3]);
    // vx 表速=hitDirection(1) → post ×0.3 → 0.3（±2 扰动）
    const got: GorePiece[] = [];
    spawnDeathGore(src({ vanillaId: 78, hitDir: 1 }), (p) => got.push(p));
    const hit = got.find((p) => (p.goreId === 61 || p.goreId === 99) && Math.abs(p.vx - 0.3) < 2.01);
    expect(hit).toBeTruthy();
    // rotation 覆写支（月主 576 镜像 gore 1001/1002 → MathF.PI）
    const ro = npcEntries(576).find((e) => e.post?.some((op) => op[0] === 'ro'));
    expect(ro?.post).toContainEqual(['ro', Math.PI]);
    resetGorePool();
  });
});

describe('⑦ gore 16/17 火苗与 ChildSafety', () => {
  it('NewGore 16/17（Gore.cs:1487-1490）：alpha=100 + scale=0.7 + light=1，加性全亮', () => {
    resetGorePool();
    const p = GorePiece.newGore(16, 10 * TILE, 5 * TILE, 0, 0, 1)!;
    expect(p.alpha).toBe(100);
    expect(p.scale).toBe(0.7);
    expect(p.light).toBe(1);
    expect(p.sticky).toBe(false);
    expect(p.additive).toBe(true);
    // Update :546-556 独立支：v*=0.98 + scale-=0.01（非血块 0.007 档）
    p.fixedUpdate(1, makeGame(makeWorld()));
    expect(p.scale).toBeCloseTo(0.69, 6);
    // 初速 0 叠 NewGore 扰动（±2）再 ×0.98：无重力加速度项（默认支会 +0.2）
    expect(Math.abs(p.vx)).toBeLessThanOrEqual(2);
    // 光照贡献（:1078-1101）：16 号 B×0.3/G×0.8
    const l = p.lightRGB()!;
    expect(l.r).toBeCloseTo(0.69, 4);                    // light 1 × scale 0.69
    expect(l.g).toBeCloseTo(0.69 * 0.8, 4);
    expect(l.b).toBeCloseTo(0.69 * 0.3, 4);
    expect(l.tx).toBe(Math.floor((p.x + (p.texW * p.scale) / 2) / 16));
    const q = GorePiece.newGore(17, 10 * TILE, 5 * TILE, 0, 0, 1)!;
    const l2 = q.lightRGB()!;
    expect(l2.r).toBeCloseTo(0.7 * 0.3, 4);              // 17 号 R×0.3/G×0.6
    expect(l2.g).toBeCloseTo(0.7 * 0.6, 4);
    // 消亡后不再发光
    let ticks = 0;
    while (!p.dead && ticks++ < 4000) p.fixedUpdate(1, makeGame(makeWorld()));
    expect(p.dead).toBe(true);
    expect(p.lightRGB()).toBeNull();
    expect(q.additive).toBe(true);
    expect(GorePiece.newGore(4, 0, 0, 0, 0, 1)!.additive).toBe(false);
    resetGorePool();
  });

  it('ChildSafety（ChildSafety.cs + Gore.NewGore :1339-1345）：开启童模 → 危险 gore 换 11-13 落叶', () => {
    resetGorePool();
    const before = ChildSafety.disabled;
    try {
      expect(ChildSafety.disabled).toBe(true);           // 原版默认关
      expect(ChildSafety.dangerous(4)).toBe(true);
      expect(ChildSafety.dangerous(11)).toBe(false);
      const normal = GorePiece.newGore(4, 0, 0, 3, -3, 1)!;
      expect(normal.goreId).toBe(4);
      ChildSafety.disabled = false;
      const safe = GorePiece.newGore(4, 0, 0, 0, 0, 1)!;
      expect([11, 12, 13]).toContain(safe.goreId);
      expect(safe.scale).toBeGreaterThanOrEqual(0.5);
      expect(safe.scale).toBeLessThanOrEqual(1);
      // velocity /= 2 发生在 NewGore 扰动之后：扰动 ±2/−1..−3 再减半
      expect(safe.vx).toBeGreaterThanOrEqual(-1);
      expect(safe.vx).toBeLessThanOrEqual(1);
      expect(safe.vy).toBeGreaterThanOrEqual(-3);
      expect(safe.vy).toBeLessThanOrEqual(1.5);
      // 安全 gore 不替换（11 本身在 SafeGore 表内）
      expect(GorePiece.newGore(11, 0, 0, 1, 1, 1)!.goreId).toBe(11);
    } finally {
      ChildSafety.disabled = before;
      resetGorePool();
    }
  });
});

// ===================== ⑧ 粘滞碎块落水 = 穿水沉底（Gore.cs:931 IsDrip 门）=====================
// 原版落水钉液面/溅音/涟漪段（Gore.cs:962-995）整段在 `IsDrip[type]` 门（:931）内，
// sticky 支（:993-1042）只有 TileCollision + 落地摩擦 + 时档——碎块入水无任何水交互：
// 水非实心 → TileCollision 不改速 → 重力 0.2 照加穿水下沉 → 沉底停驻至渐隐。
// 曾误把该段照搬进 sticky 支（2026-09-07 用户实报"食人鱼碎块立即飞到液面浮动"）：
// 满液格钉位 y=行顶−liquid/16 使盒底缘落进上一格 → 逐拍重算 16px/tick 级联上浮至水面。
// 滴水族（IsDrip 706-717/943/1147/1160-62/1383，GoreID.cs:15）不出自 HitEffect，
// 由 render/NatureParticles 独占移植（含 :955-985 溅落段）→ 本类实例恒非 drip。
describe('⑧ 粘滞碎块落水 = 穿水沉底（Gore.cs:931 IsDrip 门 / :993 sticky 支）', () => {
  // ★世界高 ≥ 水底行+41：WetCollision 扫描界 value4 有 maxTilesY-40 钳（Collision.cs:1594），
  //   矮测试世界会让水体判湿恒假（2026-09-07 探针首跑伪影，此处留档防复发）
  const WT = 60, WH = 120, FLOOR_Y = 44, WATER_TOP = 30;
  function waterWorld(): World {
    const w = new World(WT, WH, 7, 'gore-water');
    const st = w.store;
    for (let x = 0; x < WT; x++) { st.setTile(x, FLOOR_Y, 1); st.setTile(x, FLOOR_Y + 1, 1); }
    for (let y = WATER_TOP; y < FLOOR_Y; y++) {
      for (let x = 20; x <= 39; x++) st.setLiquid(x, y, y === WATER_TOP ? 180 : 255, 0);
    }
    return w;
  }
  function waterGame(w: World) {
    const sounds: string[] = [];
    const g = { world: w, playSfxFiles: (names: string[]) => { sounds.push(...names); } } as unknown as Parameters<GorePiece['fixedUpdate']>[1] & { sounds: string[] };
    return { g, sounds };
  }
  /** 原版公式逐 tick 模型（:325-329 钳速 / :762 重力 / :998 TileCollision +
   *  :1003 落地摩擦 / :1030 时档 / :1072 position+=velocity） */
  function vanillaModel(world: World, x: number, y: number, vx: number, vy: number, ticks: number) {
    const b = { x, y, w: 18, h: 18, vx, vy, onGround: false, hitWall: false, hitHead: false, collideY: false };
    const ys: number[] = [];
    for (let t = 0; t < ticks; t++) {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 32) { b.vx *= 32 / sp; b.vy *= 32 / sp; }
      b.vy += 0.2;
      moveAndCollide(b, world, b.vx, b.vy);
      if (b.vy === 0) {
        b.vx *= 0.97;
        if (b.vx > -0.01 && b.vx < 0.01) b.vx = 0;
      }
      ys.push(b.y);
    }
    return ys;
  }

  it('食人鱼(58)死亡 = 单块 gore 85（NPC.cs:87369-87371，贴图 28×20 → 盒 18）', () => {
    resetGorePool();
    const n = spawnDeathGore({
      vanillaId: 58, x: 448, y: 560, w: 24, h: 18,
      vx: 0.3, vy: 0.5, vanillaScale: 1.1,        // HitEffect 不传 scale → gore scale=1（非 NPC.scale）
      ai0: 0, ai1: 0, ai2: 0, ai3: 0, hitDir: 1,
    }, () => {});
    expect(n).toBe(1);
    const p = liveGorePieces()[0]!;
    expect(p.goreId).toBe(85);
    expect(p.sticky).toBe(true);
    expect(p.w).toBe(18);                          // (int)(min(28,20)*0.9) = 18
    resetGorePool();
  });

  it('入水碎块逐 tick 轨迹 = 原版公式 1:1：穿水下沉、沉底停驻、零溅音、永不钉液面', () => {
    resetGorePool();
    const world = waterWorld();
    const { g, sounds } = waterGame(world);
    spawnDeathGore({
      vanillaId: 58, x: 448, y: 560, w: 24, h: 18, // 悬在水面下 5 格（行 35，满液 255）
      vx: 0, vy: 0, vanillaScale: 1.1,
      ai0: 0, ai1: 0, ai2: 0, ai3: 0, hitDir: 1,
    }, () => {});
    const p = liveGorePieces()[0]!;
    const model = vanillaModel(world, p.x, p.y, p.vx, p.vy, 70);
    for (let t = 1; t <= 70; t++) {
      p.fixedUpdate(1 / 60, g);
      expect(p.y, `tick ${t}`).toBeCloseTo(model[t - 1], 6);
    }
    // 终态：沉在水底地板上（floorTop−盒高），不在液面（液面钉位 = 30*16−180/16 = 468.75）
    expect(p.y).toBeCloseTo(FLOOR_Y * 16 - 18, 6);
    expect(p.vy).toBe(0);
    expect(p.y).not.toBeCloseTo(468.75, 1);
    // 原版 sticky 支无任何音效（溅音 39 只在 IsDrip 支）
    expect(sounds).toEqual([]);
    resetGorePool();
  });

  it('IsDrip ∩ vanilla-gore.json 全部可达 gore id = ∅（滴水族永不进本类物理）', () => {
    // GoreID.Sets.IsDrip（GoreID.cs:15）
    const DRIP = new Set([706, 714, 713, 707, 715, 711, 1147, 709, 710, 708, 712, 716, 717, 943, 1160, 1161, 1162, 1383]);
    const ids = new Set<number>();
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (o && typeof o === 'object') {
        const e = o as Record<string, unknown>;
        if (typeof e.id === 'number') ids.add(e.id);
        if (typeof e.idAlt === 'number') ids.add(e.idAlt);
        if (Array.isArray(e.ids)) for (const v of e.ids) if (typeof v === 'number') ids.add(v);
        if (typeof e.idMin === 'number' && typeof e.idMax === 'number') {
          for (let v = e.idMin; v <= e.idMax; v++) ids.add(v);
        }
        for (const v of Object.values(e)) walk(v);
      }
    };
    walk(TABLE);
    expect(ids.size).toBeGreaterThan(1000);
    const hit = [...ids].filter((v) => DRIP.has(v));
    expect(hit).toEqual([]);
  });
});
