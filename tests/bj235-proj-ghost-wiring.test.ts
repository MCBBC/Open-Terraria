// ★BJ235 弹域残影接线续批（BJ219 登记债清偿）——
//   ① 833-835 速度染因子补乘（Main.cs:31307-31314 lerpValue2）
//   ② 833-835 底心锚帧门（:30706/:30716——frame==8/10 整支回缺省档）
//   ③ 绿带 1020/1024/1026 DrawTrail 面（:28301-28328/:28508-28561）
//   ④ Celeb2 715-18 烟花链（:33997-34083,三帧横条第 2 帧）
//   ⑤ 1089 彩虹荧光棒链（:33270-33306,num342/num344 双端渐隐）
//   ⑥ 563 Gradient hsl 双笔轨（:35283-35299,槽位+中点）
//   ⑦ 接线位锁：MinionProj/RollingBoulder/Celeb2/GlowstickProj/YoyoProj/Arrow
//      dispatch（ai1=empressHue）+ bossAI_lategame 872 注入
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ProjGhostRing, GHOST_TINT, drawProjGhosts,
  drawGreenBandTrail, drawCeleb2Chain, drawRainbowChain, drawHslMidpointTrail,
  resolveGhostLoop,
} from '../src/entities/projGhostTrail';
import { MinionProj, minionTrueBox } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { setProjSpriteOverride } from '../src/entities/Arrow';

const ROOT = join(dirname(fileURLToPath(new URL(import.meta.url))), '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

// ===================== ① 833-835 速度染（:31307-31314） =====================

describe('BJ235 ① 833-835 速度染因子（:31307-31314 lerpValue2=GetLerpValue(0,6,|v|)）', () => {
  const C = { id: 833, i: 1, start: 6, end: 0, fade: 1, ai0: 0, ai1: 0, timeLeft: 999, opacity: 1, bodyScale: 1, vxLen: 6, rng: () => 0 };

  it('全速（|v|≥6）→ l=1 → rgb 白;A=0（纯加法单笔）', () => {
    const t = GHOST_TINT[833]!({ ...C, vxLen: 6 })!;
    expect(t.rgb).toEqual([255, 255, 255]);
    expect(t.aMul).toBe(0);
    const t2 = GHOST_TINT[835]!({ ...C, vxLen: 20 })!;
    expect(t2.rgb).toEqual([255, 255, 255]);
  });
  it('半速（|v|=3）→ l=0.5 → rgb 半白（×lerpValue2 染侧因子）', () => {
    const t = GHOST_TINT[834]!({ ...C, vxLen: 3 })!;
    expect(t.rgb[0]).toBeCloseTo(127.5, 6);
    expect(t.rgb[1]).toBeCloseTo(127.5, 6);
    expect(t.rgb[2]).toBeCloseTo(127.5, 6);
  });
  it('静止（|v|=0）→ l=0 → rgb 全黑=加算零贡献（原版残影消失同相）', () => {
    const t = GHOST_TINT[833]!({ ...C, vxLen: 0 })!;
    expect(t.rgb).toEqual([0, 0, 0]);
  });
});

// ===================== ② 833-835 底心锚帧门（:30706/:30716） =====================

interface FakeCall { op: string; args: unknown[]; alpha: number; blend: string }
function makeCtx() {
  const calls: FakeCall[] = [];
  const ctx = {
    globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: false,
    fillStyle: '', calls,
    save() { /* 桩 */ },
    restore() { /* 桩 */ },
    translate(...a: unknown[]) { calls.push({ op: 'translate', args: a, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation }); },
    rotate(...a: unknown[]) { calls.push({ op: 'rotate', args: a, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation }); },
    scale(...a: unknown[]) { calls.push({ op: 'scale', args: a, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation }); },
    drawImage(...args: unknown[]) { calls.push({ op: 'drawImage', args, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation }); },
    fillRect(...args: unknown[]) { calls.push({ op: 'fillRect', args, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation }); },
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: FakeCall[] };
}
function stubDocument(): void {
  (globalThis as Record<string, unknown>).document = {
    createElement(_t: string) {
      const cv = { width: 0, height: 0, getContext: () => makeCtx() };
      return cv;
    },
  };
}
const fakeTex = (w = 20, h = 40) => ({ width: w, height: h }) as unknown as HTMLCanvasElement;

function ghostOpts(ring: ProjGhostRing, over: Partial<Parameters<typeof drawProjGhosts>[1]> = {}): Parameters<typeof drawProjGhosts>[1] {
  return {
    ring, id: 833, tex: fakeTex(54, 360), frames: 10, frame: 0,
    bodyW: 26, bodyH: 20, bodyRot: 0, bodyScale: 1, bodyAlpha: 1,
    ai0: 0, ai1: 0, timeLeft: 300, opacity: 1, vxLen: 6, spriteDirection: 1,
    ...over,
  } as Parameters<typeof drawProjGhosts>[1];
}

describe('BJ235 ② 833 底心锚帧门（:30706 frame!=8 门反支回缺省档）', () => {
  beforeAll(() => stubDocument());

  function firstTranslateY(frame: number): number {
    const ring = new ProjGhostRing(833);
    ring.record(100, 200, 0, 1, true);
    ring.record(100, 200, 0, 1, true);   // 2 槽（start=6 step=-1 → 仅 i=1 可达）
    const ctx = makeCtx();
    drawProjGhosts(ctx, ghostOpts(ring, { frame }));
    const tr = ctx.calls.filter((c) => c.op === 'translate');
    expect(tr.length).toBe(1);
    return tr[0].args[1] as number;
  }

  it('frame=0（门未中）→ zero.Y+=h/2 + origin=(w/2−7×flip, h−4)', () => {
    const ty = firstTranslateY(0);
    expect(ty).toBeCloseTo(200 + 10 + 10, 6);          // zeroHalfH：gy += bodyH/2
    const ring = new ProjGhostRing(833);
    ring.record(100, 200, 0, 1, true);
    ring.record(100, 200, 0, 1, true);
    const ctx = makeCtx();
    drawProjGhosts(ctx, ghostOpts(ring, { frame: 0, spriteDirection: -1 }));   // flip=1 → X−7
    const dr = ctx.calls.filter((c) => c.op === 'drawImage')[0];
    // drawOnce 9 参：（tex, sx, syI, sw, sh, dx, dy, dw, dh）——scale=Lerp(1,1.5,1/15)
    const s1 = 1 + (1.5 - 1) * (1 / 15);                // i=1 槽 scale
    expect(dr.args[5] as number).toBeCloseTo(-(54 / 2 - 7) * s1, 6);   // ox = (w/2 − 7×flip)×s
    expect(dr.args[6] as number).toBeCloseTo(-(360 / 10 - 4) * s1, 6); // oy = (h_frame − 4)×s
    expect(dr.args[7] as number).toBeCloseTo(54 * s1, 6);              // dw = sw×s（'cur' 全宽）
    expect(dr.args[8] as number).toBeCloseTo(36 * s1, 6);              // dh = 帧高×s
  });
  it('frame=8（门命中）→ 整支回缺省档：无 zeroHalfH、origin=帧心、无 ±7 偏移', () => {
    const ty = firstTranslateY(8);
    expect(ty).toBeCloseTo(200 + 10, 6);                // 无 zeroHalfH
    const ring = new ProjGhostRing(833);
    ring.record(100, 200, 0, 1, true);
    ring.record(100, 200, 0, 1, true);
    const ctx = makeCtx();
    drawProjGhosts(ctx, ghostOpts(ring, { frame: 8, spriteDirection: -1 }));
    const dr = ctx.calls.filter((c) => c.op === 'drawImage')[0];
    const s1 = 1 + (1.5 - 1) * (1 / 15);
    expect(dr.args[5] as number).toBeCloseTo(-(54 / 2) * s1, 6);        // 帧心
    expect(dr.args[6] as number).toBeCloseTo(-(36 / 2) * s1, 6);
  });
  it('834 frame=10 门同构（gateFrame=10）', () => {
    const ring = new ProjGhostRing(834);
    ring.record(0, 0, 0, 1, true);
    ring.record(0, 0, 0, 1, true);
    const ctx = makeCtx();
    drawProjGhosts(ctx, ghostOpts(ring, { id: 834, frame: 10, tex: fakeTex(64, 528), frames: 12, bodyW: 20, bodyH: 30 }));
    const dr = ctx.calls.filter((c) => c.op === 'drawImage')[0];
    // 门命中 → 帧心（sh = 528/12 = 44,sw = 64）×scale i=1
    const s1 = 1 + (1.5 - 1) * (1 / 15);
    expect(dr.args[5] as number).toBeCloseTo(-(64 / 2) * s1, 6);
    expect(dr.args[6] as number).toBeCloseTo(-(44 / 2) * s1, 6);
  });
});

// ===================== ③ 绿带 DrawTrail（:28309-28328/:28508-28561） =====================

describe('BJ235 ③ 绿带 1020/1024/1026（DrawTrail 1:1）', () => {
  it('1026 单遍：α=(1−i/10)、色 rgb(140,234,180)、条带 4px 宽×段长', () => {
    const ring = new ProjGhostRing(1026);
    ring.record(0, 0, 0, 1, true);
    ring.record(30, 0, 0, 1, true);
    ring.record(60, 0, 0, 1, true);                     // 3 槽 → 段 i=2,i=1
    const ctx = makeCtx();
    drawGreenBandTrail(ctx, ring, 1026, 30, 72);
    const fills = ctx.calls.filter((c) => c.op === 'fillRect');
    expect(fills.length).toBe(2);
    expect(fills[0].alpha).toBeCloseTo(1 - 2 / 10, 6);  // i=2 → 0.8
    expect(fills[1].alpha).toBeCloseTo(1 - 1 / 10, 6);  // i=1 → 0.9
    expect(fills[0].args.slice(-2)).toEqual([30, 4]);   // 段长 30 × 宽 4
    expect(String(ctx.fillStyle)).toBe('rgb(140,234,180)');
  });
  it('1020 支已随清偿刀 N 退役（2026-09-30）：载体=DroneProjs JimsDroneProj（自带双尾迹+cPet 染色版）,Arrow 不再携带 1020 → drawGreenBandTrail(1020)=no-op', () => {
    // 旧锚（绿带 4 段/α=(127/255)×(1−i/20)/色 (177,255,32)）已随 1020 分支摘除
    // 而失效——原版 DrawContinuousTrail（Main.cs:28300-28328）有 cPet 染料门
    // （cPet==0 绿带 / cPet!=0 白带过整弹染料 pass）,染色实装面在
    // src/data/projDye.ts（dyedSolidBand）+ DroneProjs.draw,本函数只承载无染料
    // 门的 1024/1026（上方两锚维持）。判别锁：1020 入参零绘制=死支摘除回归锁。
    const ring = new ProjGhostRing(1020);               // cap 20/mode 2
    ring.record(0, 0, 0.5, 1, true);
    ring.record(40, 0, 0.5, 1, true);
    ring.record(80, 0, 0.5, 1, true);
    const ctx = makeCtx();
    drawGreenBandTrail(ctx, ring, 1020, 32, 20);
    expect(ctx.calls.filter((c) => c.op === 'fillRect').length).toBe(0);
    expect(ctx.calls.filter((c) => c.op === 'translate').length).toBe(0);
  });
  it('未填槽（Zero 哨兵）不画', () => {
    const ring = new ProjGhostRing(1026);
    ring.record(0, 0, 0, 1, true);                      // 1 槽 → 无段
    const ctx = makeCtx();
    drawGreenBandTrail(ctx, ring, 1026, 30, 72);
    expect(ctx.calls.filter((c) => c.op === 'fillRect').length).toBe(0);
  });
});

// ===================== ④ Celeb2 烟花链（:33997-34083） =====================

describe('BJ235 ④ Celeb2 715-18 链（三帧横条第 2 帧）', () => {
  const TEX = fakeTex(48, 28);                          // Frame(3)=16×28

  it('逐段：源矩形=第 2 帧（sx=32）、α=(0.8×127/255)×(1−i/20)、rot=oldRot', () => {
    const ring = new ProjGhostRing(715);                // cap 20/mode 2
    ring.record(0, 0, 0.25, 1, true);
    ring.record(20, 0, 0.25, 1, true);
    ring.record(40, 0, 0.25, 1, true);
    const ctx = makeCtx();
    drawCeleb2Chain(ctx, ring, TEX, [255, 0, 0], 0, 1080, 14, 14, 16, 28);
    const draws = ctx.calls.filter((c) => c.op === 'drawImage');
    expect(draws.length).toBe(2);
    expect(draws[0].args[1]).toBe(32);                  // value112.X += W×2（9 参:args[1]=sx）
    expect(draws[0].alpha).toBeCloseTo((127 / 255) * 0.8 * (1 - 2 / 20), 6);
    const rot = ctx.calls.filter((c) => c.op === 'rotate')[0].args[0];
    expect(rot).toBeCloseTo(0.25, 6);
  });
  it('变体 5：scale×0.5（drawImage 宽 = 段长×0.5）', () => {
    const ring = new ProjGhostRing(715);
    ring.record(0, 0, 0, 1, true);
    ring.record(40, 0, 0, 1, true);                     // 段长 40
    const ctx = makeCtx();
    drawCeleb2Chain(ctx, ring, TEX, [80, 20, 180], 5, 1080, 14, 14, 16, 28);
    const dr = ctx.calls.filter((c) => c.op === 'drawImage')[0];
    const dw = dr.args[7] as number;                    // 9 参:args[7]=dw = frameW × (40/16) × 0.5
    expect(dw).toBeCloseTo(16 * (40 / 16) * 0.5, 6);
  });
  it('变体 2 摆动：ph=1 → 沿段向偏 +4px;scale×0.6', () => {
    const ring = new ProjGhostRing(715);
    ring.record(0, 0, 0, 1, true);
    ring.record(40, 0, 0, 1, true);                     // i=1,rot=0;timeLeft 使 ph=(1+tl)%20=1
    const ctx = makeCtx();
    drawCeleb2Chain(ctx, ring, TEX, [255, 215, 0], 2, 0, 14, 14, 16, 28);  // tl=0 → ph=1
    const tr = ctx.calls.filter((c) => c.op === 'translate')[0];
    expect(tr.args[0]).toBeCloseTo(0 + 7 + Math.cos(0) * 1 * 4, 6);   // x+size/2+w×4
    const dr = ctx.calls.filter((c) => c.op === 'drawImage')[0];
    expect(dr.args[7] as number).toBeCloseTo(16 * (40 / 16) * 0.6, 6);
  });
});

// ===================== ⑤ 1089 彩虹荧光棒链（:33270-33306） =====================

describe('BJ235 ⑤ 1089 链（MagicPixel 4.4 宽段带,双端渐隐）', () => {
  it('新端 i≤10 逐槽 −0.1（先取值后减）+ 老端 13 槽 1/13 爬坡;色=Disco', () => {
    const ring = new ProjGhostRing(1089);               // cap 25
    for (let k = 0; k < 25; k++) ring.record(k * 4, 0, 0, 1, true);
    const ctx = makeCtx();
    drawRainbowChain(ctx, ring, [200, 40, 60], 6, 6);
    const fills = ctx.calls.filter((c) => c.op === 'fillRect');
    // 槽 24（最老,ramp=0）α=0 跳;槽 23..1 可见（ramp 爬坡×newestFade）→ 23 笔
    expect(fills.length).toBe(23);
    expect(fills[0].alpha).toBeCloseTo((127 / 255) * (1 / 13) * 1, 6);       // i=23（首笔,ramp 1/13）
    expect(fills[22].alpha).toBeCloseTo((127 / 255) * 0.1 * 1, 6);           // i=1（新端 ×0.1）
    expect(String(ctx.fillStyle)).toBe('rgb(200,40,60)');
    const w = fills[0].args[2] as number, h = fills[0].args[3] as number;
    expect(w).toBeCloseTo(4, 6);                        // 段长 = 相邻槽距 4px/子步
    expect(h).toBeCloseTo(4.4, 6);                      // 2.2×2 带宽
  });
  it('cap 门：未满环只画已填段', () => {
    const ring = new ProjGhostRing(1089);
    ring.record(0, 0, 0, 1, true);
    ring.record(4, 0, 0, 1, true);                      // 2 槽：i=1（ramp=0→α0 跳）
    const ctx = makeCtx();
    drawRainbowChain(ctx, ring, [255, 0, 0], 6, 6);
    expect(ctx.calls.filter((c) => c.op === 'fillRect').length).toBe(0);  // 唯一段 α=0
  });
});

// ===================== ⑥ 563 Gradient 双笔轨（:35283-35299） =====================

describe('BJ235 ⑥ 563 轨（槽位+中点双笔,hsl 色环）', () => {
  it('9 槽 × 2 笔=18 笔;α=(127/255)×(1−i/10)²×0.65;中点=相邻槽均值+size/2', () => {
    const ring = new ProjGhostRing(563);                // cap 60/mode 2
    for (let k = 0; k < 12; k++) ring.record(k * 10, 0, k * 0.1, 1, true);
    const ctx = makeCtx();
    drawHslMidpointTrail(ctx, ring, fakeTex(16, 16), 0.7, 1.05, 1, 0, 16, 16);
    const draws = ctx.calls.filter((c) => c.op === 'drawImage');
    expect(draws.length).toBe(18);                      // 9 槽 ×（槽位+中点）
    // 首笔 = i=9 槽位心：slot9.x=(11−9)×10=20 → 20+8;rot=本体角 0.7
    const tr0 = ctx.calls.filter((c) => c.op === 'translate')[0];
    expect(tr0.args).toEqual([20 + 8, 0 + 8]);
    const rot0 = ctx.calls.filter((c) => c.op === 'rotate')[0].args[0];
    expect(rot0).toBeCloseTo(0.7, 6);
    // 中点笔（第 2 笔）x = (slot9.x+slot8.x)/2+8 = (20+30)/2+8
    const tr1 = ctx.calls.filter((c) => c.op === 'translate')[1];
    expect(tr1.args[0]).toBeCloseTo((20 + 30) / 2 + 8, 6);
    // i=1 α：draws 尾对（i=1）→ (127/255)×0.81×0.65
    const lastAlpha = draws[draws.length - 1].alpha;
    expect(lastAlpha).toBeCloseTo((127 / 255) * (1 - 0.1) * (1 - 0.1) * 0.65, 6);
  });
});

// ===================== ⑦ 接线位锁（源文本+行为） =====================

describe('BJ235 ⑦ 接线位锁', () => {
  const MINION = read('src/entities/MinionProj.ts');
  const ROLL = read('src/entities/RollingBoulder.ts');
  const CELEB = read('src/entities/Celeb2.ts');
  const WP = read('src/entities/WeaponProj.ts');
  const ARROW = read('src/entities/Arrow.ts');
  const LATEGAME = read('src/entities/bossAI_lategame.ts');

  it('MinionProj：记录位=fixedUpdate 尾 contact 后;绘制片含 533 dA0 直喂', () => {
    const iContact = MINION.indexOf('this.contact(game, dmg0);');
    const iRec = MINION.indexOf('this.recordGhostTrail();');
    expect(iRec).toBeGreaterThan(iContact);
    expect(MINION).toContain('ai0: this.projId === 533 ? this.dA0 : 0,');
    expect(MINION).toContain('drawProjGhosts(ctx, {');
    expect(MINION).toContain("import { ProjGhostRing, drawProjGhosts, projTrailingMode } from './projGhostTrail';");
  });
  it('RollingBoulder：1055 记录+绘制接线（记录在 moveAndCollide 后）', () => {
    expect(ROLL).toContain('if (this.projId === 1055 && this.ghostRing) {');
    expect(ROLL).toContain('projTrailingMode(this.projId) >= 0 ? new ProjGhostRing(this.projId) : null');
    const iMove = ROLL.indexOf('moveAndCollide(this, game.world, this.vx * df, this.vy * df);');
    const iRec = ROLL.indexOf('this.ghostRing?.record(this.x, this.y, this.rotation');
    expect(iRec).toBeGreaterThan(iMove);
  });
  it('Celeb2：每子步记录（step 内,撞块杀 return 之后=原版 :17132 同相）+ 链面本体前', () => {
    expect(CELEB).toContain('this.ghostRing?.record(this.x, this.y, this.rot, this.vx < 0 ? -1 : 1, true);');
    expect(CELEB).toContain('drawCeleb2Chain(ctx, this.ghostRing, img,');
    const iChain = CELEB.indexOf('drawCeleb2Chain(ctx, this.ghostRing, img,');
    const iBody = CELEB.indexOf('ctx.translate(this.cx, this.cy);\n    ctx.rotate(this.rot);');
    expect(iChain).toBeGreaterThan(-1);
    expect(iChain).toBeLessThan(iBody);                 // 链先于本体
  });
  it('GlowstickProj 1089：记录+disco 链;YoyoProj 563：记录+hsl 轨', () => {
    expect(WP).toContain('drawRainbowChain(ctx, this.ghostRing, rgb, this.w, this.h);');
    expect(WP).toContain('drawHslMidpointTrail(r.ctx, this.ghostRing, tex563, this.rot,');
    const iDrawEnd = WP.indexOf('drawRainbowChain(ctx, this.ghostRing, rgb, this.w, this.h);');
    const iRec = WP.indexOf("this.ghostRing?.record(this.x, this.y, this.rot, this.vx < 0 ? -1 : 1, true);");
    expect(iRec).toBeGreaterThan(iDrawEnd);             // 记录位在 fixedUpdate（文件序后于 draw）
  });
  it('Arrow dispatch：绿带三 id 呼出 + ai1=empressHue 喂入 + 排除集 1020/1024 出排', () => {
    expect(ARROW).toContain('drawGreenBandTrail(ctx, this.ghostRing, this.projId, this.w, this.h);');
    expect(ARROW).toContain('ai1: this.empressHue ?? 0,');
    expect(ARROW).not.toMatch(/1020, 1024,\s*\/\/ DrawTrail 绿带/);
    expect(ARROW).toContain('715, 716, 717, 718,                    // Celeb2 烟花链（Celeb2.ts 自管环+链面,BJ235 落地）');
  });
  it('bossAI_lategame：872 注入 empressHue=t（:46982 num65）', () => {
    expect(LATEGAME).toContain("num9, 872, 300, { empressHue: t });");
  });
  it('533 ai0 三态档经实体直喂后展开（dA0=6 → end=8 冲刺档）', () => {
    expect(resolveGhostLoop(533, 6, 0, 1)).toMatchObject({ end: 8, step: 1 });
    expect(resolveGhostLoop(533, 0, 0, 1)).toBeNull();  // 待机/蓄力无残影（:31093-31097）
  });
});

// ===================== ⑧ 实体级行为（MinionProj 533 记录→绘制闭环,fx6 习语） =====================

describe('BJ235 ⑧ MinionProj 533 残影闭环（记录面→drawProjGhosts）', () => {
  const fakeImg = (w: number, h: number) => ({ width: w, height: h }) as unknown as HTMLImageElement;

  function recordingCtx() {
    const calls: FakeCall[] = [];
    let alpha = 1;
    const ctx = {
      save() {}, restore() {},
      translate(...a: unknown[]) { calls.push({ op: 'translate', args: a, alpha, blend: '' }); },
      rotate(...a: unknown[]) { calls.push({ op: 'rotate', args: a, alpha, blend: '' }); },
      scale(...a: unknown[]) { calls.push({ op: 'scale', args: a, alpha, blend: '' }); },
      set imageSmoothingEnabled(_: boolean) {},
      get globalAlpha() { return alpha; },
      set globalAlpha(v: number) { alpha = v; },
      set globalCompositeOperation(_: string) {},
      set fillStyle(_: string) {}, set strokeStyle(_: string) {},
      fillRect() {}, strokeRect() {},
      drawImage(_t: unknown, ...rest: number[]) { calls.push({ op: 'drawImage', args: rest, alpha, blend: '' }); },
    } as unknown as CanvasRenderingContext2D & { calls: FakeCall[] };
    return { ctx, calls };
  }

  it('记录 2 拍 + dA0=6 冲刺档 → draw 出残影笔（i=1 单槽）;余 id（如 613）零环', async () => {
    const player = new Player(60 * 16, 90 * 16, new Inventory());
    const bx = minionTrueBox(533);
    const m = new MinionProj(player.cx, 100 * 16 - bx.h, 533, 10, 2, false, 0, false, () => player);
    (m as unknown as { dA0: number }).dA0 = 6;           // 冲刺档（end=8/step=1）
    m.x = 100; m.y = 200;
    (m as unknown as { recordGhostTrail(): void }).recordGhostTrail();
    m.x = 104; m.y = 200;
    (m as unknown as { recordGhostTrail(): void }).recordGhostTrail();
    const ring = (m as unknown as { ghostRing?: ProjGhostRing | null }).ghostRing;
    expect(ring).not.toBeNull();
    expect(ring!.filled).toBe(2);
    expect(ring!.mode).toBe(0);
    expect(ring!.cap).toBe(10);                          // TrailCacheLength[533] 缺省 10
    setProjSpriteOverride(533, fakeImg(48, 1008));
    const { ctx, calls } = recordingCtx();
    m.draw({ ctx, atlas: { ensureVImage: () => fakeImg(10, 10) } } as never);
    const draws = calls.filter((c) => c.op === 'drawImage');
    expect(draws.length).toBeGreaterThanOrEqual(1);      // 本体 + 残影 i=1 至少各一笔
    // 对照组：无记录式随从（613 mode=-1）→ ghostRing=null,不画残影
    const m2 = new MinionProj(player.cx, 100 * 16 - minionTrueBox(613).h, 613, 10, 2, false, 0, false, () => player);
    (m2 as unknown as { recordGhostTrail(): void }).recordGhostTrail();
    expect((m2 as unknown as { ghostRing?: ProjGhostRing | null }).ghostRing).toBeNull();
  });
});
