// ★BJ667 色式批 2 三刀（BJ666 台账批 2）判别测试。定谳（亲读 1457 反编译）：
//  ①251 彩虹段（Projectile.cs:81318-81324）`r=g=b=255−alpha; return Color(r,g,b,0)`
//    =A=0【纯加算白】×(255−α)/255 渐显,RGB 常量不读格光=自发光（彩虹枪暗处发光的
//    机制面）。旧实现 source-over 直绘实体层=合成方式错×乘光压暗双偏离 →
//    RainbowSegment.draw capture→projFullbrightQueue 'lighter' 复绘
//    （BJ666 刀① 465 习语同构,ga=(255−α)/255,α 曲线/绘制锚/rot/scale 零改）。
//  ②435/436（:81133-81137 与 731/732 同支 / :81143-81147 专支）
//    `Lerp(newColor,White,0.8) → (r,g,b,25)`=A=25 近隐白化——旧表 off=通用路径
//    (255−α)/255 全显=过显 ~10 倍 → off 解除=drawTableAlpha mul:0.098 消费。
//    表注载体错案勘误：XenoBubbleProj=444 泡沫（XENO_BUBBLE_PROJ）——435 活面=
//    特斯拉炮塔 387 aiStyle73 放电（NPC.cs:35544→bossAI_martian shootM→Arrow 通用）、
//    436 全反编译面 NewProjectile 零命中=无出生面（防御档）、437（:81115-81118 与
//    700 同支）=(255,255,255,0)×Opacity=A=0 加算白×Opacity（T5 族非隐形;原版出生面
//    =火星兵 389 NPC.cs:59655,本仓未移植=dormant,off 维持）。
//  ③650（:80794-80811）分支只赋 r/g/b（×1.5 钳 255）不 return,GetAlpha 尾段
//    :81507-81510 无条件 r/g/b=newColor×(255−α)/255 重算覆写 → bright:1.5 死码
//    （BJ297 207 勘误同族漏网,BJ666 定谳）→ 表条目改 plain fade + 「只赋不 return=
//    死码」判据源级结构锁（:80794 分支无 return ∧ 尾段无条件重算 ∧ 区段唯一分支）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Arrow, setProjSpriteOverride } from '../src/entities/Arrow';
import { PROJ_ALPHA_MOD, projConstFullbright, projConstTint } from '../src/data/vanillaProjAlpha';
import { RainbowSegment } from '../src/entities/RainbowProj';
import { withMutation } from './mutation-guard';

const GAME_ROOT = join(__dirname, '..');

type Rec = { op: string; args?: unknown[]; state?: Record<string, unknown> };
type Recs = Rec[];

/** 记录式 ctx（无 DOM;globalCompositeOperation 记入 recs 供加算面断言） */
function recordingCtx() {
  const recs: Recs = [];
  const ctx = {
    canvas: { width: 800, height: 600 },
    save() { recs.push({ op: 'save' }); },
    restore() { recs.push({ op: 'restore' }); },
    translate(...a: unknown[]) { recs.push({ op: 'translate', args: a }); },
    rotate(...a: unknown[]) { recs.push({ op: 'rotate', args: a }); },
    scale(...a: unknown[]) { recs.push({ op: 'scale', args: a }); },
    drawImage(...a: unknown[]) { recs.push({ op: 'drawImage', args: a }); },
    beginPath() { recs.push({ op: 'beginPath' }); },
    arc(...a: unknown[]) { recs.push({ op: 'arc', args: a }); },
    fill() { recs.push({ op: 'fill' }); },
    fillRect(...a: unknown[]) { recs.push({ op: 'fillRect', args: a }); },
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    set fillStyle(_: string) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, recs };
}

/** compSet 侧车 proxy（globalCompositeOperation setter 记账——加算/over 判别载体） */
function compSpy(ctx: CanvasRenderingContext2D): { proxy: CanvasRenderingContext2D; compSets: string[] } {
  const compSets: string[] = [];
  const proxy = new Proxy(ctx, {
    set(t, k, v) {
      if (k === 'globalCompositeOperation') compSets.push(String(v));
      return Reflect.set(t, k, v);
    },
  });
  return { proxy, compSets };
}

// ============ ① 251 彩虹段（GetAlpha :81318-81324 A=0 加算白×(255−α)/255） ============
const FAKE_251 = { width: 32, height: 32 } as unknown as HTMLImageElement;

describe('BJ667 ① 251 RainbowSegment：capture→projFullbrightQueue lighter（本体不进乘光实体层）', () => {
  beforeEach(() => { setProjSpriteOverride(251, FAKE_251); });
  afterEach(() => { setProjSpriteOverride(251, { width: 0, height: 0 } as unknown as HTMLImageElement); });

  function mk251(alpha: number): RainbowSegment {
    const seg = new RainbowSegment(700, 400, 3, 0, 50, 2);
    (seg as unknown as { alpha: number }).alpha = alpha;
    return seg;
  }
  function drawSeg(seg: RainbowSegment): { entityRecs: Recs; queued: Array<(c: CanvasRenderingContext2D) => void> } {
    const rc = recordingCtx();
    const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
    seg.draw({
      ctx: rc.ctx,
      queueProjFullbright: (fn: (c: CanvasRenderingContext2D) => void) => { queued.push(fn); },
    } as never);
    return { entityRecs: rc.recs, queued };
  }

  it('全显期 α=0：实体层零落笔（本体不进乘光实体层）,恰 1 闭包入队', () => {
    const { entityRecs, queued } = drawSeg(mk251(0));
    expect(entityRecs.filter((r) => r.op === 'drawImage')).toHaveLength(0);
    expect(entityRecs.filter((r) => r.op === 'fill')).toHaveLength(0);
    expect(queued).toHaveLength(1);
  });

  it('闭包：composite=lighter + ga=(255−α)/255（α=205→50/255;终端 α=0→1 满强加算）', () => {
    for (const alpha of [205, 0]) {
      const { queued } = drawSeg(mk251(alpha));
      expect(queued).toHaveLength(1);
      const rc = recordingCtx();
      const { proxy, compSets } = compSpy(rc.ctx);
      queued[0](proxy);
      expect(compSets, `α=${alpha} 须走 'lighter' 加算复绘（旧 source-over=双偏离）`).toContain('lighter');
      expect((rc.ctx as unknown as { globalAlpha: number }).globalAlpha)
        .toBeCloseTo((255 - alpha) / 255, 6);
    }
  });

  it('α=255 早退：零落笔零入队（bright=0 整弹不画,α 曲线零改）', () => {
    const { entityRecs, queued } = drawSeg(mk251(255));
    expect(entityRecs.filter((r) => r.op === 'drawImage')).toHaveLength(0);
    expect(queued).toHaveLength(0);
  });

  it('姿态/几何面零改：锚 translate(cx−10,cy−18) + rotate=atan2−π/2 + drawImage(−20,−20,40,40)', () => {
    const seg = mk251(0);
    const { queued } = drawSeg(seg);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    const rot = (seg as unknown as { rot: number }).rot;
    expect(rot).toBeCloseTo(Math.atan2(0, 3) - Math.PI / 2, 6);
    const tr = rc.recs.find((r) => r.op === 'translate');
    expect(tr!.args).toEqual([700 - 10, 400 - 18]);          // Main.cs:29886 num143=18/num144=−10
    const rotOp = rc.recs.find((r) => r.op === 'rotate');
    expect(rotOp!.args![0]).toBeCloseTo(rot, 6);
    const dImg = rc.recs.find((r) => r.op === 'drawImage')!;
    expect(dImg.args).toEqual([FAKE_251, -20, -20, 40, 40]); // scale 1.25（SetDefaults）
  });

  it('mock 无队列回退直绘（测试/探针链）：entity ctx 恰 1 笔 drawImage', () => {
    const rc = recordingCtx();
    mk251(0).draw({ ctx: rc.ctx } as never);
    expect(rc.recs.filter((r) => r.op === 'drawImage')).toHaveLength(1);
  });
});

// ============ ② 435/436 A=25 近隐白化（:81133-81137/:81143-81147）过显翻正 ============
/** shootM 形参载体（bossAI_martian :898 特斯拉炮塔 387 放电→Arrow 通用） */
function mk435(projId: 435 | 436): Arrow {
  const a = new Arrow(80 * 16, 100 * 16, 14, 0, 35, 0, projId,
    { grav: 0, life: 300, pierce: 1, hostile: true });
  return a;
}
function tableAlpha(a: Arrow): { ga: number; filter: string | null } | null {
  return (a as unknown as { drawTableAlpha(): { ga: number; filter: string | null } | null }).drawTableAlpha();
}

describe('BJ667 ② 435/436 过显翻正（off 解除→drawTableAlpha mul:0.098+表注载体勘误）', () => {
  it('表身份：435/436 kind=lerp k=0.8 mul=0.098 无 off;300 census 锁维持', () => {
    expect(Object.keys(PROJ_ALPHA_MOD).length).toBe(300);
    for (const id of [435, 436]) {
      const m = PROJ_ALPHA_MOD[id];
      expect(m.off).toBeUndefined();
      expect(m.kind).toBe('lerp');
      expect(m.k).toBe(0.8);
      expect(m.mul).toBe(0.098);
    }
  });

  it('火星飞碟战暗场判别（特斯拉炮塔 387 shootM 载体）：ga=fade×0.098——旧通用路径 ga=(255−α)/255 全显=过显 ~10 倍', () => {
    const a = mk435(435);
    (a as unknown as { alpha: number }).alpha = 0;
    const got = tableAlpha(a);
    expect(got).not.toBeNull();
    expect(got!.ga).toBe(0.098);                              // A=25/255（vanilla :81137 末参 25）
    expect(got!.ga).toBeLessThan(0.15);                       // 非 (255−α)/255=1 全显（过显翻正锁）
    (a as unknown as { alpha: number }).alpha = 130;
    expect(tableAlpha(a)!.ga).toBeCloseTo((125 / 255) * 0.098, 9);
    const f = tableAlpha(a)!.filter;
    expect(f).toBeTruthy();
    expect(f!.startsWith('brightness(')).toBe(true);          // Lerp(newColor,White,0.8) 白化
    // ★BJ668（2026-10-12）更新：旧「brightness 中灰归一+saturate」静态滤镜近似退役,
    // 改两遍制基底 brightness(1−k)（白抬升项 ×k 由 replayLerpLift 光照后复绘承接,
    // saturate 组件随之摘除=纯线性乘逐通道精确）——k=0.8 → brightness(0.200)
    expect(f).toBe('brightness(0.200)');
  });

  it('436 同式钉值（专支 :81143-81147 与 435 同值面,防御档）', () => {
    const a = mk435(436);
    (a as unknown as { alpha: number }).alpha = 0;
    const got = tableAlpha(a);
    expect(got).not.toBeNull();
    expect(got!.ga).toBe(0.098);
    expect(got!.ga).toBeLessThan(0.15);
    expect(got!.filter).toBeTruthy();
  });

  it('乘光族不入常量色全亮通道（lerp kind 不进 projConstFullbright/projConstTint——暗场乘光仍适用）', () => {
    expect(projConstFullbright(435)).toBe(false);
    expect(projConstTint(435)).toBeNull();
    expect(projConstFullbright(436)).toBe(false);
    expect(projConstTint(436)).toBeNull();
  });

  it('表注载体错案勘误锁：435/436/437 行勘误标记「载体错案」在位、旧错案句式（SKIP: XenoBubbleProj）不复现;435 行载体=shootM;436 行=无出生面;437 行定谳=加算白×Opacity（T5 族,off 维持 dormant）', () => {
    // 表注=注释面（非 note 字段）——按表行原文断言（整文件/头注提及 XenoBubbleProj 属合法,只锁旧错案句式）
    const src = readFileSync(join(GAME_ROOT, 'src/data/vanillaProjAlpha.ts'), 'utf8').split('\n');
    const lineOf = (id: number): string => {
      const l = src.find((s) => s.startsWith(`  ${id}: {`));
      expect(l, `表行 ${id} 须存在`).toBeTruthy();
      return l!;
    };
    for (const id of [435, 436, 437]) {
      expect(lineOf(id)).toContain('载体错案');
      expect(lineOf(id)).not.toContain('SKIP: XenoBubbleProj');   // 旧错案句式不得复现
    }
    expect(lineOf(435)).toContain('shootM');
    expect(lineOf(436)).toContain('无出生面');
    expect(lineOf(437)).toContain('加算白×Opacity');
    expect(PROJ_ALPHA_MOD[437].off).toBe(1);
    expect(PROJ_ALPHA_MOD[437].kind).toBe('invisible');
  });
});

// ============ ③ 650 bright:1.5 死码摘除（:80794 分支只赋不 return） ============
describe('BJ667 ③ 650 死码摘除（BJ297 207 同族漏网）+「只赋不 return=死码」源级结构锁', () => {
  it('表档摘除：650 kind=fade 无 bright;drawTableAlpha filter=null（brightness(1.5) 摘除判别）+ga≡缺省 (255−α)/255', () => {
    const m = PROJ_ALPHA_MOD[650];
    expect(m.kind).toBe('fade');
    expect('bright' in m).toBe(false);
    const a = new Arrow(80 * 16, 100 * 16, 3, 0, 10, 0, 650, { grav: 0, life: 300, pierce: 1 });
    for (const alpha of [0, 100, 255]) {
      (a as unknown as { alpha: number }).alpha = alpha;
      const got = tableAlpha(a);
      expect(got).not.toBeNull();
      expect(got!.filter, `α=${alpha} brightness(1.5) 须摘除（尾段覆写=死码）`).toBeNull();
      expect(got!.ga).toBeCloseTo((255 - alpha) / 255, 6);   // 净值≡缺省 fade
    }
  });

  it('源级结构锁（BJ666 判据）：:80794 分支体无 return ∧ :81507-81510 尾段无条件重算覆写 ∧ GetAlpha 区段唯一 650 分支', () => {
    const csPath = join(GAME_ROOT, '..', 'Terarria1457', 'Terraria', 'Projectile.cs');
    const lines = readFileSync(csPath, 'utf8').split('\n');
    // GetAlpha（:80595-81521 → 0-based 80594..81521）
    const ga = lines.slice(80594, 81521);
    const i650 = ga.findIndex((l) => l.includes('if (type == 650)'));
    expect(i650).toBeGreaterThanOrEqual(0);
    // 配对 '}'：分支体=if 行起至深度回落 0（else 块不入体）
    let depth = 0;
    let end650 = -1;
    for (let i = i650; i < ga.length; i++) {
      for (const ch of ga[i]) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (i > i650 && depth === 0) { end650 = i; break; }
    }
    expect(end650).toBeGreaterThan(i650);
    const body = ga.slice(i650, end650 + 1).join('\n');
    // 死码判据①：只赋不 return——分支体含 ×1.5 赋值但无任何 return
    expect(body).toContain('newColor.R * 1.5');
    expect(/\breturn\b/.test(body), '650 分支体须无 return（只赋不 return=死码判据①;出现 return=定谳失效须重审表）').toBe(false);
    // 死码判据②：尾段无条件重算（:81507-81510）在分支之后
    const tail = ga.slice(end650 + 1).join('\n');
    expect(tail).toContain('float num14 = (float)(255 - alpha) / 255f;');
    expect(tail).toContain('r = (int)((float)(int)newColor.R * num14);');
    expect(tail).toContain('g = (int)((float)(int)newColor.G * num14);');
    expect(tail).toContain('b = (int)((float)(int)newColor.B * num14);');
    // 死码判据③：GetAlpha 区段恰 1 处 type == 650 分支（无第二 return 路径）
    expect(ga.filter((l) => l.includes('type == 650')).length).toBe(1);
  });
});

// ============================ 变异自证（≥3 发,恰红 + 逐字节还原 + sha256 对拍） ============================

describe.skipIf(process.env.SW_BJ667_MUT)('BJ667 变异自证（恰红）', () => {
  const RAINBOW = join(GAME_ROOT, 'src/entities/RainbowProj.ts');
  const TABLE = join(GAME_ROOT, 'src/data/vanillaProjAlpha.ts');
  const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

  const mutate = (file: string, trigger: string, replacement: string, filter: string, target: string) => {
    const pristineSha = sha(file);
    withMutation(file, trigger, replacement, () => {
      const r = spawnSync('npx',
        ['vitest', 'run', 'tests/bj667-colorstyle-batch2.test.ts', '--no-file-parallelism', '-t', filter],
        { cwd: process.cwd(), encoding: 'utf8', timeout: 600_000, env: { ...process.env, SW_BJ667_MUT: '1' } });
      expect(r.status, `变异须证红（${target}）: ${replacement}\n${r.stdout.slice(-3000)}`).not.toBe(0);
      expect(r.stdout).toContain(filter);
    }, { label: `BJ667 ${filter}` });
    expect(sha(file), `还原后 sha256 对拍不一致: ${file}`).toBe(pristineSha);
  };

  it('M1 件1：RainbowSegment 复绘 lighter→source-over（加算复绘缺失）→ ① 锁红', () => {
    mutate(RAINBOW,
      "c.globalCompositeOperation = 'lighter';",
      "c.globalCompositeOperation = 'source-over'; /* ★BJ667 M1 变异 */",
      'BJ667 ①',
      '251 加算复绘');
  });

  it('M2 件2：435 表档回插 off（过显病复发）→ ② 锁红', () => {
    mutate(TABLE,
      '435: { kind: \'lerp\', k: 0.8, mul: 0.098 },',
      '435: { kind: \'lerp\', k: 0.8, mul: 0.098, off: 1 }, /* ★BJ667 M2 变异 */',
      'BJ667 ②',
      '435 过显翻正');
  });

  it('M3 件2：436 表档回插 off → ② 锁红', () => {
    mutate(TABLE,
      '436: { kind: \'lerp\', k: 0.8, mul: 0.098 },',
      '436: { kind: \'lerp\', k: 0.8, mul: 0.098, off: 1 }, /* ★BJ667 M3 变异 */',
      'BJ667 ②',
      '436 过显翻正');
  });

  it('M4 件3：650 回插 bright:1.5（死码登记复发）→ ③ 锁红', () => {
    mutate(TABLE,
      '650: { kind: \'fade\' },',
      '650: { kind: \'fade\', bright: 1.5 }, /* ★BJ667 M4 变异 */',
      'BJ667 ③',
      '650 死码摘除');
  });
});
