// ★EoL 刀2+修3 回归锁（2026-10-05,定谳链 scripts/_eol-k2k3-probe.mjs pre/post 活机）:
//   刀2 = 光女(636) atk8/9 彩虹残影环 tint 批量化——paintGhost 加亮源三档:
//     ①白 tint 贴图区直画 ②shim 切片接管(markWorldDynamicScratch→uploadShineSlice
//     →BakeSnap.tint→quadSprite uTint,TileShine 转正判例)剪帧基底 (层,帧) 稳定键
//     首见上 GPU、逐 draw 顶点色乘法=零 TintAtlas 烘焙 ③2D/降级烘焙原链
//     （★E51b 2026-10-07 收界:缺省=逐调 scratch 零键,旧 tq 单键链=?empscratch=0 门）。
//     活机:环烘焙 11.9/帧→0,环窗帧距 5.41→1.76ms;OFF/ON 像素对拍 AB1 maxΔ=4
//     (97%≤2)、AB2 98.7%≤2(残差=GPU float vs 8-bit 烘焙舍入域,低 α 边缘纹素
//     premul 读回放大,非结构性)。
//   修3 = 923 SunDance 四画改原版两遍预乘习语——XNA 预乘管线(Color 链 ×num25/
//     A/=2)语义 = rgb 贡献 premult×C.rgb【不折 A】+ dst 衰减 ×(1−texA·C.A);
//     旧 4×source-over 把 A 折进 ga → draw1/2/3 rgb 贡献减半。活机隔离画布双模型:
//     旧代码对 4×SO 模型 mean|Δ|=1.835(仪表自检),对原版语义模型 18.1(病灶);
//     新代码对原版语义模型 5.377(残差=canvas 8-bit 两遍习语中间量化,draw==synth
//     已证非转写差),场景波束区亮度 +7.4。原版锚 Main.cs:28702-28740(逐式:
//     ①value4 行2 ×1.2 A/2 ②value5 行2 ×1.1 A/2 ③color5×0.5 行1 ④color5×lerpV 行2)。
//   像素级对拍=node 无 canvas 不入本锁,探针活机覆盖(scripts/_eol-k2k3-probe.mjs)。
// 锚:Main.cs:28702-28740(923 四画)/Renderer.ts drawEmpress paintGhost(:26394-26487 环)。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RENDERER = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const LATEGAME = readFileSync(join(__dirname, '../src/entities/bossAI_lategame.ts'), 'utf8');

describe('★刀2 残影环 tint 批量化（Renderer.paintGhost）', () => {
  it('剪帧基底缓存存在,上限保险丝 96,非浏览器拒烘', () => {
    expect(RENDERER).toContain('private empGhostCuts = new Map<string, HTMLCanvasElement>()');
    expect(RENDERER).toMatch(/empGhostCuts\.size >= 96/);
    expect(RENDERER).toMatch(/typeof document === 'undefined'\) return null;\s*\n\s*const cv = document\.createElement\('canvas'\);\s*\n\s*cv\.width = Math\.max\(1, sw\)/);
  });

  it('逃生门旗 empGhostSliceOff（?empslice=0 缺省置位;活机 A/B 运行时改写口）', () => {
    expect(RENDERER).toContain('static empGhostSliceOff');
    expect(RENDERER).toMatch(/empGhostSliceOff = typeof location !== 'undefined'\s*\?\s*new URLSearchParams\(location\.search\)\.get\('empslice'\) === '0' : false/);
    expect(RENDERER).toMatch(/if \(!Renderer\.empGhostSliceOff\) \{\s*\n\s*const cut = this\.empGhostCut\(/);
  });

  it('★剪帧键=(层,帧) 无 tint——tint 走 uTint 不进键（tint 进键=逐帧漂移刷爆剪帧缓存→保险丝熔断回落烘焙链,首版实测病）', () => {
    // 四个调用点键均为帧级稳定模板,不含 ${tq}
    expect(RENDERER).toContain('`empGhostCut|${L.src.sx}x${L.src.sw}x${L.src.sh}|${L.idx * fh}`');
    expect(RENDERER).toContain('`empGhostCut|body|${body.sx},${body.sy}`');
    expect(RENDERER).toContain('`empGhostCut|187|${f2.idx * f2.fh}`');
    expect(RENDERER).toContain("`empGhostCut|arm${arm === armL ? 'L' : 'R'}|${f.idx * f.fh}`");
    // 键构造点与消费点之间不存在把 tq 拼进 empGhostCut 键的路径
    for (const m of RENDERER.matchAll(/empGhostCut\|[^`]*`/g)) {
      expect(m[0]).not.toContain('${tq}');
    }
  });

  it('白 tint 贴图区直画（atk10 轮辐零烘焙;×255 恒等=旧白键烘焙逐位同物）', () => {
    expect(RENDERER).toMatch(/const white = tint\[0\] === 255 && tint\[1\] === 255 && tint\[2\] === 255;/);
    expect(RENDERER).toMatch(/if \(white\) return \{ kind: 'rect', img, sx, sy, sw, sh \};/);
  });

  it('切片接管=uTint 顶点色乘法（tint 归一化 /255;TileShine 同量纲）,拒接回落烘焙链（★E51b 收界:缺省=逐调 scratch 零键,?empscratch=0=旧 tq 链逃生门）', () => {
    expect(RENDERER).toMatch(/this\.markWorldDynamicScratch\(cut, cutKey,\s*\n\s*\[tint\[0\] \/ 255, tint\[1\] \/ 255, tint\[2\] \/ 255\]\)/);
    // ★E51b（2026-10-07）fbKey 未量化 tq 键域收界（E51 诚实边界登记债）:旧链
    //   `tintedSprite(fbKey,...)` 键域无界（2D 600 帧 9277 新键）→ 缺省改走
    //   empGhostTinted 逐调 scratch 零键;旧整 tint 单键链保留在 empscratch=0 门后。
    expect(RENDERER).toMatch(/if \(!Renderer\.empGhostScratchOff\) \{/);
    expect(RENDERER).toMatch(/const tinted = this\.tintedSprite\(fbKey, \{ img, sx, sy, sw, sh \}, tint\);/);
    expect(RENDERER).toMatch(/return tinted \? \{ kind: 'tinted', rect: tinted \} : \{ kind: 'none' \};/);
  });

  it('twoPass 削底+加亮两遍结构不变（A/=3 预乘语义;加亮源三档分派;★E51b 新增 scratch 支=单 draw α 恒等）', () => {
    expect(RENDERER).toMatch(/globalCompositeOperation = 'destination-out';\s*\n\s*ctx\.globalAlpha = Math\.max\(0, Math\.min\(1, fadeA\)\);/);
    expect(RENDERER).toMatch(/globalCompositeOperation = 'lighter';\s*\n\s*if \(add\.kind === 'rect'\)/);
    expect(RENDERER).toContain("else if (add.kind === 'cut')");
    expect(RENDERER).toContain("else if (add.kind === 'scratch')");
    expect(RENDERER).toContain("else if (add.kind === 'tinted')");
  });
});

describe('★修3 923 SunDance 原版两遍预乘习语（bossAI_lategame.draw）', () => {
  it('四画 cutA/addA 表=原版逐式（①②A/2 削半+rgb 全量 ③×0.5 四通道同乘 ④×lerpV 同乘）', () => {
    expect(LATEGAME).toContain('{ tint: t4, band: 1, mul: 1.2, cutA: num25 * 0.5, addA: num25 }');
    expect(LATEGAME).toContain('{ tint: tv5, band: 1, mul: 1.1, cutA: num25 * 0.5, addA: num25 }');
    expect(LATEGAME).toContain('{ tint: t5, band: 0, mul: 1, cutA: num25 * 0.5, addA: num25 * 0.5 }');
    expect(LATEGAME).toContain('{ tint: t5, band: 1, mul: 1, cutA: num25 * lerpV, addA: num25 * lerpV }');
  });

  it('每画=先 destination-out 削底(剪影=原贴图 img)后 lighter 加亮(tint 全量),A=0 免削同原版', () => {
    // 循环体内序:cut 门 → dest-out 画 img → lighter 画 p.tint
    const loop = LATEGAME.match(/for \(const p of passes\) \{[\s\S]*?\n    \}\n    ctx\.restore\(\);/);
    expect(loop).not.toBeNull();
    const body = loop![0];
    const iCutGate = body.indexOf('if (p.cutA > 0.004)');
    const iDestOut = body.indexOf("globalCompositeOperation = 'destination-out'");
    const iCutDraw = body.indexOf('ctx.drawImage(img, 0, p.band * bandH, iw, bandH, dx, dy, dw, dh)');
    const iLighter = body.indexOf("globalCompositeOperation = 'lighter'");
    const iAddDraw = body.indexOf('ctx.drawImage(p.tint, 0, p.band * bandH, iw, bandH, dx, dy, dw, dh)');
    expect(iCutGate).toBeGreaterThan(-1);
    expect(iDestOut).toBeGreaterThan(iCutGate);
    expect(iCutDraw).toBeGreaterThan(iDestOut);
    expect(iLighter).toBeGreaterThan(iCutDraw);
    expect(iAddDraw).toBeGreaterThan(iLighter);
  });

  it('旧 4×source-over 单遍形 retired（alpha: num25 * 0.5 表项不存在）', () => {
    expect(LATEGAME).not.toContain('{ tint: t4, band: 1, mul: 1.2, alpha: num25 * 0.5 }');
    expect(LATEGAME).not.toMatch(/type Pass = \{\s*\n\s*tint: HTMLCanvasElement \| null; band: 0 \| 1; mul: number; alpha: number;\s*\n\s*\};/);
  });

  it('原版锚与 rgb-不折-A 语义注释在位（Main.cs:28702-28740）', () => {
    expect(LATEGAME).toContain('Main.cs:28702-28740');
    expect(LATEGAME).toContain('premult×C.rgb【不折 A】');
    expect(LATEGAME).toContain('destination-out×(A/255) 削底');
  });
});
