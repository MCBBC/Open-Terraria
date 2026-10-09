// ★BJ579（2026-10-09）：狱火药水喝了后没有火圈（用户实报）——buff 链钉值 + 火圈
//  视觉形态 1:1 + 非 buff 不回归。
//
// 定谳（原版 1457 亲读）：
// · 药水链：ItemID.InfernoPotion=2348（官方中文「狱火药水」,zh-Hans ItemName.
//   InfernoPotion）——Item.cs:23616-23626 SetDefaults：useStyle=9/useTurn/
//   useAnimation=useTime=17/consumable/14×24/buffType=116/buffTime=14400/value
//   1000/rare 1/SoundID.Item3。buff=BuffID.Inferno=116。
// · 效果面（Player.cs:10302-10374 UpdateBuffs buffType[j]==116）：inferno=true +
//   AddLight(0.65,0.4,0.1) + 200px 光环——敌怪门禁串（:10315）`active && !friendly
//   && damage>0 && !dontTakeDamage && !buffImmune[323] &&
//   CanNPCBeHitByPlayerOrPlayerProjectile && 距离≤200` → AddBuff(OnFire3=323,120)
//   + 每 60t（infernoCounter%60==0,counter 0..179 :24789-24792）ApplyDamageToNPC(
//   npc,20,0f,0,false,null,killCredit=2348)；PvP 半边 hostile 玩家同门（无 immune
//   支,GA2 注）60t 一跳 20（死因 ByOther(16)）。本仓效果面已 1:1（Game.ts 狱火块,
//   ★F1 门禁串对齐注）——缺环只在视觉面。
// · 视觉面（Main.DrawInfernoRings Main.cs:65248-65297,调用点 :63264=DrawWires
//   :63251/尘 :63241/前景水 :63248 之后、DrawPaladinsShield 前=世界批次尾部）：
//   每 `active && !outOfRange && inferno && !dead` 玩家画三层 TextureAssets.
//   FlameRing（Images/FlameRing,400×1200=400×400×3 竖排;AssetInitializer.cs:542）
//   旋转火环。相位推进内联 draw 侧（:65262-65285,scale+=0.004/≥1 重置 0.8、
//   rot+=0.05 wrap ±2π;门 AllowPlayerToEmitEffects=!DrawnThisUpdate=恒真等价）
//   → XNA draw:Update 1:1@60 → 语义=每 60t 一次 → 本仓挂 fixedUpdate（渲染纯读）。
//   层几何：num4=num+0.1j（>1 严格才 −0.2）、num5=Lerp(0.8,0,|num4−0.9|×10)、
//   draw=(0,400j,400,400)@(Center−screenPosition)、rot+π/3·j、origin(200,200)、
//   scale=num4、tint=Color(num5,num5,num5,num5/2)。
// · 混合语义（BJ556 判例推广）：XNA AlphaBlend=(One,InvSrcAlpha) 预乘语义 →
//   final = tex.rgb×num5 + dst×(1−tex.a×num5/2)。FlameRing.png 像素定谳：α 严格
//   二值 {0,255}、a=0 处 rgb 恒零 → 两遍拆解（source-over ga=num5/2 + 'lighter'
//   ga=1−num5/2,RGB 灰度乘走离屏 multiply 染色帧）逐像素精确;单笔 globalAlpha
//   =num5/2 = tex.rgb×num5²/2（BJ556 同病）。
// · 采样：spriteBatch 默认 Linear（BJ65:1.4.5.7=FNA LinearClamp）→ smoothing=true。
//
// 落刀：src/render/InfernoRing.ts（新,纯函数+绘制核）+ Player.ts 字段
// （Player.cs:931/:933）+ Game.ts fixedUpdate 推进 + Renderer.ts 7h pass（7g 导线
// 后/BJ553 前=原版层序等价）。
//
// 变异证红：
//  M1 FLAME_RING_ROT_RATE 0.05→0.5 → ②红
//  M2 flameRingPassAlphas base=num5/2→num5（topup 不变）→ ④恒等+⑤ga 序列红
//  M3 flameRingLayerBright 0.8→0.9 → ③钉值红
//  M4 删 drawInfernoRings pass2 'lighter' 笔 → ⑤笔序红
//  M5 Game.ts advanceFlameRing 调用移出 buff 116 块 → ⑥接线锚红
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  advanceFlameRing, flameRingDrawScale, flameRingLayerScale, flameRingLayerBright,
  flameRingPassAlphas, drawInfernoRings, ensureFlameRingImage,
  FLAME_RING_SCALE_RATE, FLAME_RING_ROT_RATE, FLAME_RING_SCALE_LO,
  FLAME_RING_LAYER_STEP, FLAME_RING_BRIGHT_BAND, FLAME_RING_FRAME, FLAME_RING_FRAMES,
  FLAME_RING_TEX, type FlameRingPlayer,
} from '../src/render/InfernoRing';
import { BUFF_DEFS, BuffType } from '../src/stats/Buffs';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME_ROOT = join(HERE, '..');
const ringSrc = readFileSync(join(GAME_ROOT, 'src', 'render', 'InfernoRing.ts'), 'utf8');
const rendererSrc = readFileSync(join(GAME_ROOT, 'src', 'render', 'Renderer.ts'), 'utf8');
const gameSrc = readFileSync(join(GAME_ROOT, 'src', 'core', 'Game.ts'), 'utf8');
const playerSrc = readFileSync(join(GAME_ROOT, 'src', 'entities', 'Player.ts'), 'utf8');

// 原版混合解析（XNA AlphaBlend One/InvSrcAlpha + Color(n,n,n,n/2)）
const VANILLA_TEXEL = 239;   // FlameRing.png 主色红通道实测均值（α 二值 {0,255} 定谳）
const VANILLA_BG = 200;
const vanillaOut = (num5: number): number =>
  VANILLA_TEXEL * num5 + VANILLA_BG * (1 - num5 / 2);

// —— 录制 ctx（快照 globalAlpha/globalCompositeOperation/imageSmoothingEnabled）——
interface RecOp { op: string; args: unknown[]; ga: number; gco: string; smooth: boolean }
function makeRecordingCtx() {
  const rec: RecOp[] = [];
  const ctx: Record<string, unknown> = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
  };
  const snap = () => rec.push({
    op: 'call', args: [], ga: ctx.globalAlpha as number,
    gco: ctx.globalCompositeOperation as string, smooth: ctx.imageSmoothingEnabled as boolean,
  });
  for (const m of ['save', 'restore', 'translate', 'scale', 'rotate', 'setTransform']) {
    ctx[m] = (...args: unknown[]) => { snap(); rec[rec.length - 1].op = m; rec[rec.length - 1].args = args; };
  }
  ctx.drawImage = (...args: unknown[]) => { snap(); rec[rec.length - 1].op = 'drawImage'; rec[rec.length - 1].args = args; };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rec };
}

// —— 染色帧 stub（记录 (j,num5) 调用序;node 无 DOM 不走真 tintedFrame）——
const FAKE_FRAME = { __fake: true } as unknown as CanvasImageSource;
function makeBaker() {
  const calls: Array<{ j: number; num5: number }> = [];
  const baker = (_img: CanvasImageSource, j: number, num5: number) => {
    calls.push({ j, num5 });
    return FAKE_FRAME;
  };
  return { calls, baker };
}

const fp = (over: Partial<FlameRingPlayer> = {}): FlameRingPlayer => ({
  cx: 100, cy: 200, dead: false, hasInferno: true,
  flameRingRot: 0.3, flameRingScale: 0.9, ...over,
});

// ═══════════════ ① buff 链钉值（药水 2348 → buff 116 → 效果/光照面） ═══════════════
describe('① buff 链钉值（原版 1457 亲读锚）', () => {
  it('药水 2348=InfernoPotion：buffType 116/buffTime 14400/useStyle 9（Item.cs:23616-23626）', () => {
    const func = JSON.parse(readFileSync(join(GAME_ROOT, 'src', 'data', 'vanilla-itemfunc.json'), 'utf8'));
    expect(func['2348']).toMatchObject({
      consumable: 1, buffType: 116, buffTime: 14400, useStyle: 9, useTurn: 1,
    });
  });
  it('BuffType.Inferno(50) ↔ vanillaBuff 116（BuffID.Inferno;官方中文「狱火」）', () => {
    expect(BuffType.Inferno).toBe(50);
    expect(BUFF_DEFS[BuffType.Inferno].vanillaBuff).toBe(116);
    expect(BUFF_DEFS[BuffType.Inferno].fallbackName).toBe('狱火');
  });
  it('AddLight(0.65,0.4,0.1) 光照面在仓（:10304;Game.ts buffLights 推注）', () => {
    expect(gameSrc).toMatch(
      /buffs\.has\(BuffType\.Inferno\)\) buffLights\.push\(\{ tx: ptx, ty: pty, r: 0\.65, g: 0\.4, b: 0\.1 \}\)/,
    );
  });
  it('效果面钉串在仓（:10315 门禁串/323,120/20 伤/60t 跳拍——防丢锚判别面）', () => {
    const blk = gameSrc.slice(gameSrc.indexOf('if (this.player.buffs.has(BuffType.Inferno)) {'));
    expect(blk).toContain('this.infernoCounter++');
    expect(blk).toMatch(/infernoCounter % 60 === 0/);
    expect(blk).toMatch(/applyBuffTicks\((?:\w+ as unknown as \w+|en), 323, 120\)/);
    expect(blk).toMatch(/let dmg = 20;/);
    expect(blk).toMatch(/Math\.hypot\(en\.cx - this\.player\.cx, en\.cy - this\.player\.cy\) > 200/);
  });
});

// ═══════════════ ② 火圈相位推进（Main.cs:65262-65285 逐式） ═══════════════
describe('② 相位推进钉值（scale 0.004/≥1→0.8 呼吸 50t;rot 0.05 wrap ±2π）', () => {
  it('推进率常量 = 原版字面（:65263/:65276）', () => {
    expect(FLAME_RING_SCALE_RATE).toBe(0.004);
    expect(FLAME_RING_ROT_RATE).toBe(0.05);
    expect(FLAME_RING_SCALE_LO).toBe(0.8);
    expect(FLAME_RING_LAYER_STEP).toBe(0.1);
    expect(FLAME_RING_BRIGHT_BAND).toBe(0.9);
  });
  it('初值 1f 首帧：1+0.004=1.004≥1 → 重置 0.8（原版首帧 num=0.8）', () => {
    const p = { flameRingRot: 0, flameRingScale: 1 };
    advanceFlameRing(p);
    expect(p.flameRingScale).toBeCloseTo(0.8, 12);
    expect(flameRingDrawScale(p.flameRingScale)).toBeCloseTo(0.8, 12);
    expect(p.flameRingRot).toBeCloseTo(0.05, 12);
  });
  it('呼吸周期 50t：0.8 起第 49 步 0.996（<1 直读）,第 50 步回 0.8（M1 证红面）', () => {
    const p = { flameRingRot: 0, flameRingScale: 0.8 };
    for (let i = 0; i < 49; i++) advanceFlameRing(p);
    expect(p.flameRingScale).toBeCloseTo(0.996, 9);
    expect(flameRingDrawScale(p.flameRingScale)).toBeCloseTo(0.996, 9);
    advanceFlameRing(p);
    expect(p.flameRingScale).toBeCloseTo(0.8, 12);
  });
  it('rot wrap ±2π（:65278-65285 逐式）——正域漂过 2π 回卷;负域字面不回卷（rot 恒自 0 正涨,负支仅防外部直写态）', () => {
    const hi = { flameRingRot: Math.PI * 2, flameRingScale: 0.8 };
    advanceFlameRing(hi);
    expect(hi.flameRingRot).toBeCloseTo(0.05, 12);
    const hi2 = { flameRingRot: Math.PI * 2 - 0.04, flameRingScale: 0.8 };
    advanceFlameRing(hi2);
    expect(hi2.flameRingRot).toBeCloseTo(0.01, 12);   // 2π−0.04+0.05 > 2π → −2π → 0.01
    const lo = { flameRingRot: Math.PI * -2, flameRingScale: 0.8 };
    advanceFlameRing(lo);
    expect(lo.flameRingRot).toBeCloseTo(Math.PI * -2 + 0.05, 12);   // 原版字面:−6.2332 > −2π → 不回卷
  });
  it('flameRingDrawScale：<1 直读,≥1 → 0.8（:65266-65273 if/else 字面）', () => {
    expect(flameRingDrawScale(0.804)).toBeCloseTo(0.804, 12);
    expect(flameRingDrawScale(0.999)).toBeCloseTo(0.999, 12);
    expect(flameRingDrawScale(1)).toBe(0.8);
    expect(flameRingDrawScale(1.5)).toBe(0.8);
  });
});

// ═══════════════ ③ 层几何钉值（:65288-65293） ═══════════════
describe('③ 层几何钉值（num4=num+0.1j 严格>1 才回卷;num5=Lerp(0.8,0,|num4−0.9|×10)）', () => {
  it('num=0.8 相位：层 [0.8,0.9,1.0]（j=2 num4=1.0 严格大于不回卷）→ 亮度 [0,0.8,0]', () => {
    const scales = [0, 1, 2].map((j) => flameRingLayerScale(0.8, j));
    expect(scales.map((s) => Math.round(s * 1e6) / 1e6)).toEqual([0.8, 0.9, 1.0]);
    expect(scales.map(flameRingLayerBright).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0.8, 0]);
  });
  it('num=0.9 相位：层 [0.9,1.0,0.9]（1.1 回卷 0.9）→ 亮度 [0.8,0,0.8]（0.9=亮带中心最亮;M3 证红面）', () => {
    const scales = [0, 1, 2].map((j) => flameRingLayerScale(0.9, j));
    expect(scales.map((s) => Math.round(s * 1e6) / 1e6)).toEqual([0.9, 1.0, 0.9]);
    expect(scales.map(flameRingLayerBright).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0.8, 0, 0.8]);
  });
  it('亮带中心 num4=0.9 → 0.8 最亮;端点 0.8/1.0 → 0 隐没;半程 0.95 → 0.4（层间流转=呼吸观感）', () => {
    expect(flameRingLayerBright(0.9)).toBeCloseTo(0.8, 12);
    expect(flameRingLayerBright(0.8)).toBeCloseTo(0, 12);
    expect(flameRingLayerBright(1.0)).toBeCloseTo(0, 12);
    expect(flameRingLayerBright(0.95)).toBeCloseTo(0.4, 12);
  });
});

// ═══════════════ ④ 两遍拆解混合代数（BJ556 判例推广;M2 证红面） ═══════════════
describe('④ 混合代数：final = tex.rgb×num5 + dst×(1−num5/2)（XNA 预乘语义精确）', () => {
  it('base+topup===1（削底恒等;全 num5 域扫描）', () => {
    for (let i = -10; i <= 10; i++) {
      const { base, topup } = flameRingPassAlphas(i / 10);
      expect(base + topup).toBeCloseTo(1, 12);
      expect(base).toBeGreaterThanOrEqual(0);
      expect(topup).toBeLessThanOrEqual(1);
    }
  });
  it('num5=0.8 → {0.4,0.6}（tintA=num5/2;M2 证红面）', () => {
    const { base, topup } = flameRingPassAlphas(0.8);
    expect(base).toBeCloseTo(0.4, 12);
    expect(topup).toBeCloseTo(0.6, 12);
  });
  it('两遍合成 = 原版解析（浮点恒等）;单笔 source-over = num5²/2 同病对照（num5>0 判别域）', () => {
    for (const num5 of [0, 0.2, 0.4, 0.6, 0.8]) {
      const { base, topup } = flameRingPassAlphas(num5);
      // pass1 source-over：src.rgb=tex×num5（染色帧）、α_eff=ga（主体 a=1 定谳）
      const pass1 = VANILLA_TEXEL * num5 * base + VANILLA_BG * (1 - base);
      // pass2 lighter：src.rgb×src.a×ga 加算
      const pass2 = VANILLA_TEXEL * num5 * topup;
      expect(pass1 + pass2).toBeCloseTo(vanillaOut(num5), 9);
      // BJ556 同病对照：单笔 ga=num5/2 → RGB 被 α 双乘（num5=0 点两式同值 200,判别域仅 num5>0）
      const single = VANILLA_TEXEL * num5 * num5 / 2 + VANILLA_BG * (1 - num5 / 2);
      if (num5 > 0) expect(single).not.toBeCloseTo(vanillaOut(num5), 3);
      else expect(single).toBeCloseTo(vanillaOut(0), 12);
    }
    // 判别力度量：num5=0.8 单笔缺口 = tex×num5×(1−num5/2) = 239×0.8×0.6 ≈ 114.72
    expect(VANILLA_TEXEL * 0.8 - (VANILLA_TEXEL * 0.8 * 0.8 / 2)).toBeCloseTo(114.72, 6);
  });
  it('num5=0（层越界隐没相）：无贡献无削底 = dst 原样（XNA Color(0,0,0,0)）', () => {
    const { base, topup } = flameRingPassAlphas(0);
    expect(base).toBe(0);
    expect(topup).toBe(1);
    expect(VANILLA_TEXEL * 0 * topup + VANILLA_BG * (1 - base)).toBeCloseTo(vanillaOut(0), 12);
  });
  it('负 num5 域（|num4−0.9|×10>1 越界,XNA 截断 0）clamp 自洽', () => {
    const { base, topup } = flameRingPassAlphas(-0.8);
    expect(base).toBe(0);
    expect(topup).toBe(1);
  });
});

// ═══════════════ ⑤ drawInfernoRings 视觉形态 1:1（录制面;M4 证红面） ═══════════════
describe('⑤ 绘制形态（三层×两遍/帧矩形/rot+π/3·j/smoothing=true/门）', () => {
  it('num=0.9 玩家：可见层 (j,num5)=[(0,0.8),(2,0.8)];4 笔（j=1 层 num5≈0=XNA tint byte 0=无操作,整层剪枝）', () => {
    const { ctx, rec } = makeRecordingCtx();
    const { calls, baker } = makeBaker();
    drawInfernoRings(ctx, [fp({ flameRingScale: 0.9 })], FAKE_FRAME, 0, 0, 1, 800, 600, baker);
    expect(calls.map((c) => [c.j, Math.round(c.num5 * 1e6) / 1e6])).toEqual([
      [0, 0.8], [2, 0.8],
    ]);
    const draws = rec.filter((o) => o.op === 'drawImage');
    expect(draws).toHaveLength(4);   // j0:2 + j2:2（j=1 零贡献层不 baker 不画不 rotate）
    expect(draws[0].gco).toBe('source-over');
    expect(draws[0].ga).toBeCloseTo(0.4, 12);          // base=num5/2=0.4（削底+半贡献）
    expect(draws[1].gco).toBe('lighter');
    expect(draws[1].ga).toBeCloseTo(0.6, 12);          // topup=1−0.4（RGB 补足）
    expect(draws[2].gco).toBe('source-over');
    expect(draws[2].ga).toBeCloseTo(0.4, 12);
    expect(draws[3].gco).toBe('lighter');
    expect(draws[3].ga).toBeCloseTo(0.6, 12);
  });
  it('帧矩形 source(0,400j,400,400) + 旋转 rot+π/3·j + scale=num4 + 目标 ±200（:65294 逐参）', () => {
    const { ctx, rec } = makeRecordingCtx();
    const { baker } = makeBaker();
    drawInfernoRings(ctx, [fp({ flameRingRot: 0.3, flameRingScale: 0.9 })], FAKE_FRAME, 0, 0, 1, 800, 600, baker);
    const rotates = rec.filter((o) => o.op === 'rotate').map((o) => o.args[0] as number);
    // j=1 层被零贡献剪枝（num5≈0）→ rotate 只剩 j=0/j=2（rot+π/3·j）
    expect(rotates.map((r) => Math.round(r * 1e6) / 1e6)).toEqual(
      [0, 2].map((j) => Math.round((0.3 + Math.PI / 3 * j) * 1e6) / 1e6),
    );
    const layerScales = [0.9, 0.9];   // 剪枝后可见层 j=0/j=2 的 num4（j=1 num4=1.0 层被剪）
    // 层 scale 紧随各层 rotate（相机段的 scale(z,z) 在首个 rotate 之前,不参与对位）
    let prevRotate = -1;
    let li = 0;
    for (let i = 0; i < rec.length && li < 3; i++) {
      if (rec[i].op === 'rotate') prevRotate = i;
      if (rec[i].op === 'scale' && prevRotate >= 0) {
        expect(rec[i].args[0]).toBeCloseTo(layerScales[li], 9);
        expect(rec[i].args[1]).toBeCloseTo(layerScales[li], 9);
        li++;
        prevRotate = -1;
      }
    }
    expect(li).toBe(2);   // 剪枝后仅 2 个可见层
    // 染色帧 400×400 以 (−200,−200) 目标（origin(200,200) 等价）
    const draws = rec.filter((o) => o.op === 'drawImage');
    expect(draws[0].args.slice(1)).toEqual([-200, -200]);
  });
  it('相机 round 吸附变换 + LinearClamp smoothing=true（BJ65:1.4.5.7=FNA Linear）', () => {
    const { ctx, rec } = makeRecordingCtx();
    const { baker } = makeBaker();
    drawInfernoRings(ctx, [fp()], FAKE_FRAME, 160.4, 320.6, 2, 800, 600, baker);
    expect(rec[0].op).toBe('save');
    expect(rec[1].args).toEqual([400, 300]);              // viewW/2,viewH/2
    expect(rec[2].args).toEqual([2, 2]);                  // z
    expect(rec[3].args).toEqual([-Math.round(160.4 * 2) / 2, -Math.round(320.6 * 2) / 2]);
    const draws = rec.filter((o) => o.op === 'drawImage');
    expect(draws.every((o) => o.smooth === true)).toBe(true);
    expect(rec[rec.length - 1].op).toBe('restore');
  });
  it('非该 buff 不回归：dead/hasInferno=false/img=null → 零 baker 调用零笔（:65252-65256 门）', () => {
    for (const over of [
      { dead: true }, { hasInferno: false }, { dead: true, hasInferno: false },
    ] as Partial<FlameRingPlayer>[]) {
      const { ctx, rec } = makeRecordingCtx();
      const { calls, baker } = makeBaker();
      drawInfernoRings(ctx, [fp(over)], FAKE_FRAME, 0, 0, 1, 800, 600, baker);
      expect(calls).toHaveLength(0);
      expect(rec.filter((o) => o.op === 'drawImage')).toHaveLength(0);
    }
    const { ctx, rec } = makeRecordingCtx();
    const { calls, baker } = makeBaker();
    drawInfernoRings(ctx, [fp()], null, 0, 0, 1, 800, 600, baker);
    expect(calls).toHaveLength(0);
    expect(rec.filter((o) => o.op === 'drawImage')).toHaveLength(0);
  });
  it('帧数/贴图常量 = 原版（400×400×3 竖排;AssetInitializer.cs:542 Images/FlameRing）', () => {
    expect(FLAME_RING_FRAME).toBe(400);
    expect(FLAME_RING_FRAMES).toBe(3);
    expect(FLAME_RING_TEX).toBe('sprites/vanilla/FlameRing.png');
    // IHDR 物证：400×1200
    const png = readFileSync(join(GAME_ROOT, 'public', 'sprites', 'vanilla', 'FlameRing.png'));
    expect(png.readUInt32BE(16)).toBe(400);
    expect(png.readUInt32BE(20)).toBe(1200);
  });
  it('node 无 DOM：ensureFlameRingImage 返回 null（跳笔守卫）', () => {
    expect(ensureFlameRingImage()).toBeNull();
  });
});

// ═══════════════ ⑥ 接线/层序/纯读锚（M5 证红面） ═══════════════
describe('⑥ 接线锚：推进=fixedUpdate buff 块单源;渲染 pass 层序=原版 :63251<:63264<接口层', () => {
  it('Game.ts advanceFlameRing 在 buffs.has(BuffType.Inferno) 块内（每 60t 单源）', () => {
    const blk = gameSrc.slice(gameSrc.indexOf('if (this.player.buffs.has(BuffType.Inferno)) {'));
    const blkEnd = blk.indexOf('\n    }');
    expect(blk.slice(0, blkEnd)).toContain('advanceFlameRing(this.player)');
    expect(gameSrc).toMatch(/import \{ advanceFlameRing \} from '\.\.\/render\/InfernoRing'/);
  });
  it('Renderer 7h 火圈位：drawWiresBright 之后、BJ553 标记之前（原版 :63251<:63264<:47250）', () => {
    const wires = rendererSrc.indexOf('this.drawWiresBright(world, cam, viewW, viewH, z);');
    const rings = rendererSrc.indexOf('this.drawInfernoRingPass(player, cam, z, viewW, viewH);');
    const marker = rendererSrc.indexOf('// ★BJ553（2026-10-07）：鞭 tag/召唤集火目标标记', rings);
    expect(wires).toBeGreaterThan(0);
    expect(rings).toBeGreaterThan(wires);
    expect(marker).toBeGreaterThan(rings);
  });
  it('渲染 pass 纯读：drawInfernoRingPass 方法体内无推进写面（状态面单次判例）', () => {
    const m = rendererSrc.indexOf('private drawInfernoRingPass(');
    const mEnd = rendererSrc.indexOf('private flushNpcWhiteLift(', m);
    const body = rendererSrc.slice(m, mEnd);
    expect(body).not.toContain('advanceFlameRing');
    expect(body).not.toMatch(/flameRing(Rot|Scale)\s*[+\-]?=/);   // 无直写（读面豁免:读取须 await?此处纯结构断言）
    expect(body).toMatch(/!p\.dead && p\.buffs\.has\(BuffType\.Inferno\)/);
    expect(body).toContain('this.remotePlayers');
  });
  it('Player 字段初值 = 原版（Player.cs:931/:933;flameRingFrame/Alpha 死字段不抄）', () => {
    expect(playerSrc).toMatch(/flameRingRot = 0;/);
    expect(playerSrc).toMatch(/flameRingScale = 1;/);
    const p = new Player(0, 0, new Inventory());
    expect(p.flameRingRot).toBe(0);
    expect(p.flameRingScale).toBe(1);
    p.flameRingScale = 0.85;
    advanceFlameRing(p);
    expect(p.flameRingScale).toBeCloseTo(0.854, 9);
  });
});
