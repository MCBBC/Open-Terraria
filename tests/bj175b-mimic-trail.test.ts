// ★BJ175b 2026-09-20（用户实报：宝箱怪跳高无拖影,原版可见——附参考图）
//
// 定谳（1457/1458 逐行亲读）：
//   · 记录面 = NPCID.Sets.TrailingMode（NPCID.cs:4769 `473,2,474,2,475,2,476,2`）+
//     NPC.UpdateNPC_UpdateTrails（NPC.cs:91893-91992）mode 2：仅当
//     `(int)ai[0]==4 || ai[0]==5f || ai[0]==6f`（飞天 4/真俯冲 4.1【(int) 同值】/
//     穿墙归位 5/三连扑 6）逐拍后移记录 oldPos[10]/oldRot[10]；其余态
//     【全部槽位写当前位置】（:91935-91942 else 支）=拖影清零。
//   · 绘制面 = ★BJ248 勘误（2026-09-21 R2 复核翻案 BJ175b「无特支」判据）：原版
//     【有】473-476 专支——Main.cs:26436-26451（1458 同号同）aiStyle 87 【后绘
//     extras 区】残影块（本体链之后=本体之上,477/479 :26396 块之后紧邻）：
//     ai[0]∈{4,5,6} 态门、α 四通道 0.5×ch×(10−i)/20、GetShimmerColor 染色（本仓
//     无逐实体微光染色管线→恒等备案）、同帧 rCurrentNPC.frame。BJ175b 旧注
//     「:23628-23643 通用块 α=(10−i)/15/原版无特支/本体之下」系张冠李戴,已废。
//   · AI_087 分支（NPC.cs:37845-38200）无 Dust/Gore/NewProjectile=粒子面不存在。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Enemy } from '../src/entities/Enemy';
import { drawMimicAfterimages } from '../src/render/npcExtraParts';
import type { Enemy as EnemyT } from '../src/entities/Enemy';

/** 直驱私有 recordTrailHistory（fixedUpdate 尾真实调用点） */
function tick(e: EnemyT): void {
  (e as unknown as { recordTrailHistory(): void }).recordTrailHistory();
}

function mkMimic(vid: 473 | 474 | 475 | 476 = 475): EnemyT {
  const e = Enemy.fromVanilla(vid, 100, 100) as EnemyT;
  expect(e).toBeTruthy();
  return e;
}

describe('BJ175b 记录面：UpdateNPC_UpdateTrails mode 2 态门（NPC.cs:91918-91942）', () => {
  it('空中攻击态 4/4.1/5/6 逐拍记录历史（移动后 histXAt(0)≠histXAt(1)）', () => {
    for (const st of [4, 4.1, 5, 6]) {
      const e = mkMimic();
      e.ai0 = st as number;
      tick(e);
      e.x += 12;                                   // 飞行位移
      tick(e);
      e.x += 12;
      tick(e);
      expect(e.historyDepth()).toBeGreaterThanOrEqual(2);
      expect(e.histXAt(0)).toBe(e.x);              // 最新=当前位置
      expect(e.histXAt(1)).toBe(e.x - 12);         // 上一拍
      expect(e.histXAt(2)).toBe(e.x - 24);         // 上上拍
    }
  });

  it('★非空中态整环清零：0/1/2/3 态任意深度全部=当前位置（:91935-91942 else 支）', () => {
    for (const st of [0, 1, 2, 3]) {
      const e = mkMimic();
      // 先制造一段旧历史（模拟刚落地——历史里有飞行残迹）
      e.ai0 = 6;
      tick(e);
      e.x += 40;
      tick(e);
      expect(e.histXAt(1)).not.toBe(e.x);
      // 落地：非空中态开始
      e.ai0 = st as number;
      e.x += 24;
      e.y += 8;
      tick(e);
      e.x += 24;
      tick(e);
      expect(e.histXAt(0), `态${st} 最新槽`).toBe(e.x);
      expect(e.histXAt(1), `态${st} 上一拍`).toBe(e.x);    // ★整环=当前位置（曾缺=残迹滞留）
      expect(e.histXAt(5), `态${st} 深度5`).toBe(e.x);
      expect(e.histYAt(3), `态${st} Y 槽`).toBe(e.y);
    }
  });

  it('原版行号语义：mode 2 记录含 oldRot（本仓 AI_087 无 rotation 写=histRot 恒 0 同相）', () => {
    const e = mkMimic();
    e.ai0 = 4;
    e.visAngle = 0.35;                             // 外场污染（模拟其他 AI 面）
    tick(e);
    expect(e.histRotAt(0)).toBe(0.35);
  });

  it('非宝箱怪族走逐拍记录（mode 0-7 族超集语义,419/125-131 拖尾消费面不回归）', () => {
    const e = Enemy.fromVanilla(49, 100, 100) as EnemyT;   // 普通宝箱怪 49（对照组）
    e.ai0 = 0;
    tick(e);
    e.x += 10;
    tick(e);
    expect(e.histXAt(1)).toBe(e.x - 10);           // 非族=无条件逐拍记录（原超集语义）
  });
});

// ---- 绘制面（drawMimicAfterimages：aiStyle 87 后绘 extras 区 Main.cs:26436-26451）----

interface DrawRec { img: unknown; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number; alpha: number }
function mkCtx(): { ctx: CanvasRenderingContext2D; draws: DrawRec[] } {
  const draws: DrawRec[] = [];
  const ctx = {
    save() { /* noop */ },
    restore() { /* noop */ },
    set globalAlpha(v: number) { (ctx as unknown as { _a: number })._a = v; },
    get globalAlpha() { return (ctx as unknown as { _a: number })._a ?? 1; },
    drawImage(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
      draws.push({ img, sx, sy, sw, sh, dx, dy, dw, dh, alpha: (ctx as unknown as { _a: number })._a ?? 1 });
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, draws };
}
const mimicTex = { width: 56, height: 396 } as unknown as HTMLImageElement;
const atlasStub = {
  ensureVImage: (_k: string) => mimicTex,
};

function mkDrawEnemy(vid: number, ai0: number, hist: Array<[number, number]>): EnemyT {
  const e = {
    vanillaId: vid, ai0, w: 28, h: 44, x: hist[hist.length - 1][0], y: hist[hist.length - 1][1],
    vanillaScale: 1, visAngle: 0, cx: 0, cy: 0,
    historyDepth: () => hist.length,
    histXAt: (i: number) => hist[Math.min(i, hist.length - 1)][0],
    histYAt: (i: number) => hist[Math.min(i, hist.length - 1)][1],
  } as unknown as EnemyT;
  return e;
}

describe('BJ175b 绘制面：drawMimicAfterimages（aiStyle 87 后绘 extras 区 :26436-26451）', () => {
  const FRAME = { sx: 0, sy: 0, sw: 28, sh: 44 };
  const hist: Array<[number, number]> = [
    [400, 300], [412, 296], [424, 292], [436, 288], [448, 284],
    [460, 280], [472, 276], [484, 272], [496, 268], [508, 264],
  ];

  it('空中态画 9 份残影：alpha=0.5×(10−i)/20（:26444 四通道均值）、位置=oldPos[i]+盒半宽-帧半宽×scale', () => {
    const { ctx, draws } = mkCtx();
    const e = mkDrawEnemy(475, 4, hist);
    drawMimicAfterimages(ctx, e, atlasStub as never, FRAME);
    expect(draws).toHaveLength(9);                          // i=1..9（mode 2 步 1）
    expect(draws[0].alpha).toBeCloseTo(0.225);              // 0.5×(10−1)/20（:26444）
    expect(draws[8].alpha).toBeCloseTo(0.025);              // 0.5×(10−9)/20
    const first = draws[0];
    expect(first.dx).toBeCloseTo(hist[1][0] + 14 - 14);     // oldPos[1]+w/2-frame.sw/2
    expect(first.dy).toBeCloseTo(hist[1][1] + 22 - 22);
    expect(first.dw).toBe(28);                              // ×scale(1)
    expect(first.img).toBe(mimicTex);                       // 本体同贴图（同帧面）
  });

  it('★非空中态零绘制（记录门=展开门 :91918）+ 非宝箱怪 vid 零绘制', () => {
    for (const st of [0, 1, 2, 3, 7]) {
      const { ctx, draws } = mkCtx();
      drawMimicAfterimages(ctx, mkDrawEnemy(475, st, hist), atlasStub as never, FRAME);
      expect(draws, `态${st} 残影数`).toHaveLength(0);       // ★曾缺门=落地残影滞留
    }
    const { ctx, draws } = mkCtx();
    drawMimicAfterimages(ctx, mkDrawEnemy(49, 4, hist), atlasStub as never, FRAME);
    expect(draws).toHaveLength(0);
  });

  it('4.1/5/6 空中态同画（(int)ai[0]==4 涵盖 4.1）', () => {
    for (const st of [4.1, 5, 6]) {
      const { ctx, draws } = mkCtx();
      drawMimicAfterimages(ctx, mkDrawEnemy(473, st as number, hist), atlasStub as never, FRAME);
      expect(draws, `态${st}`).toHaveLength(9);
    }
  });
});

// ============================================================ ★BJ248 三面纠偏闸（2026-09-21）
// 变异证红映射：
//   M1  α 摘 0.5×/回 (10−i)/15（BJ175b 旧通用块式张冠李戴）→ T-α 全序红
//   M2  挂点迁回 pre-transform 本体之下（frMimic 复活/次序颠倒）→ T-z 红
//   M3  出处注回写「原版无特支」→ T-note 红
//   M4  记录面 mode 2 态门摘（BJ248 未翻面,回归哨）→ 既有非空中态用例红
describe('★BJ248 绘制面三面纠偏：α 式 :26444 / 后绘 extras 区挂点 / 出处注勘误', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const FRAME = { sx: 0, sy: 0, sw: 28, sh: 44 };            // 与上组同帧形（作用域独立）
  const hist2: Array<[number, number]> = Array.from({ length: 10 }, (_, k) => [500 + k * 8, 300]);

  it('T-α 全序锁：九档 α=0.5×(10−i)/20（i=1..9 → 0.225..0.025,原版 :26444-26447 逐档）', () => {
    const { ctx, draws } = mkCtx();
    drawMimicAfterimages(ctx, mkDrawEnemy(475, 6, hist2), atlasStub as never, FRAME);
    expect(draws).toHaveLength(9);
    for (let i = 1; i <= 9; i++) {
      expect(draws[i - 1].alpha, `i=${i}`).toBeCloseTo((0.5 * (10 - i)) / 20);
    }
  });

  it('T-z 挂点钉：Renderer 内 drawMimicAfterimages 调用在 drawNpcTrailGhostsOverBody（本体之上挂点）之后、pre-transform frMimic 旧支已摘', () => {
    const src = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
    const overIdx = src.indexOf('drawNpcTrailGhostsOverBody(ctx, e, this.atlas, r, {');
    const mimicIdx = src.indexOf('drawMimicAfterimages(ctx, e, this.atlas, { sx: r.sx');
    expect(overIdx).toBeGreaterThan(0);
    expect(mimicIdx).toBeGreaterThan(overIdx);      // 后绘 extras 区=:26436 在本体链之后
    expect(src.match(/drawMimicAfterimages\(ctx, e, this\.atlas/g)?.length).toBe(1);  // 单挂点
    expect(src).not.toContain('frMimic');           // pre-transform 旧支=本体之下,翻案后禁复活
  });

  it('T-note 出处注勘误钉：npcExtraParts 持 :26436 复核锚、旧「无特支」判据已废', () => {
    const src = readFileSync(join(ROOT, 'src/render/npcExtraParts.ts'), 'utf8');
    expect(src).toContain('26436');                          // R2 复核锚在场
    expect(src).toContain('0.5 * (10 - i)) / 20');           // α 式单源落位
    expect(src).not.toContain('无 473-476 特支');             // 旧判据禁复活
  });
});
