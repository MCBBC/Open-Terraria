// ★BJ668b 尾批（登记账最后实质项）判别测试。定谳（Terarria1457 亲读,唯一标杆）：
//  · 件1（BJ668 债①）731 雷霆法杖弹：原版 GetAlpha :81133-81137 `435||732||731` 同支
//    = `Color.Lerp(newColor, White, 0.8)` + A=25 硬编码——不读 α;类内 alpha 渐显
//    （AI :38471-38475 alpha-=15）是绘制死面（DrawProj 标准路径 Main.cs:31532
//    `color48 = proj.GetAlpha(projectileColor)` 直绘无 731 特判/Opacity :542 不消费/
//    Update 体 16750-17400 零 α 读者——唯一读者是 AI 自递减）。旧 draw
//    ga=(255−α)/255 全显=双偏离（过显 ~10.2×=1/0.098+无白化）。承接=BJ668 两遍制
//    算子（Arrow.replayLerpLift 同式直绘闭包变体）：基底 brightness(0.200)×ga
//    （乘光同相）+ projFullbrightQueue 'lighter' ×0.8 光照后复绘 →
//    base×light+lift ≡ tex×ga×[(1−k)light+k]。
//  · 件2（BJ667 债④）Dart.whiteLerp 别通道：811/814 白化在 DrawProjDirect 本体预
//    Lerp（Main.cs:30847/:30855 projectileColor=Lerp(projectileColor,White,k)——
//    非 GetAlpha 表族;811 k=Remap(ai0,0,15,1,0.3)=whiteK811(age) 动态、814 k=0.35
//    静态;A 面=缺省 GetAlpha 路径 num14=(255−α)/255,:81511-81527,811/814 无 GetAlpha
//    分支）。旧 lerpWhiteFilter 静态滤镜=白抬升被 compositeLight 乘光（BJ529 病根
//    同族）→ 两遍制改道（基底 brightness(1−k)×ga+lift 'lighter' ×k）;596 通道不动
//    （M3-d 光照豁免/自发光=GetAlpha :80903-80910 不读格光,另账）。
//  · 件3（R11-F1 边界清偿）埃特尼亚飞龙 558-560（FindFrame case 558-560,
//    NPC.cs:68627-68643）：ai[0]==2（俯冲态,AI_108 :66371 写入,divingFlyerAI 同步）
//    → 帧 4 定格（frame.Y=num*4）;余态 6t×4 帧循环（frameCounter++ ≥6 推进,
//    ≥num*4 回卷 0——定格帧 4 不参与循环）。曾落末尾通用 6t 全帧档（frames=5
//    循 0..4=飞行期播攻击定格帧+俯冲期不定格）。
//  · 件4 lerpcolor 色相面宽=定谳报告登记（vanillaProjAlpha.ts 头注 BJ668b 件4 块,
//    本文件只做登记注在位锁,不落刀）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ThunderBoltShot } from '../src/entities/proj1457';
import { Dart, whiteK811 } from '../src/entities/Dart';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import { Enemy } from '../src/entities/Enemy';
import { vanillaFrameIdx } from '../src/render/Renderer';
import { vanillaNpc } from '../src/data/vanillaNpcs';
import { TILE } from '../src/core/constants';
import { withMutation } from './mutation-guard';

const GAME_ROOT = join(__dirname, '..');

type Rec = { op: string; args?: unknown[] };
type Recs = Rec[];

/** 记录式 ctx（无 DOM;Proxy 记录器——方法调用与状态写面全部按序入 recs,bj668 同构） */
function recordingCtx() {
  const recs: Recs = [];
  const state: Record<string, unknown> = {
    globalAlpha: 1, globalCompositeOperation: 'source-over', filter: 'none', imageSmoothingEnabled: false,
  };
  const target: Record<string, unknown> = {
    canvas: { width: 800, height: 600 },
    save() { recs.push({ op: 'save' }); },
    restore() { recs.push({ op: 'restore' }); },
    translate(...a: unknown[]) { recs.push({ op: 'translate', args: a }); },
    rotate(...a: unknown[]) { recs.push({ op: 'rotate', args: a }); },
    scale(...a: unknown[]) { recs.push({ op: 'scale', args: a }); },
    drawImage(...a: unknown[]) { recs.push({ op: 'drawImage', args: a }); },
    beginPath() { recs.push({ op: 'beginPath' }); },
    fillRect(...a: unknown[]) { recs.push({ op: 'fillRect', args: a }); },
  };
  const ctx = new Proxy(target, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop in state) return state[prop];
      const v = target[prop];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
    set(_t, prop, v) {
      if (typeof prop === 'string' && prop in state) {
        state[prop] = v;
        recs.push({ op: `set:${prop}`, args: [v] });
        return true;
      }
      (target as Record<string | symbol, unknown>)[prop] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, recs, state };
}

const setOps = (recs: Recs, prop: string): unknown[] =>
  recs.filter((r) => r.op === `set:${prop}`).map((r) => r.args![0]);

const drawOps = (recs: Recs): Rec[] =>
  recs.filter((r) => r.op === 'drawImage' || r.op === 'fillRect');

/** filter 写面（剔除出界显式复位 'none'——置位语义断言用） */
const filtOps = (recs: Recs): unknown[] =>
  setOps(recs, 'filter').filter((v) => v !== 'none');

/** node 无 DOM:projFrameImg 切帧 canvas 打桩（bj668 同款习语） */
beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ imageSmoothingEnabled: false, drawImage: () => {}, fillRect: () => {}, fillStyle: '#fff' }),
    }),
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** 基底流权重提取：逐 draw op 的 (ga, brightness 乘子)——software 像素模型输入
 *  （brightness(f)=W3C feComponentTransfer linear slope=f,纯线性乘） */
function baseWeights(recs: Recs): Array<{ ga: number; mult: number }> {
  let ga = 1;
  let mult = 1;
  const out: Array<{ ga: number; mult: number }> = [];
  for (const r of recs) {
    if (r.op === 'set:globalAlpha') ga = Number(r.args![0]);
    else if (r.op === 'set:filter') {
      const m = /^brightness\(([\d.]+)\)$/.exec(String(r.args![0]));
      mult = m ? Number(m[1]) : 1;
    } else if (r.op === 'drawImage' || r.op === 'fillRect') out.push({ ga, mult });
  }
  return out;
}

const FAKE = { width: 8, height: 8 } as unknown as HTMLImageElement;

// ============ 件1：731 ThunderBoltShot GetAlpha 承接锁（两遍制+α 死面） ============
describe('BJ668b 件1：731 GetAlpha 承接（Lerp(White,0.8)+A=25,α 渐显=绘制死面）', () => {
  beforeEach(() => { setProjSpriteOverride(731, FAKE); });
  afterEach(() => { setProjSpriteOverride(731, { width: 0, height: 0 } as unknown as HTMLImageElement); });

  function draw731(alpha: number): { entityRecs: Recs; queued: Array<(c: CanvasRenderingContext2D) => void> } {
    const b = new ThunderBoltShot(80 * 16, 100 * 16, 14, 0, 35, 0);
    (b as unknown as { alpha: number }).alpha = alpha;
    const rc = recordingCtx();
    const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
    b.draw({
      ctx: rc.ctx,
      queueProjFullbright: (fn: (c: CanvasRenderingContext2D) => void) => { queued.push(fn); },
    } as never, undefined as never);
    return { entityRecs: rc.recs, queued };
  }

  it('基底流:恰 1 笔 draw、ga=25/255 恒定（A=25 硬编码:81137）、filter=brightness(0.200)（×(1−k) 乘光同相）、零 comp 写', () => {
    const { entityRecs, queued } = draw731(0);
    expect(drawOps(entityRecs)).toHaveLength(1);
    expect(setOps(entityRecs, 'globalAlpha')).toEqual([25 / 255]);
    expect(setOps(entityRecs, 'filter')).toEqual(['brightness(0.200)']);
    expect(setOps(entityRecs, 'globalCompositeOperation')).toEqual([]);
    expect(queued).toHaveLength(1);
  });

  it('α 死面锁（判别面）:alpha=0（旧式全显）与 alpha=255（旧式隐身）权重逐位恒等——GetAlpha :81133 不读 α', () => {
    const fresh = draw731(255);      // 旧式:ga=(255−255)/255=0 隐身
    const old = draw731(0);          // 旧式:ga=1 全显（过显 ~10.2× 病灶态）
    for (const prop of ['globalAlpha', 'filter'] as const) {
      expect(setOps(old.entityRecs, prop), `alpha=0 ${prop}`).toEqual(setOps(fresh.entityRecs, prop));
    }
    const rcF = recordingCtx(); fresh.queued[0](rcF.ctx);
    const rcO = recordingCtx(); old.queued[0](rcO.ctx);
    expect(setOps(rcO.recs, 'globalAlpha')).toEqual(setOps(rcF.recs, 'globalAlpha'));
  });

  it('lift 闭包:comp 恰 1 写=lighter、filter 恰 1 写=none、ga=25/255×0.8、draw 1:1（几何零改）', () => {
    const { queued } = draw731(0);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    expect(setOps(rc.recs, 'globalCompositeOperation')).toEqual(['lighter']);
    expect(setOps(rc.recs, 'filter')).toEqual(['none']);
    expect(setOps(rc.recs, 'globalAlpha')).toEqual([(25 / 255) * 0.8]);
    expect(drawOps(rc.recs)).toHaveLength(1);
  });

  it('端到端像素对拍（software 模型）:base×L+lift ≡ ga·[(1−k)L+k] 暗带/亮带双档', () => {
    const { entityRecs, queued } = draw731(0);
    const base = baseWeights(entityRecs);
    expect(base).toHaveLength(1);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    const lift = baseWeights(rc.recs);
    expect(lift).toHaveLength(1);
    const k = 0.8;
    for (const L of [0, 0.325, 1]) {
      const twoPass = base[0].ga * base[0].mult * L + lift[0].ga;
      const truth = base[0].ga * ((1 - k) * L + k);
      expect(Math.abs(twoPass - truth), `L=${L}`).toBeLessThanOrEqual(1e-9);
    }
  });

  it('无队列回退（mock/探针）:基底照画零崩溃,无 lift（251/465 判例守卫域登记）', () => {
    const b = new ThunderBoltShot(80 * 16, 100 * 16, 14, 0, 35, 0);
    (b as unknown as { alpha: number }).alpha = 0;
    const rc = recordingCtx();
    b.draw({ ctx: rc.ctx } as never, undefined as never);   // 无 queueProjFullbright
    expect(drawOps(rc.recs)).toHaveLength(1);
    expect(setOps(rc.recs, 'globalAlpha')).toEqual([25 / 255]);
  });
});

// ============ 件2：Dart.whiteLerp（811/814）两遍制改道锁（596 通道不动） ============
describe('BJ668b 件2：Dart 811/814 白化两遍制（Main.cs:30847/:30855 本体预 Lerp 别通道）', () => {
  beforeEach(() => {
    for (const id of [811, 814, 596]) setProjSpriteOverride(id, FAKE);
  });
  afterEach(() => {
    for (const id of [811, 814, 596]) setProjSpriteOverride(id, { width: 0, height: 0 } as unknown as HTMLImageElement);
  });

  function drawDart(projId: number, alpha: number, age: number): { entityRecs: Recs; queued: Array<(c: CanvasRenderingContext2D) => void> } {
    const d = new Dart(80 * 16, 100 * 16, 8, 0, 35, projId);
    (d as unknown as { alpha: number }).alpha = alpha;
    (d as unknown as { age: number }).age = age;
    const rc = recordingCtx();
    const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
    d.draw({
      ctx: rc.ctx,
      queueProjFullbright: (fn: (c: CanvasRenderingContext2D) => void) => { queued.push(fn); },
    } as never, undefined as never);
    return { entityRecs: rc.recs, queued };
  }

  it('whiteK811 单源:age=15 → k=0.3（Remap(ai0,0,15,1,0.3) 钳尾,Main.cs:30847）', () => {
    expect(whiteK811(0)).toBeCloseTo(1, 9);
    expect(whiteK811(15)).toBeCloseTo(0.3, 9);
  });

  it('811:基底 ga=(255−α)/255（缺省 GetAlpha num14 面）+filter=brightness(0.700)（1−k 动态）;lift ga=×k', () => {
    const { entityRecs, queued } = drawDart(811, 100, 15);
    expect(drawOps(entityRecs)).toHaveLength(1);
    expect(setOps(entityRecs, 'globalAlpha')[0]).toBeCloseTo(155 / 255, 12);
    expect(filtOps(entityRecs)).toEqual(['brightness(0.700)']);
    expect(queued).toHaveLength(1);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    expect(setOps(rc.recs, 'globalCompositeOperation')).toEqual(['lighter']);
    expect(setOps(rc.recs, 'filter')).toEqual(['none']);
    expect(setOps(rc.recs, 'globalAlpha')[0]).toBeCloseTo((155 / 255) * 0.3, 12);
    expect(drawOps(rc.recs)).toHaveLength(1);
  });

  it('814:静态 k=0.35（DART_STYLE whiteLerp）——基底 brightness(0.650)、lift ×0.35（:30855 常数）', () => {
    const { entityRecs, queued } = drawDart(814, 100, 0);
    expect(drawOps(entityRecs)).toHaveLength(1);
    expect(filtOps(entityRecs)).toEqual(['brightness(0.650)']);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    expect(setOps(rc.recs, 'globalAlpha')[0]).toBeCloseTo((155 / 255) * 0.35, 12);
  });

  it('811 k 动态面:age=0 → k=1 全白（基底 brightness(0.000)=0 项,lift 全权重）——Remap 头档', () => {
    const { entityRecs, queued } = drawDart(811, 100, 0);
    expect(filtOps(entityRecs)).toEqual(['brightness(0.000)']);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    expect(setOps(rc.recs, 'globalAlpha')[0]).toBeCloseTo(155 / 255, 12);
  });

  it('端到端像素对拍:base×L+lift ≡ ga·[(1−k)L+k] 双带（811 age=15 档）', () => {
    const { entityRecs, queued } = drawDart(811, 100, 15);
    const base = baseWeights(entityRecs);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    const lift = baseWeights(rc.recs);
    const k = whiteK811(15);
    for (const L of [0, 0.325, 1]) {
      const twoPass = base[0].ga * base[0].mult * L + lift[0].ga;
      const truth = base[0].ga * ((1 - k) * L + k);
      expect(Math.abs(twoPass - truth), `L=${L}`).toBeLessThanOrEqual(1e-9);
    }
  });

  it('596 通道不动（回归守卫）:仍走旧 lerpWhiteFilter 静态滤镜（含 saturate）、零入队（M3-d 另账登记）', () => {
    const { entityRecs, queued } = drawDart(596, 100, 0);
    const filters = filtOps(entityRecs) as string[];
    expect(filters.length).toBe(1);
    expect(filters[0]).toContain('saturate(');       // 旧静态滤镜签名
    expect(queued).toHaveLength(0);
  });
});

// ============ 件3：埃特尼亚飞龙 558-560 帧机定格档锁（R11-F1 边界） ============
describe('BJ668b 件3：558-560 ai0==2 帧 4 定格 + 余态 6t×4 帧循环（NPC.cs:68627-68643）', () => {
  function mk(id: number): { e: Enemy; frames: number; idx: (t: number) => number } {
    const e = Enemy.fromVanilla(id, 40 * TILE, 57 * TILE);
    if (!e) throw new Error(`fromVanilla(${id}) 失败`);
    const frames = vanillaNpc(id)?.frames ?? -1;
    return { e, frames, idx: (t: number) => { e.animT = t; return vanillaFrameIdx(e, frames); } };
  }

  it('跨域锚:vanillaNpcs frames=5、aiStyle=108（Main.npcFrameCount 对拍面,recon-npc 同源）', () => {
    for (const id of [558, 559, 560]) {
      const v = vanillaNpc(id);
      expect(v?.frames, `id=${id} frames`).toBe(5);
      expect(v?.aiStyle, `id=${id} aiStyle`).toBe(108);
    }
  });

  for (const id of [558, 559, 560]) {
    it(`id=${id}:ai0==2（俯冲态 AI_108 :66371）任意 t 恒帧 4 定格`, () => {
      const { e, frames, idx } = mk(id);
      e.ai0 = 2;
      for (const t of [0, 1, 5, 6, 47, 233]) expect(idx(t), `t=${t}`).toBe(Math.min(4, frames - 1));
    });

    it(`id=${id}:ai0!=2 → 6t×4 帧循环 0..3（定格帧 4 不参与;首推进 t=6;600t 长窗零帧 4）`, () => {
      const { e, frames, idx } = mk(id);
      e.ai0 = 0;
      expect(frames).toBe(5);
      expect(idx(0)).toBe(0);
      expect(idx(5)).toBe(0);          // 首推进 t=6（frameCounter++ ≥6）
      expect(idx(6)).toBe(1);
      const seen = new Set<number>();
      for (let t = 0; t < 600; t++) seen.add(idx(t));
      expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);   // 帧 4 恒缺席
      for (let t = 0; t < 600; t++) expect(idx(t), `t=${t}`).toBe(Math.floor(t / 6) % 4);
    });
  }
});

// ============ 件4：lerpcolor 色相面宽定谳报告——登记注在位锁（不落刀） ============
describe('BJ668b 件4：lerpcolor 色相面宽定谳登记（vanillaProjAlpha 头注 BJ668b 件4 块）', () => {
  it('登记注在位:面宽结论/855 唯一活跃型/586 复杂形变/有色 lift 算子另批', () => {
    const src = readFileSync(join(GAME_ROOT, 'src/data/vanillaProjAlpha.ts'), 'utf8');
    expect(src).toContain('★BJ668b 件4');
    expect(src).toContain('lerpcolor 色相面宽定谳');
    expect(src).toContain('855');
    expect(src).toContain('586');
    expect(src).toContain('另批');
  });
});

// ============================ 变异自证（≥3 发,恰红 + 逐字节还原 + sha256 对拍） ============================

describe.skipIf(process.env.SW_BJ668B_MUT)('BJ668b 变异自证（恰红）', () => {
  const P1457 = join(GAME_ROOT, 'src/entities/proj1457.ts');
  const DART = join(GAME_ROOT, 'src/entities/Dart.ts');
  const RENDERER = join(GAME_ROOT, 'src/render/Renderer.ts');
  const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

  const mutate = (file: string, trigger: string, replacement: string, filter: string, target: string) => {
    const pristineSha = sha(file);
    withMutation(file, trigger, replacement, () => {
      const r = spawnSync('npx',
        ['vitest', 'run', 'tests/bj668b-tail-clearance.test.ts', '--no-file-parallelism', '-t', filter],
        { cwd: process.cwd(), encoding: 'utf8', timeout: 600_000, env: { ...process.env, SW_BJ668B_MUT: '1' } });
      expect(r.status, `变异须证红（${target}）: ${replacement}\n${r.stdout.slice(-3000)}`).not.toBe(0);
      expect(r.stdout).toContain(filter);
    }, { label: `BJ668b ${filter}` });
    expect(sha(file), `还原后 sha256 对拍不一致: ${file}`).toBe(pristineSha);
  };

  it('M1 件1:GA 常量 25/255→255/255（A 面过显 ~10× 病复发）→ 件1 锁红', () => {
    mutate(P1457,
      'const GA = 25 / 255;',
      'const GA = 255 / 255; /* ★BJ668b M1 变异 */',
      'BJ668b 件1',
      'A=25 承接面');
  });

  it('M2 件1:lift 复绘 lighter→source-over（白抬升加算面塌=暗场归零复发）→ 件1 锁红', () => {
    mutate(P1457,
      "c.globalCompositeOperation = 'lighter';\n      c.filter = 'none';\n      c.globalAlpha = GA * K;",
      "c.globalCompositeOperation = 'source-over';\n      c.filter = 'none';\n      c.globalAlpha = GA * K; /* ★BJ668b M2 变异 */",
      'BJ668b 件1',
      'lift 加算复绘');
  });

  it('M3 件2:811/814 两遍制门全闭（旧 lerpWhiteFilter 静态滤镜通道复发）→ 件2 锁红', () => {
    mutate(DART,
      'const lerpK811 = this.projId === 811 ? whiteK811(this.age)\n      : (!is596 && st.whiteLerp != null) ? st.whiteLerp : null;',
      'const lerpK811 = null as number | null; /* ★BJ668b M3 变异:门全闭 */',
      'BJ668b 件2',
      '两遍制门单源');
  });

  it('M4 件3:定格档摘除（ai0==2 落 6t×4 循环=俯冲不定格复发）→ 件3 锁红', () => {
    mutate(RENDERER,
      'if (id === 558 || id === 559 || id === 560) {\n    if (e.ai0 === 2) return Math.min(4, frames - 1);',
      'if (id === 558 || id === 559 || id === 560) {\n    if (false && e.ai0 === 2) return Math.min(4, frames - 1); /* ★BJ668b M4 变异 */',
      'BJ668b 件3',
      '定格档');
  });
});
