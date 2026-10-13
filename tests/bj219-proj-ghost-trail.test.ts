// ★BJ219 弹幕域 Projectile.oldPos 残影族——结构锁+逐弹参数锁+记录面行为+绘制面行为。
// 原版锚（Terarria1457）：
//   · ProjectileID.cs:385 TrailingMode / :387 TrailCacheLength —— 全表 recon（逐键对拍）
//   · Main.cs:30609-31360 通用残影表 + :32543/:32563/:34867/:34895 专用帧残影四弹
//   · Projectile.cs:17197-17300 UpdateTrails 记录面（mode 0-5）
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PROJ_TRAILING_MODE, PROJ_TRAIL_CACHE_LEN, ProjGhostRing,
  resolveGhostLoop, GHOST_PARAMS, GHOST_TINT, GHOST_FRAME, drawProjGhosts,
} from '../src/entities/projGhostTrail';

const ROOT = join(dirname(fileURLToPath(new URL(import.meta.url))), '../..');
const PID_PATH = `${ROOT}/Terarria1457/Terraria.ID/ProjectileID.cs`;
const MAIN_PATH = `${ROOT}/Terarria1457/Terraria/Main.cs`;

/** ProjectileID.cs CreateIntSet 解析（`-1, 94, 0, 301, 0, …` / `10, 466, 20, …`）*/
function parseCreateIntSet(src: string): Record<number, number> {
  const m = src.match(/Factory\.CreateIntSet\(([^;]+)\);/);
  expect(m).toBeTruthy();
  const parts = m![1].split(',').map((s) => s.trim());
  const def = parseInt(parts[0], 10);
  const out: Record<number, number> = {};
  for (let k = 1; k + 1 < parts.length; k += 2) out[parseInt(parts[k], 10)] = parseInt(parts[k + 1], 10);
  void def;
  return out;
}

describe('BJ219 记录面全表 recon（ProjectileID.cs:385/:387 逐键对拍）', () => {
  const vanillaMode = parseCreateIntSet(
    readFileSync(PID_PATH, 'utf8').split('\n').filter((l) => l.includes('TrailingMode = Factory.CreateIntSet'))[0],
  );
  const vanillaLen = parseCreateIntSet(
    readFileSync(PID_PATH, 'utf8').split('\n').filter((l) => l.includes('TrailCacheLength = Factory.CreateIntSet'))[0],
  );

  it('TrailingMode 全表逐键相等（无缺/无多/无漂）', () => {
    const mine = { ...PROJ_TRAILING_MODE };
    for (const [k, v] of Object.entries(vanillaMode)) {
      expect(mine[+k], `mode[${k}]`).toBe(v);
      delete mine[+k];
    }
    expect(Object.keys(mine), '多余键').toEqual([]);
  });

  it('TrailCacheLength 全表逐键相等', () => {
    const mine = { ...PROJ_TRAIL_CACHE_LEN };
    for (const [k, v] of Object.entries(vanillaLen)) {
      expect(mine[+k], `len[${k}]`).toBe(v);
      delete mine[+k];
    }
    expect(Object.keys(mine), '多余键').toEqual([]);
  });

  it('缺省档：mode 缺省 -1（不记录）/ len 缺省 10', () => {
    expect(PROJ_TRAILING_MODE[2]).toBeUndefined();          // 燃烧箭不在表 → 不记录
    expect(PROJ_TRAIL_CACHE_LEN[2]).toBeUndefined();
  });
});

describe('BJ219 绘制面参数 recon（Main.cs 通用表+专用四弹 spot 锁）', () => {
  let main = '';
  beforeAll(() => {
    if (existsSync(MAIN_PATH)) main = readFileSync(MAIN_PATH, 'utf8');
  });
  const region = () => {
    const a = main.indexOf('private void DrawProj_TrueNightsEdge');
    const b = main.indexOf('private static void DrawProj_Flamethrower');
    return main.slice(a, b);
  };
  /** 提取 `proj.type == <id>) { … }` 通用表分支体 */
  const branch = (id: number): string => {
    const r = region();
    const re = new RegExp(`proj\\.type == ${id}\\)\\s*\\r?\\n\\t{3}\\{\\r?\\n([\\s\\S]*?)\\r?\\n\\t{3}\\}`, 'g');
    // 同 id 可能命中多块（:30617 帧锚特支 vs :30728 参数表）——取含 num16x 参数的面
    const hits = [...r.matchAll(re)].map((m) => m[1]);
    return hits.find((t) => /num16[4-9]/.test(t)) ?? hits[0] ?? '';
  };

  it('通用表静态参数 spot（:30728-31102 逐支）', () => {
    expect(GHOST_PARAMS[261]).toMatchObject({ start: 18, end: 0, step: -2, gScale: 1.3, denom: 15, rotMul: 0 });
    expect(GHOST_PARAMS[503]).toMatchObject({ start: 1, end: 9, step: 3, gScale: 0.5 });
    expect(GHOST_PARAMS[436]).toMatchObject({ start: 1, end: 8, step: 2, gScale: 0.5 });
    expect(GHOST_PARAMS[424]).toMatchObject({ end: 10, step: 2, gScale: 0.6 });
    expect(GHOST_PARAMS[872]).toMatchObject({ start: 79, end: 0, step: -1, gScale: 1, denom: 10 });
    expect(GHOST_PARAMS[873]).toMatchObject({ start: 39, end: 0, step: -1, gScale: 1.4, denom: 40 });
    expect(GHOST_PARAMS[931]).toMatchObject({ start: 19, end: 0, step: -1, gScale: 0.7, denom: 20 });
    expect(GHOST_PARAMS[636]).toMatchObject({ end: 20, step: 3, gScale: 0.5 });
    expect(GHOST_PARAMS[638]).toMatchObject({ end: 5, step: 1, gScale: 1 });
    expect(GHOST_PARAMS[640]).toMatchObject({ end: 20, step: 1, gScale: 1 });
    expect(GHOST_PARAMS[1026]).toMatchObject({ start: 8, end: 0, step: -2, gScale: 0.5 });
    // ★BJ650 残影列二复报定谳锁（2026-10-13）：864 = num166=12/num164=0/num165=−1/
    //  num167=1.4（Main.cs:30888-30892）+ num168=15/num169=0 缺省（:30724-30725）
    //  + TCL[864]=60（ProjectileID.cs:387）→ 绘 12 份 fade=(12−i)/90——用户实报
    //  「刃杖上方小刃簇」=运动残影列原版本相（静止叠栈 spread=0 实测;单刃轨道
    //  半径=0 无 bob :46578）。参数漂移即此锁红。
    expect(GHOST_PARAMS[864]).toMatchObject({ start: 12, end: 0, step: -1, gScale: 1.4, denom: 15, rotMul: 0 });
    expect(PROJ_TRAIL_CACHE_LEN[864]).toBe(60);
    expect(PROJ_TRAILING_MODE[864]).toBe(2);
    expect(GHOST_PARAMS[909]).toMatchObject({ start: 5, end: 0, step: -1, gScale: 1 });
    expect(GHOST_PARAMS[1097]).toMatchObject({ start: 19, end: 0, step: -3, gScale: 0.5 });
    expect(GHOST_PARAMS[582]).toMatchObject({ end: 10, step: 2, gScale: 0.7, rotMul: 0.2 });
    expect(GHOST_PARAMS[532]).toMatchObject({ end: 10, step: 1, gScale: 0.7, rotMul: 0.2 });
    expect(GHOST_PARAMS[409]).toMatchObject({ start: 1, end: 10, step: 2, gScale: 0.5 });
    expect(GHOST_PARAMS[437]).toMatchObject({ start: 1, end: 10, step: 2, gScale: 0.2 });
    expect(GHOST_PARAMS[385]).toMatchObject({ start: 1, end: 8, step: 2, gScale: 0.4 });
    expect(GHOST_PARAMS[388]).toMatchObject({ start: 1, end: 2, step: 1, gScale: 1 });
  });

  it('原版分支体逐值对拍（取样 6 弹）', () => {
    if (!main) return;                                     // 无反编译树环境跳过
    expect(branch(261)).toContain('num166 = 18');
    expect(branch(261)).toContain('num165 = -2');
    expect(branch(261)).toContain('num167 = 1.3f');
    expect(branch(872)).toContain('num166 = 79');
    expect(branch(872)).toContain('num168 = 10f');
    expect(branch(931)).toContain('num168 = 20f');
    expect(branch(931)).toContain('num167 = 0.7f');
    expect(branch(675)).toContain('num164 = 5');
    expect(branch(675)).toContain('num167 = 0.4f');
    expect(branch(1055)).toContain('num164 = proj.frame');
    expect(branch(533)).toContain('proj.ai[0] >= 6f');
    // 专用四弹（409/437/385/388——stride/scale 原文字面）
    const r = region();
    expect(r).toContain('int num272 = 10;');
    expect(r).toContain('int num273 = 2;');
    expect(r).toContain('float value65 = 0.5f;');          // 409 scale
    expect(r).toContain('float value67 = 0.2f;');          // 437 scale
    expect(r).toContain('int num474 = 8;');
    expect(r).toContain('float value137 = 0.4f;');         // 385 scale
    expect(r).toContain('num478 = 10;');                   // 388 ai0==2 长档
    expect(r).toContain('num478 = 3;');                    // 388 短档
  });

  it('高尔夫球死条目 quirk 锁（表内不收——循环恒空,:31458-31462）', () => {
    for (const id of [721, 739, 744, 752]) {
      expect(GHOST_PARAMS[id], `golf ${id} 不得进通用表`).toBeUndefined();
    }
    // 661 死条目：start=1,end=0,step=1 → 循环体不执行（黑环在 :31362 特支）
    expect(GHOST_PARAMS[661]).toMatchObject({ start: 1, end: 0, step: 1 });
  });

  it('帧锚特支 spot（:30617-30726）', () => {
    expect(GHOST_FRAME[503]).toMatchObject({ originY: 70 });
    expect(GHOST_FRAME[686]).toMatchObject({ originY: -70 });
    expect(GHOST_FRAME[438]).toMatchObject({ frameRow: 'zero' });
    expect(GHOST_FRAME[408]).toMatchObject({ frameRow: 'n408' });
    expect(GHOST_FRAME[872]).toMatchObject({ frameRow: 'curHalfW' });
    expect(GHOST_FRAME[833]).toMatchObject({ zeroHalfH: true, originY: -4, originX: -7 });
    expect(GHOST_FRAME[976]).toMatchObject({ cellW: 32, cellH: 18 });
  });
});

describe('BJ219 记录面行为（Projectile.cs:17197-17300 逐式）', () => {
  it('mode 0：每 record 整环后移、[0]=本位、filled 累计', () => {
    const r = new ProjGhostRing(261);                      // mode 0/cap 20
    expect(r.mode).toBe(0);
    expect(r.cap).toBe(20);
    r.record(100, 50, 0.3, 1, true);
    r.record(110, 52, 0.3, 1, true);
    r.record(120, 54, 0.3, 1, true);
    expect(r.filled).toBe(3);
    expect(r.at(0)).toMatchObject({ x: 120, y: 54 });
    expect(r.at(1)).toMatchObject({ x: 110, y: 52 });
    expect(r.at(2)).toMatchObject({ x: 100, y: 50 });
    expect(r.at(3)).toBeNull();                            // Zero 哨兵（未填槽）
  });

  it('mode 2：oldRot/oldSpriteDirection 随环记录（:17234-17245）', () => {
    const r = new ProjGhostRing(671);                      // mode 2/cap 10
    r.record(0, 0, 0.5, 1, true);
    r.record(10, 0, 1.0, -1, true);
    expect(r.at(1)).toMatchObject({ x: 0, y: 0, rot: 0.5, dir: 1 });
    expect(r.at(0)).toMatchObject({ x: 10, y: 0, rot: 1.0, dir: -1 });
  });

  it('mode 3：松弛 0.65 单程+oldRot=段向（:17248-17273）', () => {
    const r = new ProjGhostRing(34);                       // mode 3/cap 30
    r.record(0, 0, 0, 1, true);
    r.record(10, 0, 0, 1, true);
    // 松弛后 [1] 向 [0] 收拢 0.65：0 + (10−0)×0.65 = 6.5;rot=atan2(0,3.5)=0
    expect(r.at(1)!.x).toBeCloseTo(6.5, 6);
    expect(r.at(1)!.rot).toBeCloseTo(0, 6);
    // ≤2px 不松弛（:17266 门）
    r.record(11.5, 0, 0, 1, true);
    expect(r.at(1)!.x).toBeCloseTo(10, 6);                 // dist=1.5 ≤2 → 原 [0] 值不动
  });

  it('mode 4：玩家位移补偿只在 tick 首子步施加（:17283）', () => {
    const r = new ProjGhostRing(933);                      // mode 4/cap 60
    r.record(0, 0, 0, 1, true);
    r.record(10, 0, 0, 1, false, 0, 5, 0);                 // 非首子步（isTickHead=false）
    expect(r.at(1)!.x).toBeCloseTo(0, 6);                  // 旧槽不补偿
    r.record(20, 0, 0, 1, true, 0, 5, 0);                  // 首子步 → 旧槽 += 5
    expect(r.at(1)!.x).toBeCloseTo(10 + 5, 6);
  });

  it('mode 1：frameCounter 门（:17207——仅 frameCounter==0 或空环记录）', () => {
    const r = new ProjGhostRing(466);                      // mode 1/cap 20
    r.record(0, 0, 0, 1, true, 2);                         // 空环 → 恒记录
    expect(r.filled).toBe(1);
    r.record(5, 0, 0, 1, true, 2);                         // frameCounter=2 → 跳
    expect(r.filled).toBe(1);
    r.record(5, 0, 0, 1, true, 0);                         // frameCounter=0 → 记录
    expect(r.filled).toBe(2);
  });

  it('cap 逐 id 取 TrailCacheLength（:387 覆写档）', () => {
    expect(new ProjGhostRing(909).cap).toBe(5);
    expect(new ProjGhostRing(872).cap).toBe(120);
    expect(new ProjGhostRing(771).cap).toBe(80);
    expect(new ProjGhostRing(408).cap).toBe(10);           // 缺省档
  });
});

describe('BJ219 动态参数档（resolveGhostLoop）', () => {
  it('459：end=scale×8/step=end/4（:31017-31024）', () => {
    expect(resolveGhostLoop(459, 0, 0, 1)).toMatchObject({ end: 8, step: 2, gScale: 0.3 });
    expect(resolveGhostLoop(459, 0, 0, 0.4)).toMatchObject({ end: 3, step: 1, gScale: 0.3 });
  });
  it('533：ai0∈[6,8] 三态,其余空循环（:31084-31098）', () => {
    expect(resolveGhostLoop(533, 6, 0, 1)).toMatchObject({ end: 8, step: 1, rotMul: 0.2 });
    expect(resolveGhostLoop(533, 7, 0, 1)).toMatchObject({ end: 4, step: 1, rotMul: 0 });
    expect(resolveGhostLoop(533, 8, 0, 1)).toMatchObject({ end: 4, step: 1, rotMul: 0.2 });
    expect(resolveGhostLoop(533, 0, 0, 1)).toBeNull();
  });
  it('1055：end=frame（8→−1/9→−2,:30728-30735）', () => {
    expect(resolveGhostLoop(1055, 0, 5, 1)).toMatchObject({ end: 5, step: 1 });
    expect(resolveGhostLoop(1055, 0, 8, 1)).toMatchObject({ end: 7 });
    expect(resolveGhostLoop(1055, 0, 9, 1)).toMatchObject({ end: 7 });
  });
  it('388：ai0==2 长档 end=9（:34903-34911）', () => {
    expect(resolveGhostLoop(388, 2, 0, 1)).toMatchObject({ end: 9, step: 1 });
    expect(resolveGhostLoop(388, 0, 0, 1)).toMatchObject({ end: 2, step: 1 });
  });
});

describe('BJ219 逐型色特支（Main.cs:31141-31344）', () => {
  const C = { id: 0, i: 1, start: 1, end: 1, fade: 1, ai0: 0, ai1: 0, timeLeft: 999, opacity: 1, bodyScale: 1, vxLen: 10, rng: () => 0 };

  it('蓝染 0.5 族（:31141）+ 682 G/=i（:31301）', () => {
    expect(GHOST_TINT[731]!({ ...C, i: 4 })!.rgb).toEqual([127.5, 127.5, 255]);
    const g = GHOST_TINT[682]!({ ...C, i: 4 })!.rgb;
    expect(g[0]).toBeCloseTo(127.5);
    expect(g[1]).toBeCloseTo(127.5 / 4);
    expect(g[2]).toBeCloseTo(255);
  });
  it('424 红染 0.5 后 B,G,A/=i（:31147+:31318）', () => {
    const t = GHOST_TINT[424]!({ ...C, i: 5 })!;
    expect(t.rgb).toEqual([255, 25.5, 25.5]);
    expect(t.aMul).toBeCloseTo(0.2);
  });
  it('639 A=127 档（:31151）/ 640 R/=i+A=127（:31207）', () => {
    expect(GHOST_TINT[639]!({ ...C })!.aMul).toBeCloseTo(0.5);
    const t = GHOST_TINT[640]!({ ...C, i: 10 })!;
    expect(t.rgb[0]).toBeCloseTo(25.5);
    expect(t.aMul).toBeCloseTo(0.5);
  });
  it('711 紫/黑两段+A 环（:31272-31282）', () => {
    const t = GHOST_TINT[711]!({ ...C, i: 10, start: 19 })!;
    expect(t.rgb[0]).toBeLessThan(128);                    // t≥0.5 → 向黑收
    expect(t.aMul).toBeGreaterThan(0.7);
  });
  it('1097 ai1==1 → num167×1.25（:31264-31269）', () => {
    expect(GHOST_TINT[1097]!({ ...C, i: 5, start: 19 })!.gScaleMul).toBeUndefined();
    expect(GHOST_TINT[1097]!({ ...C, i: 5, start: 19, ai1: 1 })!.gScaleMul).toBeCloseTo(1.25);
  });
  it('385 专用 fade 折算 Lerp(1,(8−i)/15,0.3)（:34879-34883）', () => {
    // i=5: fade=(8−5)/15=0.2;aMul=0.3+0.7×0.2=0.44 → 折算 0.44/0.2=2.2
    const t = GHOST_TINT[385]!({ ...C, i: 5, end: 8, fade: 3 / 15 })!;
    expect(t.aMul).toBeCloseTo(2.2);
  });
  it('964/965 Black（:31328-31330——opacity 走 bodyAlpha 面）', () => {
    expect(GHOST_TINT[964]!({ ...C })!.rgb).toEqual([0, 0, 0]);
  });
});

// ===================== 绘制面行为（FakeCanvas 桩——bj112c 同习语） =====================

interface FakeCtx2d {
  globalAlpha: number; globalCompositeOperation: string; imageSmoothingEnabled: boolean;
  fillStyle: string;
  calls: Array<{ op: string; args: unknown[]; alpha: number; blend: string }>;
  save(): void; restore(): void;
  translate(x: number, y: number): void; rotate(r: number): void; scale(x: number, y: number): void;
  drawImage(img: unknown, ...rest: unknown[]): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}
function makeCtx(): FakeCtx2d {
  const calls: FakeCtx2d['calls'] = [];
  const ctx: FakeCtx2d = {
    globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: false,
    fillStyle: '', calls,
    save() { /* 桩 */ },
    restore() { /* 桩 */ },
    translate(...a: unknown[]) { calls.push({ op: 'translate', args: a, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation }); },
    rotate(...a: unknown[]) { calls.push({ op: 'rotate', args: a, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation }); },
    scale(...a: unknown[]) { calls.push({ op: 'scale', args: a, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation }); },
    drawImage(...args: unknown[]) {
      calls.push({ op: 'drawImage', args, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation });
    },
    fillRect(...args: unknown[]) {
      calls.push({ op: 'fillRect', args, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation });
    },
  };
  return ctx;
}
function stubDocument(): void {
  (globalThis as Record<string, unknown>).document = {
    createElement(_t: string) {
      const cv = { width: 0, height: 0, _ctx: null as FakeCtx2d | null };
      (cv as unknown as { getContext(k: string): FakeCtx2d | null }).getContext = () => makeCtx();
      return cv;
    },
  };
}

describe('BJ219 绘制面行为（fake ctx）', () => {
  beforeAll(() => { stubDocument(); });

  function fakeTex(w = 20, h = 40): HTMLCanvasElement {
    return { width: w, height: h } as unknown as HTMLCanvasElement;
  }

  it('261 滚石残影：环内槽才画、fade=(18−i)/30、scale=Lerp(1,1.3,i/15)', () => {
    const ring = new ProjGhostRing(261);
    ring.record(100, 200, 0, 1, true);
    ring.record(110, 200, 0, 1, true);
    ring.record(120, 200, 0, 1, true);
    const ctx = makeCtx();
    drawProjGhosts(ctx as unknown as CanvasRenderingContext2D, {
      ring, id: 261, tex: fakeTex(), frames: 1, frame: 0,
      bodyW: 20, bodyH: 20, bodyRot: 0.7, bodyScale: 1, bodyAlpha: 1,
      ai0: 0, ai1: 0, timeLeft: 300, opacity: 1, vxLen: 5, spriteDirection: 1,
    });
    const draws = ctx.calls.filter((c) => c.op === 'drawImage');
    // 环 filled=3 → 仅 i=2 命中（i=18..4 全 Zero 哨兵跳过）
    expect(draws.length).toBe(1);
    expect(draws[0].alpha).toBeCloseTo((18 - 2) / 30, 6);
    expect(draws[0].blend).toBe('source-over');            // aMul=1 档单笔
  });

  it('mode 2 镜像：oldSpriteDirection==−1 → scale(-1,1) XOR（:31337-31341）', () => {
    const ring = new ProjGhostRing(671);                   // mode 2/aMul=1 单笔
    ring.record(0, 0, 0.4, -1, true);
    ring.record(3, 0, 0.4, -1, true);
    const ctx = makeCtx();
    drawProjGhosts(ctx as unknown as CanvasRenderingContext2D, {
      ring, id: 671, tex: fakeTex(), frames: 1, frame: 0,
      bodyW: 10, bodyH: 10, bodyRot: 0.4, bodyScale: 1, bodyAlpha: 1,
      ai0: 0, ai1: 0, timeLeft: 300, opacity: 1, vxLen: 5, spriteDirection: -1,
    });
    const draws = ctx.calls.filter((c) => c.op === 'drawImage');
    expect(draws.length).toBe(1);                          // i=1（其余 Zero 哨兵）
    const flips = ctx.calls.filter((c) => c.op === 'scale' && c.args[0] === -1);
    expect(flips.length).toBe(1);                          // XOR 镜像恰一次
  });

  it('mode 0 不镜像：ring dir 无消费（:31333 num177=proj.rotation 支）', () => {
    const ring = new ProjGhostRing(261);
    ring.record(0, 0, 0, -1, true);
    ring.record(3, 0, 0, -1, true);
    ring.record(6, 0, 0, -1, true);
    const ctx = makeCtx();
    drawProjGhosts(ctx as unknown as CanvasRenderingContext2D, {
      ring, id: 261, tex: fakeTex(), frames: 1, frame: 0,
      bodyW: 10, bodyH: 10, bodyRot: 0, bodyScale: 1, bodyAlpha: 1,
      ai0: 0, ai1: 0, timeLeft: 300, opacity: 1, vxLen: 5, spriteDirection: -1,
    });
    expect(ctx.calls.filter((c) => c.op === 'scale' && c.args[0] === -1).length).toBe(0);
  });

  it('A≠1 档双笔（639 A=127 → cut 黑染 + add lighter）', () => {
    const ring = new ProjGhostRing(639);                   // mode 0/cap 10
    ring.record(0, 0, 0, 1, true);
    ring.record(4, 0, 0, 1, true);
    const ctx = makeCtx();
    drawProjGhosts(ctx as unknown as CanvasRenderingContext2D, {
      ring, id: 639, tex: fakeTex(), frames: 1, frame: 0,
      bodyW: 10, bodyH: 10, bodyRot: 0, bodyScale: 1, bodyAlpha: 1,
      ai0: 0, ai1: 0, timeLeft: 300, opacity: 1, vxLen: 5, spriteDirection: 1,
    });
    const draws = ctx.calls.filter((c) => c.op === 'drawImage');
    // i=1 一槽：fade=(10−1)/15=0.6;cut(alpha=0.3)+add(lighter,0.6) 两笔
    expect(draws.length).toBe(2);
    expect(draws[0].blend).toBe('source-over');
    expect(draws[0].alpha).toBeCloseTo(0.3, 6);
    expect(draws[1].blend).toBe('lighter');
    expect(draws[1].alpha).toBeCloseTo(0.6, 6);
  });

  it('环长门（:31134）+ 哨兵门：i≥cap / 未填槽零绘制', () => {
    const ring = new ProjGhostRing(261);                   // cap 20,start 18 → i=18 ≥ filled
    const ctx = makeCtx();
    drawProjGhosts(ctx as unknown as CanvasRenderingContext2D, {
      ring, id: 261, tex: fakeTex(), frames: 1, frame: 0,
      bodyW: 20, bodyH: 20, bodyRot: 0, bodyScale: 1, bodyAlpha: 1,
      ai0: 0, ai1: 0, timeLeft: 300, opacity: 1, vxLen: 5, spriteDirection: 1,
    });
    expect(ctx.calls.filter((c) => c.op === 'drawImage').length).toBe(0);
  });

  it('873 逐槽行进（H+2 回绕 ×7,:31358-31362）——相邻槽帧行不同', () => {
    const ring = new ProjGhostRing(873);
    for (let k = 0; k < 40; k++) ring.record(k * 4, 0, 0, 1, true);   // 环填满 60? cap=60 → 40 槽
    const ctx = makeCtx();
    drawProjGhosts(ctx as unknown as CanvasRenderingContext2D, {
      ring, id: 873, tex: fakeTex(20, 140), frames: 7, frame: 0,
      bodyW: 10, bodyH: 10, bodyRot: 0, bodyScale: 1, bodyAlpha: 1,
      ai0: 0, ai1: 0, timeLeft: 300, opacity: 1, vxLen: 5, spriteDirection: 1,
    });
    const draws = ctx.calls.filter((c) => c.op === 'drawImage');
    expect(draws.length).toBeGreaterThan(2);
    const syOf = (c: FakeCtx2d['calls'][number]) => (c.args[2] as number);
    expect(syOf(draws[0])).not.toBe(syOf(draws[2]));       // 逐槽行进→相邻【槽】帧行不同（draws[0]/[1]=同槽 cut+add 双笔）
  });
});

