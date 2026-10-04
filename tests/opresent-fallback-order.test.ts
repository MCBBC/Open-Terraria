// ★K1-2 登记案「opresent 合并失败回退窗层序错位」修复锁（2026-10-05）
//
// 定谳（探针 scripts/_opresent-fallback-order.mjs 修复前实证）：compose 返 true 但
// pass3 合并未走（pOver 编译失败/FBO('opresent') 租借失败/帧界不一致）时,compose 尾
// present(warped,over) 先把世界落屏入栈,presentPendingSky 补贴后执行——纯帧屏栈序=
// ['warped','bg']（bg 叠世界之上;探针读数 maxΔ=244/n=1547746 vs 合并基线）;旗关帧=
// 补贴 present(f) 把管线画布从世界冲成天空（调用方 drawImage 画的是天空=世界丢失）。
// 修法=补贴后 reorderFallbackSkyWorld 按「天空下/世界上」重放：纯帧=清屏+重建栈序
// [bg,warped]（≙合并帧单 FBO 折叠,探针修复后 census n=0 maxΔ=0 逐字节）;屏栈关=
// warped blend off 重写管线画布（双 blit 基线层序）。合并路径零触碰。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RDR = readFileSync(resolve(__dirname, '../src/render/Renderer.ts'), 'utf8');
const COMP = readFileSync(resolve(__dirname, '../src/render/GLWorldCompose.ts'), 'utf8');

describe('opresent 回退窗层序收口（reorderFallbackSkyWorld）', () => {
  it('收口口存在且签名三参（sky 引用/compose 实例/accFbo——warped 同界租借派生源）', () => {
    expect(RDR).toMatch(/private reorderFallbackSkyWorld\(\s*\n\s*sky: \{ fboName: string; w: number; h: number \}, wc: GLWorldCompose, accFbo: PipelineFbo \| null,\s*\n\s*\): void \{/);
  });

  it('纯帧屏栈支=清屏+重建栈序（bg 入栈底→warped 入栈顶;清屏必须在 bg 前——栈序重建起点）', () => {
    expect(RDR).toMatch(/if \(this\._c10eFrame && !this\._c10eWorldToHud && pipe\.screenStackMode && pipe === this\.swPipe\) \{\s*\n\s*\/\/ 纯帧:清屏\+依层序重建栈（bg 下\/warped 上——补贴误栈的 \[warped,bg\] 整弃重放）\s*\n\s*pipe\.clearScreenForStack\(\);\s*\n\s*const fs = pipe\.fbo\(sky\.fboName, sky\.w, sky\.h\);\s*\n\s*if \(fs\?\.tex\) pipe\.present\(fs, true\);\s*\n\s*pipe\.present\(fw, true\);\s*\n\s*\} else \{\s*\n\s*\/\/ 屏栈关:世界 blend off 重写管线画布（调用方 drawImage\/blit 的内容源=世界）\s*\n\s*pipe\.present\(fw\);\s*\n\s*\}/);
  });

  it('warped 句柄=compose 同界派生式（acc 帧=FBO 界/worldCanvas 界——同名同界租借=本帧所绘同一 FBO）', () => {
    expect(RDR).toMatch(/const fw = pipe\.fbo\('warped',\s*\n\s*accFbo\?\.tex \? accFbo\.w : \(this\.worldCanvas\?\.width \?\? 0\),\s*\n\s*accFbo\?\.tex \? accFbo\.h : \(this\.worldCanvas\?\.height \?\? 0\)\);\s*\n\s*if \(!fw\?\.tex\) return;/);
  });

  it('双回退窗接线:补贴位之后各一行（lrecon 支+A2 支;skyPend 同门——不双发）', () => {
    expect(RDR).toMatch(/this\._markPath\('lrecon'\);\s*\n\s*if \(skyPend\) this\.presentPendingSky\(skyPend, viewW, viewH\);\s*\n\s*\/\/ ★K1-2 回退窗层序收口（登记案）:补贴后按「天空下\/世界上」重放世界——\s*\n\s*\/\/  纯帧栈序修复\/旗关帧画布世界还原,方法注=定谳全文\s*\n\s*if \(skyPend\) this\.reorderFallbackSkyWorld\(skyPend, wcL, accFbo\);/);
    expect(RDR).toMatch(/this\._markPath\('a2'\);\s*\n\s*if \(skyPend\) this\.presentPendingSky\(skyPend, viewW, viewH\);\s*\n\s*\/\/ ★K1-2 回退窗层序收口（登记案）:同 lrecon 支——补贴后重放世界\s*\n\s*if \(skyPend\) this\.reorderFallbackSkyWorld\(skyPend, wc, accFbo\);/);
    expect(RDR.match(/reorderFallbackSkyWorld\(sky/g)?.length).toBe(2);
  });

  it('诊断账:fallback-reorder 独立观测位（收口实发帧数;不污染 fallback/merged 归因）', () => {
    expect(RDR).toContain("this.opresentStats['fallback-reorder'] = (this.opresentStats['fallback-reorder'] || 0) + 1;");
  });

  it('compose 零触碰（合并支/回退支 present 恰两处+回退单 present 语义原样——正常路径逐位不变前提）', () => {
    expect(COMP.match(/pipeline\.present\(/g)?.length).toBe(2);
    expect(COMP).toMatch(/pipeline\.present\(this\.fboWarped, presentOver\);\s*\n\s*return true;/);
    expect(COMP).toMatch(/this\.lastMergeUsed = true;\s*\n\s*pipeline\.present\(this\.fboOpresent, presentOver\);\s*\n\s*return true;/);
  });

  it('sky-first 位不接线（fullbright 补贴/A2 未走成补贴=世界未落屏,补贴即正确层序——不收口）', () => {
    // fullbright 支:补贴先于 accFbo present（收口若误接=清屏弃世界）
    expect(RDR).toMatch(/if \(skyPend\) this\.presentPendingSky\(skyPend, viewW, viewH\);\s*\n\s*\/\/ 低清档\(#perf-gpulog\)/);
    // A2 未走成支:补贴后直接落旧链/读回链
    expect(RDR).toMatch(/if \(skyPend\) this\.presentPendingSky\(skyPend, viewW, viewH\);\s*\n\s*\/\/ ★B2b:acc 帧旧链/);
  });
});
