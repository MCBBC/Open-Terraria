// ★J类 制度面:渲染 v2 验收三判例固化为 checklist 锁（2026-09-27 清算刃）。
//  三判例=渲染改造战役反复见血后沉淀的验收要件——任何新 GL 支/回退面/旋转件
//  落地时必须能对号入座;本锁把「漏项=爆红」制度化,防验收盲区复发:
//  ① 非对称旋转件:旋转/镜像贴图的 origin 锚必须按 spriteDirection 切换
//     （XNA origin 翻转绕 origin 点;576/577=94、564/565=52、668=106 判例族——
//     曾漏=旋转件镜像侧整体错位半贴图宽）。
//  ② 发射支 GL 桩:每条 GL 快路径必须有「窗不可表达→false→2D 原链」的桩
//     （pushQuadBatch 族可表达性门;曾漏=GL 死会话直接丢内容）。
//  ③ 回退态帧耗可测:每条降级/回退面必须有指纹计数（composeLastFail/_wwStat.falls/
//     lightGateDiag/accFail/replay2D fallback）——无指纹回退=R1-F10 族病;
//     帧耗量化走 tools/trace-x-ray.mjs digest 工作流。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';

const RDR = readFileSync(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');
const SHIM = readFileSync(new URL('../src/render/glshim/GLShimExecutor.ts', import.meta.url), 'utf8');
const WX = readFileSync(new URL('../src/render/WeatherRenderer.ts', import.meta.url), 'utf8');
const WW = readFileSync(new URL('../src/render/WaterWaves.ts', import.meta.url), 'utf8');

describe('渲染 v2 验收 checklist（三判例制度锁）', () => {
  it('判例① 非对称旋转件:anchorPx 按 facing 切换（facingRight ? px : sw−px）+判例值在位', () => {
    expect(RDR).toContain('const originX = opts.anchorPx != null ? (facingRight ? opts.anchorPx : sw - opts.anchorPx) : sw / 2;');
    expect(RDR).toContain('576/577=94、564/565=52、668=106');
    expect(RDR).toContain('anchorPx: 94');    // 576/577 食人魔
    expect(RDR).toContain('anchorPx: 52');    // 564/565 暗黑魔法师
    // 668 鹿角怪=非对称锚 106（drawDeerclopsGrid 自管,Game 侧伪影案 BJ51 判例）
    expect(RDR).toContain('origin(106 或 220-106, 242-4)');
  });

  it('判例② 发射支 GL 桩:批发射器窗不可表达恒返回 false（行为测）', () => {
    // 无 attach（active=false）→ 两族发射口必须 false=调用方走 2D 原链
    const shim = new GLShimExecutor({} as never);
    const data = new Float32Array(8);
    const imgStub = { width: 1, height: 1 } as unknown as CanvasImageSource;
    expect(shim.pushQuadBatch(imgStub, 'k', data, 1, () => {})).toBe(false);
    expect(shim.pushQuadBatchRgba(imgStub, 'k', data, 1, () => {})).toBe(false);
  });
  it('判例② 发射支 GL 桩:雨/雪沙批 false→2D 原链回退面在位（源锚）', () => {
    expect(WX).toContain('return r.emitRainQuadBatch(tex, RAIN_TEX_KEY, rainBatchData, quads, replayRainBatch2D);');
    expect(WX).toContain('emitPrecipQuadBatch(dTex, PRECIP_TEX_KEY, precipBatchData, quads, replayPrecipBatch2D)');
    expect(RDR).toContain('if (!shim?.active) return false;');
  });

  it('判例③ 回退态帧耗可测:降级指纹面在位+trace-x-ray 工具在场', () => {
    // ★X2 重锚（2026-10-01）:闪屏定谳仪（ba37429f,2026-09-30）accFail 加 detail
    //  实参（原因入账直连 F5 报告）——判例③「回退态可测」语义恰被强化
    expect(SHIM).toContain("this.accFail('tex',");           // acc 纹理降级计数链（带 detail）
    expect(SHIM).toContain('this.stats.fallback++;');        // 2D 回退计数
    expect(WW).toContain('_wwStat.falls++;');                // 波场失联回落计数
    expect(existsSync(new URL('../tools/trace-x-ray.mjs', import.meta.url))).toBe(true);
  });
});
