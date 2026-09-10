// ★SW-FX24 2026-09-10（BJ56 移交疑点："天顶剑 FinalFractal 拖尾 hw=prof.len/2=25,
// 按 VertexStrip.cs:156-159 应为半宽 50——疑似既存欠宽"）
// 定谳：
//  · hw 公式【无罪】：反编译半宽链 = FinalFractalHelper.cs:29 [1457]
//    trailWidth = fullBladeLength/2 → :62-65 StripWidth 恒返 trailWidth →
//    VertexStrip.cs:153-159 AddVertexPair 把 widthFunction 返回值【直接】当两侧
//    偏移（v = pos ± (rot−π/2)·num，无二次除 2）⇒ 半宽 = fullBladeLength/2。
//    BJ56「应为半宽 50」系把构造参 fullBladeLength(50) 误当 widthFunction 返回值；
//    实际返回 trailWidth=25（default 档全宽 50=参数原值，本相正确）。
//    家族对照：Terraprisma 946 EmpressBladeDrawer.cs:40-43 [1457] StripWidth 裸返
//    36f（无 /2）→ 仓 MinionProj.ts hw:36 半宽语义同构 1:1。
//  · 真欠宽【在表值】：仓 FRACTAL_PROFILES len 列 = 1456 旧表逐值全等，1457 已调
//    九项（65 48→60、1123 48→75、46 48→65、121 76→110、190 70→105、368 70→75、
//    674 70→75、795 70→72、3018 80→75），1458 同域零漂移——已对齐 1457 终值。
//  本测试金标 = 反编译源直读解析（非硬编码），1457/1458 双目录对拍 + 1456 变异
//  判别器（判别力自证：对旧表必报 9 项漂移、对金标自身必报 0）。
// 跑法：npx vitest run tests/sw-fx24-finalfractal-trailwidth.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FRACTAL_KEYS, fractalProfile } from '../src/entities/SwingArc';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DECOMP_ROOT = join(ROOT, '..');          // SandboxWorld/（反编译基准在仓库根）
const has = (p: string): boolean => existsSync(p);
const readDecomp = (base: string, rel: string): string | null =>
  has(join(DECOMP_ROOT, base, rel)) ? readFileSync(join(DECOMP_ROOT, base, rel), 'utf8') : null;

/** 从反编译 FinalFractalHelper.cs 解析 _fractalProfiles 表（id → fullBladeLength）。
 *  表文本形态（1457 :74-160）：
 *    { 65,  new FinalFractalProfile(60f, new Color(236, 62, 192)) }, …
 *  1123 项颜色为 Main.OurFavoriteColor（无字面量，解析器跳过其颜色）。 */
function parseFractalTable(src: string): { lens: Record<number, number>; colors: Record<number, [number, number, number]> } {
  const start = src.indexOf('_fractalProfiles');
  expect(start).toBeGreaterThan(0);
  const end = src.indexOf('};', start);
  const body = src.slice(start, end);
  const lens: Record<number, number> = {};
  const colors: Record<number, [number, number, number]> = {};
  const re = /(\d+),\s*new FinalFractalProfile\(([\d.]+)f,\s*(?:new Color\((\d+),\s*(\d+),\s*(\d+)\)|Main\.OurFavoriteColor)?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const id = Number(m[1]);
    lens[id] = Number(m[2]);
    if (m[3] !== undefined) colors[id] = [Number(m[3]), Number(m[4]), Number(m[5])];
  }
  return { lens, colors };
}

/** 解析 _defaultProfile = new FinalFractalProfile(50f, Color.White) 的缺省全刃长 */
function parseDefaultLen(src: string): number {
  const m = src.match(/_defaultProfile\s*=\s*new FinalFractalProfile\(([\d.]+)f/);
  expect(m).not.toBeNull();
  return Number(m![1]);
}

const FF_REL = join('Terraria.Graphics', 'FinalFractalHelper.cs');
const src1457 = readDecomp('Terarria1457', FF_REL);
const src1458 = readDecomp('Terarria1458', FF_REL);
const src1456 = readDecomp('Terarria1456', FF_REL);   // 旧基线=变异判别器参照（仓库漏更来源）

describe('SW-FX24 ① 反编译金标直读：21 剑 fullBladeLength 表', () => {
  it('1457 金标解析出 21 剑且与 1458 同域零漂移（终值锚 FinalFractalHelper.cs:74-160）', () => {
    expect(src1457, 'Terarria1457/Terraria.Graphics/FinalFractalHelper.cs 不在盘上').toBeTruthy();
    const g57 = parseFractalTable(src1457!);
    expect(Object.keys(g57.lens).length).toBe(21);
    if (src1458) {
      const g58 = parseFractalTable(src1458);
      expect(Object.keys(g58.lens).length).toBe(21);
      expect(g58.lens).toEqual(g57.lens);              // 1458 同域零漂移（trailWidth 链同 :29/:62-65）
    }
  });

  it('仓库 FRACTAL_PROFILES.len 逐值=1457 金标（21 剑）', () => {
    expect(src1457).toBeTruthy();
    const g = parseFractalTable(src1457!);
    expect(FRACTAL_KEYS.length).toBe(21);
    expect(FRACTAL_KEYS.sort((a, b) => a - b)).toEqual(Object.keys(g.lens).map(Number).sort((a, b) => a - b));
    for (const id of FRACTAL_KEYS) {
      expect(fractalProfile(id).len, `剑 ${id} fullBladeLength 漂移（1457 终值=${g.lens[id]}）`).toBe(g.lens[id]);
    }
  });

  it('仓库颜色列逐值=1457 金标字面量（1123=OurFavoriteColor 已另测，Main.cs:886）', () => {
    expect(src1457).toBeTruthy();
    const g = parseFractalTable(src1457!);
    const nLit = Object.keys(g.colors).length;
    expect(nLit).toBe(20);                             // 21 剑中 20 项有 Color 字面量（1123 除外）
    for (const [id, rgb] of Object.entries(g.colors)) {
      expect(fractalProfile(Number(id)).color, `剑 ${id} trailColor 漂移`).toEqual(rgb);
    }
  });

  it('缺项回退 = _defaultProfile fullBladeLength 50（FinalFractalHelper.cs:162 [1457]）→ 半宽 25', () => {
    if (src1457) expect(parseDefaultLen(src1457)).toBe(50);
    expect(fractalProfile(0).len).toBe(50);            // 0 不在表 → default
    expect(fractalProfile(0).color).toEqual([255, 255, 255]);  // Color.White
    // BJ56 疑点正解：VertexStrip 消费的半宽 = len/2 = 25（全宽 50=构造参原值），
    // 非「半宽 50」——widthFunction 返回 trailWidth 而非 fullBladeLength。
    expect(fractalProfile(0).len / 2).toBe(25);
  });
});

describe('SW-FX24 ② 半宽语义链：widthFunction 返回值=VertexStrip 半宽（无二次除 2）', () => {
  it('VertexStrip.cs:153-159 [1457] 原文在位：num=widthFunction(p) 直接乘 (rot−π/2) 向、两侧 ±', () => {
    for (const base of ['Terarria1457', 'Terarria1458']) {
      const src = readDecomp(base, join('Terraria.Graphics', 'VertexStrip.cs'));
      if (!src) continue;
      expect(src).toContain('float num = widthFunction(progressOnStrip);');                       // :156
      expect(src).toContain('MathHelper.WrapAngle(rot - MathF.PI / 2f).ToRotationVector2() * num'); // :157
      expect(src).toContain('AddVertexPair(pos + vector, pos - vector, progressOnStrip, vertexColor)'); // :158
      // 无二次缩放：num 即两侧偏移=半宽
    }
  });

  it('FinalFractalHelper StripWidth 恒返 trailWidth（:62-65 [1457]）、trailWidth=fullBladeLength/2（:29）', () => {
    for (const src of [src1457, src1458]) {
      if (!src) continue;
      expect(src).toContain('trailWidth = fullBladeLength / 2f;');   // :29
      const sw = src.match(/private float StripWidth\(float progressOnStrip\)\s*\{\s*return trailWidth;\s*\}/);
      expect(sw, 'StripWidth 须裸返 trailWidth（无 /2、无 progress 项）').not.toBeNull();
    }
  });

  it('家族对照：Terraprisma 946 EmpressBladeDrawer.cs:40-43 StripWidth 裸返 36f=半宽、仓 MinionProj hw:36 同构', () => {
    const eb = readDecomp('Terarria1457', join('Terraria.Graphics', 'EmpressBladeDrawer.cs'));
    expect(eb, 'EmpressBladeDrawer.cs 不在盘上').toBeTruthy();
    expect(eb).toContain('return 36f;');                                 // :42 —— widthFunction 返回值即半宽
    const minionTs = readFileSync(join(ROOT, 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(minionTs).toContain('hw: 36');                                // 仓 946 拖尾半宽 36=反编译裸返值 1:1
    // ⇒ 同一 VertexStrip 消费语义下「widthFunction 返回值=半宽」在仓内 946 已成立，
    //   FinalFractal 的 hw=len/2 与 trailWidth 同构（TrailShader/GL verts 同消费）。
  });

  it('仓 TrailShader 顶点/CPU 两侧消费 hw=半宽（GL verts ±(rot−π/2)·hw = VertexStrip.cs:157 同式）', () => {
    const ts = readFileSync(join(ROOT, 'src', 'fx', 'TrailShader.ts'), 'utf8');
    expect(ts).toContain('Math.cos(rot - Math.PI / 2) * q.hw');          // :374（A 侧 +、B 侧 −）
    expect(ts).toContain('Math.abs(bestU) > hw');                        // :322 CPU 路径 |u|>hw 剔除=半宽带
  });
});

describe('SW-FX24 ③ 变异判别力自证（红蓝自审）', () => {
  it('判别器对 1456 旧表必报 9 项漂移、对 1457 金标自身必报 0——可分辨两态', () => {
    const g = parseFractalTable(src1457!);
    const diffCount = (table: Record<number, number>): number =>
      FRACTAL_KEYS.filter((id) => table[id] !== undefined && table[id] !== g.lens[id]).length;
    // 1456 旧表（=仓库漏更前状态，逐值抄自 Terarria1456/Terraria.Graphics/FinalFractalHelper.cs:79-159）
    const legacy1456: Record<number, number> = {
      65: 48, 1123: 48, 46: 48, 121: 76, 190: 70, 368: 70, 674: 70, 273: 70, 675: 70,
      2880: 70, 989: 48, 1826: 76, 3063: 76, 3065: 70, 757: 70, 155: 70, 795: 70,
      3018: 80, 4144: 45, 3507: 45, 4956: 86,
    };
    if (src1456) {
      // 反编译 1456 直读对拍：仓旧表逐值全等 1456（漏更来源定谳）
      const g56 = parseFractalTable(src1456);
      expect(g56.lens).toEqual(legacy1456);
    }
    expect(diffCount(legacy1456)).toBe(9);   // 变异体（旧值回注）必检出 9 项 → toBe 金标断言对回退必红
    expect(diffCount(g.lens)).toBe(0);       // 金标自身零漂移 → ① 的逐值断言对正确实现必绿
  });
});
