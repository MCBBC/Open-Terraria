// ★BJ510 2026-10-04（BJ509 用户复报"日耀柱依然暗"复验+落刀判别测试）
//
// 复验定谳链（Terarria1457 亲读 + 真机探针）：
//   · 【根因一=塔朝向极性】原版塔 spriteDirection = 字段默认 **-1**（NPC.cs:6522）
//     且 AI_094 全程无 spriteDirection 写面 → DrawNPC :23357-23361
//     `spriteDirection==1 → FlipHorizontally` 判否 = 塔【恒不镜像】。本仓 facing
//     缺省 1（Enemy:1552,towerAI 无写面）≙ spriteDirection=1 → ①通用镜像门误翻
//     本体（贴图近对称未显形）②BJ509 vel4 收集侧 `!mirror` 守卫恒假 →
//     towerGlowQueue 永不入队（探针实锤:四塔在场 queueLen=0/facing=1）→ 7d'''
//     光照合成后消费层永不生效,残影留实体层被 compositeLight 压暗=夜间塔身暗。
//     BJ509 注"原版 spriteDirection 恒 1=SpriteEffects.None"系把 :23357 判向读反。
//     落刀=towerAI 钉 facing=-1（BJ510-①）。
//   · 【根因二=revFlipMirror 笔误】Renderer 反翻族 `idR===422` 系 aiStyle 97=420
//     星云浮怪之误（:39900 spriteDirection=-direction 属 420,SetDefaults
//     NPC.cs:15185-15196 唯一成员;422=aiStyle 94 无写面）。422 挂反翻门+facing=1
//     双重误翻;摘出后恒不翻=原版同相（BJ510-③）。420 本身在 rotationDriven
//     （stR 97）反翻门被短路,镜像缺面维持登记。
//   · 【根因三=516 日耀耀斑无发光层】下落弹=NPC 516 SolarFlare（SetDefaults
//     aiStyle 9,alpha=0 且 AI_009 段 alpha+=40→220 恒 :21466-21469 → 本体
//     GetAlpha ×0.137 近隐——原版可见亮度主体=Main.cs:26600-26612 case 516 发光层:
//     ①本体白罩 Color(255-α,…,255-α) ②本体贴图 vel4 四份 Color(64,64,64,0)
//     （恒定不经 GetAlpha/Opacity）×0.25 ≈ 全亮加算本体;半径 num288 =
//     0.5+|GetAlpha(npcColor)−0.5|·0.5（GetAlpha 含 (255−α)/255=0.137 因子）。
//     本仓 NPC_GLOW 表漏 516 → 落弹只剩残影拖尾+近隐本体=用户实报"比原版暗"。
//     落刀=NPC_GLOW[516] mode 'flare' + towerGlowQueue rot 路径消费（BJ510-②）。
//   · 【根因四=516 残影 α 面双病】①drawPreBodySpecialGhosts 516 支旧式
//     `×o.opacity`——原版残影色=White×((10−i)/20)×(1−i/6)（:25570-25578 逐通道
//     直读）【不乘 Opacity/npc.alpha】→ α=220 恒态下拖尾被压到 13.7%=拖尾缺失;
//     ②残影在实体层直绘 → compositeLight 乘光压暗（White 基色恒定不吃光照,
//     BJ509 同判例域）。落刀=α 式勘误 + emit516Ghost 改道 towerGlowQueue
//     （本体同枢单份直画,BJ510-④）。
//   · 【旋转面】516 rotation += 0.1×direction（:21584;direction 字段默认 +1
//     Entity.cs:20,AI_009 516 段无写面）→ solarFlareAI visAngle 承载（渲染侧
//     ctx.rotate/残影 gRot/队列 rot 三面单源;aiStyle 9 ∈ rotationDriven 已禁
//     facing 镜像=原版 spriteDirection 恒 -1 同相）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Enemy } from '../src/entities/Enemy';

const rendererSrc = () => readFileSync(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');
const enemySrc = () => readFileSync(new URL('../src/entities/Enemy.ts', import.meta.url), 'utf8');
const lunarMiscSrc = () => readFileSync(new URL('../src/entities/bossAI_lunar_misc.ts', import.meta.url), 'utf8');
const partsSrc = () => readFileSync(new URL('../src/render/npcExtraParts.ts', import.meta.url), 'utf8');

/** 区块抽取：从 startMark 行起至 endMark 行前（含两端标记行） */
function block(src: string, startMark: string, endMark: string): string {
  const lines = src.split('\n');
  const s = lines.findIndex((l) => l.includes(startMark));
  const e = lines.findIndex((l, i) => i > s && l.includes(endMark));
  expect(s, `startMark 未命中: ${startMark}`).toBeGreaterThanOrEqual(0);
  expect(e, `endMark 未命中: ${endMark}`).toBeGreaterThan(s);
  return lines.slice(s, e).join('\n');
}

// ===================== A. 根因一：塔朝向极性（facing=-1 钉面） =====================
describe('BJ510-A 塔朝向极性（spriteDirection 恒 -1=恒不镜像,原版 NPC.cs:6522/:23357）', () => {
  it('towerAI 钉 facing=-1（旧缺省 1=通用镜像门恒翻+BJ509 !mirror 守卫恒假根因）', () => {
    const fn = block(enemySrc(), 'private towerAI(', 'private towerRotSpread(');
    expect(fn).toContain('this.facing = -1;');
    expect(fn).toContain('★BJ510');
    // towerAI 无 gameplay facing 消费面（钉值纯渲染语义）
    expect(fn).not.toContain('this.facing *');
  });
  it('revFlipMirror 勘误：422 摘出/420 补入（:39900 属 aiStyle 97=420 非 422）', () => {
    const src = rendererSrc();
    expect(src).toContain('const revFlipMirror = idR === 618 || idR === 420;');
    expect(src).not.toContain('const revFlipMirror = idR === 618 || idR === 422;');
  });
});

// ===================== B. 根因三：516 发光层（NPC_GLOW flare 分支） =====================
describe('BJ510-B 516 日耀耀斑发光层（Main.cs:26600-26612 case 516）', () => {
  it('NPC_GLOW[516] 钉值（tex=本体贴图非 GlowMask,mode flare）', async () => {
    const { Renderer } = await import('../src/render/Renderer');
    const G = (Renderer as unknown as { NPC_GLOW: Record<number, { tex: string; mode: string }> }).NPC_GLOW;
    expect(G[516]).toMatchObject({ tex: 'vanilla/NPC_516.png', mode: 'flare' });
  }, 60000);
  it('npcGlowVel4Num 516 档：base/mult=0.5/0.5 + alphaRaw 因子入模（GetAlpha (255−α)/255）', async () => {
    const { Renderer } = await import('../src/render/Renderer');
    const N = (Renderer as unknown as {
      npcGlowVel4Num: (vid: number, l: readonly number[] | null, a?: number) => number;
    }).npcGlowVel4Num;
    // α=0（塔,回归面——BJ509 钉值不动）
    expect(N(493, [0, 0, 0])).toBeCloseTo(4 + Math.sqrt(3 * 0.25) * 4, 5);
    // 516: α=0 满光档 |(1,1,1)−.5|=0.866 → 0.5+0.866×0.5
    expect(N(516, [255, 255, 255], 0)).toBeCloseTo(0.5 + Math.sqrt(3 * 0.25) * 0.5, 5);
    // 516: α=220（耀斑恒态,原版 alpha+=40→220 :21466-21469）→ ×(255−220)/255=0.13725
    //  满光每通道 |0.13725−0.5|=0.36275 → len=0.36275√3=0.62833 → num=0.81415
    //  （判别位:因子必须进模——无因子=0.93303）
    expect(N(516, [255, 255, 255], 220)).toBeCloseTo(0.5 + Math.sqrt(3) * 0.36275 * 0.5, 4);
    // 塔 α 传 220 也只按 (255−α)/255 乘光色（493 满光同式）
    expect(N(493, [255, 255, 255], 220)).toBeCloseTo(4 + Math.sqrt(3) * 0.36275 * 4, 4);
    expect(N(516, null)).toBe(0.5);
  }, 60000);

  // ---- drawNpcGlow flare 收集面（假体直调 prototype 法,BJ509-C 同款具装） ----
  function recorder() {
    const ops: Array<Record<string, unknown>> = [];
    let alpha = 1;
    let comp = 'source-over';
    const ctx = {
      save: () => ops.push({ op: 'save' }),
      restore: () => ops.push({ op: 'restore' }),
      translate: (x: number, y: number) => ops.push({ op: 'translate', x, y }),
      rotate: (r: number) => ops.push({ op: 'rotate', r }),
      scale: (x: number, y: number) => ops.push({ op: 'scale', x, y }),
      drawImage: (img: unknown, sx: number, sy: number, sw: number, sh: number,
        dx: number, dy: number) => ops.push({ op: 'draw', img, sx, sy, sw, sh, dx, dy, alpha }),
    };
    Object.defineProperty(ctx, 'globalAlpha', {
      set(v: number) { alpha = v; ops.push({ op: 'alpha', v }); },
      get() { return alpha; },
    });
    Object.defineProperty(ctx, 'globalCompositeOperation', {
      set(v: string) { comp = v; ops.push({ op: 'composite', v }); },
      get() { return comp; },
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
  }
  const atlasStub = {
    ensureVImage: (_k: string) => ({ width: 38, height: 152 }),
  } as never;
  function fakeThis(rec: { ctx: CanvasRenderingContext2D },
    light: readonly [number, number, number] | null = [0, 0, 0]) {
    return {
      atlas: atlasStub,
      ctx: rec.ctx,
      lighting: { lightAt: () => light },
      towerGlowQueue: [] as Array<Record<string, unknown>>,
    } as unknown as {
      atlas: typeof atlasStub; ctx: CanvasRenderingContext2D;
      lighting: { lightAt: (x: number, y: number) => readonly [number, number, number] | null };
      towerGlowQueue: Array<Record<string, unknown>>;
    };
  }
  const FLARE_FRAME = { sx: 0, sy: 38, sw: 38, sh: 38 };   // 第 1 帧行
  async function glowFn() {
    const { Renderer } = await import('../src/render/Renderer');
    return (Renderer.prototype as unknown as {
      drawNpcGlow: (e: Enemy, r: typeof FLARE_FRAME, bx: number, by: number, mirror?: boolean) => void;
    }).drawNpcGlow;
  }
  function flareFake(over: Partial<Record<string, unknown>> = {}) {
    return {
      vanillaId: 516, vx: 3, vy: 8, visAngle: 0.7, spawnAlpha: 220,
      vanilla: { frames: 4, scale: 1 }, vanillaScale: 1,
      cx: 1000, cy: 2000, master: null,
      ...over,
    } as unknown as Enemy;
  }

  it('flare 收集：入队 overlay/noOpac/rot 单源（本体白罩 (255−α)/255 + 恒定加算位）', async () => {
    const rec = recorder();
    const self = fakeThis(rec, [78, 51, 51]);
    const drawNpcGlow = await glowFn();
    drawNpcGlow.call(self, flareFake(), FLARE_FRAME, -19, -19 + 0, false);
    expect(self.towerGlowQueue.length).toBe(1);
    const q = self.towerGlowQueue[0];
    expect(q.vid).toBe(516);
    expect(q.tex).toBe('vanilla/NPC_516.png');
    expect(q.overlay).toBeCloseTo((255 - 220) / 255, 6);   // 白罩=本体 α 因子
    expect(q.noOpac).toBe(true);                            // vel4 恒定色不乘 Opacity
    expect(q.rot).toBeCloseTo(0.7, 6);                      // 旋转承载（visAngle 单源）
    expect(q.vx).toBe(3); expect(q.vy).toBe(8);
    // 帧行=本体帧行（r.sy=38 → row=1 → 残影源 sy=38×1=38,gh=152/4=38）
    expect(q.sy).toBe(38); expect(q.gh).toBe(38);
    // num=0.5+|GetAlpha([78,51,51]×0.137)−0.5|·0.5
    const f = (255 - 220) / 255;
    const dr = 78 * f / 255 - 0.5, dg = 51 * f / 255 - 0.5, db = 51 * f / 255 - 0.5;
    expect(q.num).toBeCloseTo(0.5 + Math.sqrt(dr * dr + dg * dg + db * db) * 0.5, 5);
    // 实体层零直绘（改道队列=判别位;实体层画=夜间被乘光压暗的旧病）
    expect(rec.ops.filter((o) => o.op === 'draw').length).toBe(0);
  });
  it('flare 收集守卫：rot 路径不设 mirror/visAngle 门（rotationDriven 恒 rotation 承载）', async () => {
    const rec = recorder();
    const self = fakeThis(rec, [0, 0, 0]);
    const drawNpcGlow = await glowFn();
    // visAngle≠0（自旋累积）仍入队——vel4 塔支的 visAngle 门不适用于 flare 模式
    drawNpcGlow.call(self, flareFake({ visAngle: 12.5 }), FLARE_FRAME, -19, -19, false);
    expect(self.towerGlowQueue.length).toBe(1);
    expect(self.towerGlowQueue[0].rot).toBeCloseTo(12.5, 6);
  });
});

// ===================== C. 根因四：516 残影 α 勘误 + 改道发射 =====================
describe('BJ510-C 516 残影（White 基色不乘 Opacity :25570-25586 + 队列改道）', () => {
  const partsMod = async () => await import('../src/render/npcExtraParts') as unknown as {
    drawPreBodySpecialGhosts: (ctx: CanvasRenderingContext2D, e: Enemy,
      atlas: unknown, frame: { sx: number; sy: number; sw: number; sh: number },
      o: Record<string, unknown>) => void;
  };
  function ghostFake(depth = 7) {
    return {
      vanillaId: 516, w: 26, h: 26,
      histXAt: (i: number) => 1000 - i * 8,
      histYAt: (i: number) => 2000 - i * 12,
      historyDepth: () => depth,
    } as unknown as Enemy;
  }
  const atlasStub2 = { ensureVImage: (_k: string) => ({ width: 38, height: 152 }) } as never;
  const noopCtx = { save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, drawImage() {} } as unknown as CanvasRenderingContext2D;
  const FRAME516 = { sx: 0, sy: 76, sw: 38, sh: 38 };   // 第 2 帧行

  it('α 式勘误：emit alpha=(10−i)/20×(1−i/6)【不乘 opacity】（判别位:opacity=0.137 不进 α）', async () => {
    const { drawPreBodySpecialGhosts } = await partsMod();
    const emitted: Array<Record<string, unknown>> = [];
    drawPreBodySpecialGhosts(noopCtx, ghostFake(), atlasStub2, FRAME516, {
      scale: 1, addY: 0, opacity: 0.137, rot: 2.5, mirror: false, frameIdx: 2, frames: 4,
      emit516Ghost: (g: { x: number; y: number; rot: number; s: number; gs: number; alpha: number; row: number; addY: number }) => emitted.push(g),
    } as never);
    // α=220 恒态下 opacity=0.137——若 α 式仍乘 opacity 全数 ≈0.02-0.07（旧病）
    expect(emitted.length).toBe(6);   // i=6 α=0 跳过;发射序 i=5..0
    // gx(i)=histXAt(i)+w/2=1000−8i+13 / gy=2000−12i+13;row=(2−4−i) mod 4
    expect(emitted[0]).toMatchObject({ x: 973, y: 1953, rot: 2.5 });   // i=5
    expect(emitted[0].alpha).toBeCloseTo(0.25 * (1 - 5 / 6), 6);       // (10−5)/20×(1−5/6)
    expect(emitted[1].alpha).toBeCloseTo(0.3 * (1 - 4 / 6), 6);        // i=4
    expect(emitted[5].alpha).toBeCloseTo(0.5, 6);                      // i=0: (10)/20×1
    // 帧倒退 (frameIdx−4−i) mod 4（:25572-25580）——i=5..0 → row 1,2,3,0,1,2
    expect(emitted[0].row).toBe(1);
    expect(emitted[1].row).toBe(2);
    expect(emitted[2].row).toBe(3);
    expect(emitted[3].row).toBe(0);
    // gs 档 Lerp(0.35,1.2,(10−i)/10)（:25583）——i=5..0 → 0.775..1.2
    expect(emitted[0].gs).toBeCloseTo(0.35 + 0.85 * 0.5, 6);
    expect(emitted[5].gs).toBeCloseTo(1.2, 6);
  });
  it('改道位：emit 提供时实体层零直绘（旧实体层直绘=夜间被乘光压暗根因面）', async () => {
    const { drawPreBodySpecialGhosts } = await partsMod();
    const drawn: number[] = [];
    const ctx2 = {
      save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
      drawImage: () => drawn.push(1),
      set globalAlpha(_v: number) {}, get globalAlpha() { return 1; },
      set globalCompositeOperation(_v: string) {}, get globalCompositeOperation() { return 'source-over'; },
    } as unknown as CanvasRenderingContext2D;
    drawPreBodySpecialGhosts(ctx2, ghostFake(), atlasStub2, FRAME516, {
      scale: 1, addY: 0, opacity: 1, rot: 0, mirror: false, frameIdx: 2, frames: 4,
      emit516Ghost: () => {},
    } as never);
    expect(drawn.length).toBe(0);
  });
  it('Renderer 收集位：emit516Ghost 仅 516 挂（队列 push 单份字段面）', () => {
    const src = rendererSrc();
    expect(src).toContain('emit516Ghost: e.vanillaId === 516');
    expect(src).toContain("vid: 516, tex: 'vanilla/NPC_516.png', iw: r.sw, sy: gh.row * r.sh, gh: r.sh,");
    expect(src).toContain('noOpac: true, single: gh.alpha,');
  });
});

// ===================== D. 旋转面 + 消费面结构锁 =====================
describe('BJ510-D 旋转/消费结构锁', () => {
  it('solarFlareAI visAngle += 0.1（rotation += 0.1×direction :21584;direction 默认 +1 恒）', () => {
    const fn = block(lunarMiscSrc(), 'export function solarFlareAI', '// AI_006 爬尾虫族');
    expect(fn).toContain('e.visAngle += 0.1;');
    expect(fn).toContain('★BJ510');
  });
  it("7d''' 消费面：single 单份支 + rot 路径 + overlay 白罩（塔路径原式不动）", () => {
    const src = rendererSrc();
    const consumer = block(src, "7d'''. 四塔 GlowMask 残影", '7e. 全亮翅膀主纹理');
    expect(consumer).toContain('if (q.single !== undefined)');
    expect(consumer).toContain('if (q.overlay)');
    expect(consumer).toContain('ctx.globalAlpha = Math.max(0, Math.min(1, (64 / 255) * (q.noOpac ? 1 : q.opacity)));');
    expect(consumer).toContain("ctx.globalCompositeOperation = 'lighter'");
    // 塔路径保留（ BJ509 原式）
    expect(consumer).toContain('q.wx + offs[k][0], q.wy + offs[k][1], q.sw, q.sh');
  });
  it('vel4 塔收集面 alphaRaw 入模（GetAlpha 因子;塔 α=0 原值回归）', () => {
    const src = rendererSrc();
    expect(src).toContain('Renderer.npcGlowVel4Num(e.vanillaId ?? -1, lt ? [lt[0], lt[1], lt[2]] : null, alphaRaw)');
  });
});
