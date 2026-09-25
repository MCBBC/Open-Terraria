// ★P0-B 雷击风暴修复锁（2026-09-25 定谳续刀）。
// 定谳:StormLightning.draw→drawBolt 每 bolt K=6 切片×逐段 beginPath+fill
// （~1500 fill/雷帧）在 acc shim 态=逐 fill rasterizePathOp 隔离栅格化+markDynamic
// +即发即弃 flush→texImage2D 2000-3500 次/雷帧≈11ms 上传风暴（雷单独砍半帧率）。
// 本刀:①整 bolt 烘一张 scratch（emit 闭包单源——烘焙/兜底共 consumption,像素
// 逐位等价论证:加算钳底单调+整数设备平移覆盖率不变）;②并发钳=vanilla 生成界
// （MaxForksPerBolt/MaxForkDepth 反编译锚）;③GLShimExecutor 高频形状判例注。
// node 可跑面:源码锚+vanilla 反编译锚+加算钳底等价性数学锁（8bit 模拟）;
// 像素/帧耗对拍=scripts/_p0b-bolt-ab.mjs 探针（浏览器,雷帧 +11ms→+1-2ms 验收）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arcSurgeWeaponGenerator, stormLightningGenerator } from '../src/fx/LightningGenerator';

const SRC = readFileSync(join(__dirname, '../src/entities/proj1457.ts'), 'utf8');
const SHIM = readFileSync(join(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');
const VGEN = readFileSync(join(__dirname, '../../Terarria1457/Terraria.GameContent/LightningGenerator.cs'), 'utf8');

describe('P0-B ① 专用化通道:整 bolt 单 scratch 烘焙', () => {
  it('emit 闭包单源（烘焙/兜底共 consumption）——切片几何配色单实现', () => {
    // 逃生门:?boltbake=0 回原链（探针 A/B 面+回滚口;缺省烘焙开）
    expect(SRC).toContain('static BOLT_BAKE_OFF = (() => {');
    expect(SRC).toContain("new URLSearchParams(location.search).get('boltbake') === '0'");
    expect(SRC).toContain('if (!StormLightning.BOLT_BAKE_OFF && intensity > 0 && this.bakeBolt(');
    expect(SRC).toContain('const emitSlices = (g: CanvasRenderingContext2D): void => {');
    // 烘焙路径消费 emit(sctx);兜底路径原链 emitSlices(ctx)（仅烘焙失败可达）
    expect(SRC).toContain('    emit(sctx);');
    expect(SRC).toContain('    emitSlices(ctx);   // 兜底=原链逐切片直画(仅烘焙失败可达;正常会话零走)');
    // 旧直画体已收编进闭包（g. 面）——不再有裸 ctx 逐切片 fill
    expect(SRC).toContain('g.beginPath();');
    expect(SRC).toContain('g.closePath();');
    expect(SRC).toContain('g.fill();');
  });
  it('烘焙几何:整数设备平移保守 bbox+4096 帽+环境态同源（α/filter 钉面）', () => {
    // bbox superset:stripWidthAt 0.5 下限入半宽;Frobenius 上界;AA 1px
    expect(SRC).toContain('const halfW = Math.max(W * intensity, 0.5) / 2;');
    expect(SRC).toContain('const pad = scale * halfW + 1;');
    expect(SRC).toContain('Math.sqrt(a * a + b * b + c * c + d * d)');
    expect(SRC).toContain('sx > 4096 || sy > 4096');
    // 整数平移重放=覆盖率逐位（rasterizeOp 同判例）
    expect(SRC).toContain('sctx.setTransform(a, b, c, d, e - fx, f - fy);');
    // 环境态与原链逐 fill 同源;blit 钉 α=1 防二次乘+滤镜钉 none（滤镜已烘入面）
    expect(SRC).toContain('sctx.globalAlpha = ctx.globalAlpha;');
    expect(SRC).toContain('sctx.globalCompositeOperation = \'lighter\';');
    expect(SRC).toContain('ctx.globalAlpha = 1;');
    expect(SRC).toContain("if (ctx.filter !== 'none') { try { ctx.filter = 'none'; } catch { /* 非法值忽略 */ } }");
    expect(SRC).toContain('ctx.drawImage(sc, 0, 0, sx, sy, fx, fy, sx, sy);');
    // 动态源登记=acc shim 单上传通道（Renderer 侧 no-op 安全出口）
    expect(SRC).toContain('r9.markWorldDynamicScratch(sc);');
    const RDR = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
    expect(RDR).toContain('markWorldDynamicScratch(img: HTMLCanvasElement): void {');
    expect(RDR).toContain('if (Renderer.bgl && Renderer.bglShim) this.bglShimReg().markDynamic(img);');
  });
  it('scratch 面纪律:模块级只增不减+willReadFrequently（CanvasWatch/R3-F8 判例）', () => {
    expect(SRC).toContain('let _boltScratch: HTMLCanvasElement | null = null;');
    expect(SRC).toContain("sc.getContext('2d', { willReadFrequently: true })");
    expect(SRC).toContain('if (_boltScratch.width < w) _boltScratch.width = w;');
  });
  it('加算钳底等价性（8bit 模拟锁）:逐加逐钳 ≡ 钳底后一次合加——烘焙像素论证的根', () => {
    // 'lighter' 纯加算+8bit 逐加钳 = min 单调性 ⇒ min(255,w+min(255,S)) ≡ 逐加
    // （w=背景存量,S=切片贡献序列——烘焙=scratch 内逐加后一次 blit,原链=逐加直画）
    const seqAdd = (w: number, xs: number[]): number => {
      let v = w;
      for (const x of xs) v = Math.min(255, v + x);
      return v;
    };
    const bakeAdd = (w: number, xs: number[]): number =>
      Math.min(255, w + xs.reduce((a, x) => Math.min(255, a + x), 0));
    for (let w = 0; w <= 255; w += 7) {
      for (let trial = 0; trial < 40; trial++) {
        const xs = Array.from({ length: 8 }, () => ((w * 31 + trial * 17) % 97) + 3);
        expect(bakeAdd(w, xs)).toBe(seqAdd(w, xs));
      }
    }
  });
});

describe('P0-B ③ 并发钳+强度门（vanilla 语义核对定谳）', () => {
  it('钳值 13=vanilla 生成上界（ArcSurge 3³ 展开）;风暴界 7 由生成端同参封顶', () => {
    expect(SRC).toContain('static readonly BOLT_DRAW_CAP = 13;');
    // 反编译锚:StormLightning 2/2 → ≤1+2+4=7;ArcSurge 3/3 → ≤1+3+9=13
    expect(VGEN).toContain('MaxForksPerBolt = 2');
    expect(VGEN).toContain('MaxForkDepth = 2');
    expect(VGEN).toContain('MaxForksPerBolt = 3');
    expect(VGEN).toContain('MaxForkDepth = 3');
    // 本仓克隆生成端同参=正常会话零截断（钳为纯防御位）
    const storm = stormLightningGenerator(null);
    expect(storm.maxForksPerBolt).toBe(2);
    expect(storm.maxForkDepth).toBe(2);
    const arc = arcSurgeWeaponGenerator({ x: 0, y: 0 }, { x: 800, y: 0 }, null);
    expect(arc.maxForksPerBolt).toBe(3);
    expect(arc.maxForkDepth).toBe(3);
  });
  it('主雷恒最后上屏（vanilla MainBolt=bolts.Last() 同位）+opacity ε 门逐位等价', () => {
    // 钳触发时:先画 [0..cap),再补画末位主雷——vanilla 绘制序保持
    expect(SRC).toContain('const b = this.bolts[n - 1];   // 主雷恒最后（生成序:forks…主雷收尾）');
    // opacity≤ε ⇒ 全切片 am≤ε ⇒ 旧链逐 fill 亦全剔除=逐位等价 no-op
    expect(SRC).toContain('if (opacity > 0.004) {');
  });
});

describe('P0-B ④ GLShimExecutor 高频形状判例登记', () => {
  it('rasterizePathOp 判例注在场:低频专用+高频须批化/预烘+fillText/strokeText 连带风险', () => {
    expect(SHIM).toContain('★P0-B 判例登记（2026-09-25 雷击风暴定谳）');
    expect(SHIM).toContain('必须在上游【批化/预烘】后走单 drawImage 动态源');
    expect(SHIM).toContain('StormLightning bolt 每雷 ~1500 fill 曾打出 2000-3500 次/帧上传风暴≈11ms');
    expect(SHIM).toContain('fillText/strokeText 若未来接入本通道');
  });
});
