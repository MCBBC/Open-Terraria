// ★opresent 单 present 合并——源码纪律锁（2026-09-25,主战役收官后第一枚收割刀）
//
// 天空栈（C10b bg+云合并背板）与世界合成（A2 光照×扭曲链）在同一共管管线内
// 原分两次全屏回贴主画布;本刀合并为一次：
//   ①drawCloudsNear defer 收口（不 present 不 blit,FBO('bg') 挂起）
//   ②worldCompose compose 尾 pass3 over(warped,sky)→FBO('opresent')→present
//   ③主画布单 blit（回贴账 2→1）
// 字节等价=porter-duff over 结合律（预乘域,GLWorldCompose OPRESENT_VERT 注推导;
// 半透明重叠像素 ±1~2LSB=cloudbatch/C10b GC·GD 备案族）。运行时像素等价由
// scripts/_opresent-ab.mjs 页内翻面对拍兜底（群系×天气×缩放/相机/夹层/洞穴/水下
// 矩阵）;本文件锁「接线不漂移」+夹层谓词面+回退补贴面。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RDR = readFileSync(resolve(__dirname, '../src/render/Renderer.ts'), 'utf8');
const SKY = readFileSync(resolve(__dirname, '../src/render/SkyRenderer.ts'), 'utf8');
const COMP = readFileSync(resolve(__dirname, '../src/render/GLWorldCompose.ts'), 'utf8');
const SRC = readFileSync(resolve(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');
const PIPE = readFileSync(resolve(__dirname, '../src/render/GLPipeline.ts'), 'utf8');
const REP = readFileSync(resolve(__dirname, '../src/debug/DebugReport.ts'), 'utf8');

describe('opresent 旗面与帧状态', () => {
  it('?opresent 转正缺省开（2026-09-25 首日全矩阵逐字节 ALL PASS——cloudpipe 先例）,?opresent=0 总逃生门', () => {
    expect(RDR).toContain("get('opresent') !== '0'");
    expect(RDR).toContain('static get opresent()');
    expect(RDR).toContain('static opresentSetForTest(v: boolean): void');
  });

  it('帧状态:_opresentSky 挂起引用（bg 段先清后置,compositeLight 单消费）', () => {
    expect(RDR).toContain('private _opresentSky: { fboName: string; w: number; h: number } | null = null;');
    // bg 段帧界清+defer 挂起登记（FBO 名='bg'=C10b 合并会话名,尺寸=主画布帧界）
    expect(RDR).toMatch(/this\._opresentSky = null;\s*\/\/ ★opresent 帧界清/);
    expect(RDR).toMatch(/this\._opresentSky = \{ fboName: 'bg', w: this\.canvas\.width, h: this\.canvas\.height \};/);
    // compositeLight 头单消费（取出即清——帧界不跨帧残留）
    expect(RDR).toMatch(/const skyPend = this\._opresentSky;\s*\n\s*this\._opresentSky = null;/);
  });

  it('诊断面:opresentUsed/opresentStats（merged/fallback 分布;DebugReport 独立块不破 C10b 锁面）', () => {
    expect(RDR).toContain('opresentUsed = false;');
    expect(RDR).toContain("opresentStats['merged']");
    expect(RDR).toContain("opresentStats['fallback']");
    expect(REP).toMatch(/opresent: \{\s*\n\s*used: g\.renderer\?\.opresentUsed \?\? null,\s*\n\s*stats: g\.renderer\?\.opresentStats \?\? null,\s*\n\s*\}/);
  });
});

describe('opresent 合并门（先定谳再动刀——defer 前全数可判）', () => {
  it('门=旗×非拍照×非 fullbright×wfbo×非 CPU×世界层开×全分辨率×无 shimmer×夹层谓词', () => {
    expect(RDR).toMatch(/const opresentWanted = Renderer\.opresent && !this\._capturePass && !this\.fullbright\s*\n\s*&& Renderer\.wfbo && !this\.isCpuRender\(\) && this\.worldLayerEnabled && wK === 1\s*\n\s*&& this\.monoFilters\.shimmerAlpha <= 0\s*\n\s*&& !this\.sky\.opresentInterlayerPending\(\);/);
  });

  it('wK 计算上移 bg 段前（defer 前定值;世界段共用同值——表达式逐字同,仅一处定义）', () => {
    // 上移点:opresent 前置注释+计算三行
    expect(RDR).toMatch(/★opresent 前置:世界层缩放系数在此定值[\s\S]{0,400}let wK = this\.effectiveRenderScale\(\);\s*\n\s*if \(wK < 1 && this\._waveLiquidInView && waterWaves\.quality > 0 && this\.waterWarp\.active\(\)\) wK = 1;\s*\n\s*this\._worldLowK = wK;/);
    // 原位只留指针注——双定义禁（单源）
    expect(RDR.match(/let wK = this\.effectiveRenderScale\(\);/g)?.length ?? 0).toBe(1);
  });

  it('defer 只在 C10b 合并分支置位（mergedSession 在场=pipe 后端;skyMergeable 上游已含色罩/黑闪/remix 门）', () => {
    expect(RDR).toMatch(/mergedSession = glbg;\s*\n\s*opresentDefer = opresentWanted;/);
    expect(RDR).toContain('let opresentDefer = false;');
  });
});

describe('opresent 夹层谓词（SkyRenderer 单源,保守超集——宁可不合并不漏判）', () => {
  it('opresentInterlayerPending 覆盖四夹层绘制位的早退条件析取', () => {
    expect(SKY).toMatch(/opresentInterlayerPending\(\): boolean \{\s*\n\s*if \(this\.lanternOpacity > 0\.001\) return true;\s*\n\s*if \(this\.fx\.party && this\.fx\.surfaceY > 0\) return true;\s*\n\s*if \(this\.slimeSky\.isActive \|\| this\.martianSky\.isActive\) return true;\s*\n\s*if \(this\.dramaCore !== null \|\| this\.dramaPieces\.length > 0 \|\| this\.dramaExplosions\.length > 0\) return true;\s*\n\s*if \(this\.ambEntities\.length > 0 \|\| this\.pendingAmbientSpawns\.length > 0\) return true;\s*\n\s*if \(!this\.ambientRemoteDriven && this\.ambNextAttempt <= 2\) return true;\s*\n\s*return false;/);
  });

  it('谓词与各 draw 早退同源（lanternOpacity 首门/party 门/slime·martian isActive 门——漂移即改双点）', () => {
    expect(SKY).toMatch(/if \(this\.lanternOpacity <= 0\.001\) \{/);            // drawLanterns 首门
    expect(SKY).toMatch(/if \(!this\.fx\.party \|\| this\.fx\.surfaceY <= 0\) \{/);  // drawPartyBalloons 早退
    expect(SKY).toMatch(/const sky = this\.slimeSky;\s*\n\s*if \(!sky\.isActive\) return;/);
    expect(SKY).toMatch(/const sky = this\.martianSky;\s*\n\s*if \(!sky\.isActive\) return;/);
  });

  it('drawCloudsNear defer 参数:早退与 finishBatch 双收口点都尊重 defer（C10b 缺省路径逐位不变）', () => {
    expect(SKY).toMatch(/mergedSession\?: GLSpriteLayer \| null,\s*\n\s*\/\*\* ★opresent[^]*?deferBlit = false\) \{/);
    // 早退收口:defer=不 present 不 blit
    expect(SKY).toMatch(/if \(merged\) \{ merged\.end\(!deferBlit\); if \(!deferBlit\) \{ ctx\.drawImage\(merged\.canvas, 0, 0\); ctx\.globalAlpha = 1; \}\s*\}\s*\n\s*return;/);
    // finishBatch:defer=跳过全幅 blit;非合并会话（bbox 路径）不受 defer 影响
    expect(SKY).toMatch(/shared\.end\(!deferBlit\);[\s\S]{0,420}if \(!deferBlit\) ctx\.drawImage\(shared\.canvas, 0, 0\);/);
  });

  it('GLSpriteLayer.end(present=true) 缺省=FBO→管线画布 present 旧语义;defer=FBO 引用必清', () => {
    expect(SRC).toMatch(/end\(present = true\): void \{\s*\n\s*if \(this\.unavailable \|\| !this\.gl\) return;\s*\n\s*this\.gl\.bindVertexArray\(null\);\s*\n\s*if \(this\.pipe && this\.pipeFbo\) \{\s*\n\s*if \(present\) this\.pipe\.present\(this\.pipeFbo\);\s*\n\s*this\.pipeFbo = null;/);
  });
});

describe('opresent pass3（GLWorldCompose compose 尾）', () => {
  it('over 合成程序单源注册（构造+recreate 双挂点;FBO 名 opresent 不撞命名空间）', () => {
    expect(COMP).toContain("this.pOver = this.pipeline.program('opresent', OPRESENT_VERT, OPRESENT_FRAG);");
    expect(COMP.match(/this\.pOver = this\.pipeline\.program\('opresent', OPRESENT_VERT, OPRESENT_FRAG\);/g)?.length).toBe(2);
    expect(COMP).toContain("pipeline.fbo('opresent', w, h)");
    // 命名空间:opresent 与 clouds/bg/lit/warped/light2/world 各归各
    expect(COMP).toContain("pipeline.fbo('lit', w, h)");
    expect(COMP).toContain("pipeline.fbo('warped', w, h)");
  });

  it('pass3=over(warped, sky) 预乘域公式,blend off 直写;尺寸门（不一致回退单 present）', () => {
    // over 公式（uWorld 上层;字节等价推导注释锚）
    expect(COMP).toContain('outColor = vec4(w.rgb + s.rgb * (1.0 - w.a), w.a + s.a * (1.0 - w.a));');
    expect(COMP).toMatch(/const fboSky = sky && sky\.w === w && sky\.h === h \? pipeline\.fbo\(sky\.fboName, sky\.w, sky\.h\) : null;/);
    // 合并路径 present FBO('opresent');回退路径保持原单 present（A2 面零改动）
    expect(COMP).toMatch(/this\.lastMergeUsed = true;\s*\n\s*pipeline\.present\(this\.fboOpresent\);\s*\n\s*return true;/);
    expect(COMP).toMatch(/pipeline\.present\(this\.fboWarped\);\s*\n\s*return true;/);
  });

  it('lastMergeUsed 语义:compose 头重置 false,pass3 独置 true（调用方据此补贴）', () => {
    expect(COMP).toMatch(/this\.lastMergeUsed = false;   \/\/ ★opresent:每次 compose 重置（失败\/回退面=未合并）\n    const pipeline = this\.pipeline;/);
  });

  it('双 compose 路径（lrecon+A2）都传 skyPend;ok-but-not-merged 补贴,A2 失败落旧链前补贴', () => {
    expect(RDR.match(/skyPend,   \/\/ ★opresent:天空栈挂起→pass3 合并（单 present）/g)?.length).toBe(2);
    expect(RDR).toMatch(/if \(wcL\.lastMergeUsed\) \{[\s\S]{0,200}'lrecon\+opresent'[\s\S]{0,300}\} else \{\s*\n\s*this\._markPath\('lrecon'\);\s*\n\s*if \(skyPend\) this\.presentPendingSky\(skyPend, viewW, viewH\);/);
    expect(RDR).toMatch(/if \(wc\.lastMergeUsed\) \{[\s\S]{0,200}'a2\+opresent'[\s\S]{0,300}\} else \{\s*\n\s*this\._markPath\('a2'\);\s*\n\s*if \(skyPend\) this\.presentPendingSky\(skyPend, viewW, viewH\);/);
    // A2 块出口（旧链回落前）补贴——旧链自产回贴群画在天空栈之上=层序保持
    expect(RDR).toMatch(/★opresent:A2 未走成（wc 缺\/compose 失败）——补贴天空栈再落旧链\/读回链[\s\S]{0,120}if \(skyPend\) this\.presentPendingSky\(skyPend, viewW, viewH\);/);
  });

  it('fullbright 支补贴（防运行时翻面竞态漏挂起）;补贴面=presentPendingSky（★R1-F9:死亡帧 dead-drop 显式丢弃）', () => {
    expect(RDR).toMatch(/if \(this\.fullbright\) \{ \/\/ 开灯：不做 multiply，全部原色（世界层仍须叠回主画布）\s*\n\s*\/\/ ★opresent:defer 帧补贴（门已挡 fullbright——防运行时翻面竞态漏挂起）\s*\n\s*if \(skyPend\) this\.presentPendingSky\(skyPend, viewW, viewH\);/);
    expect(RDR).toMatch(/private presentPendingSky\(sky: \{ fboName: string; w: number; h: number \}, viewW: number, viewH: number\): void \{\s*\n\s*const pipe = this\.swPipe;\s*\n\s*if \(!pipe \|\| pipe\.unavailable\) \{\s*\n\s*this\.opresentStats\['dead-drop'\] = \(this\.opresentStats\['dead-drop'\] \|\| 0\) \+ 1;\s*\n\s*return;\s*\n\s*\}\s*\n\s*const f = pipe\.fbo\(sky\.fboName, sky\.w, sky\.h\);\s*\n\s*if \(f\?\.tex\) \{\s*\n\s*pipe\.present\(f\);\s*\n\s*this\.ctx\.drawImage\(pipe\.canvas, 0, 0, viewW, viewH\);/);
  });
});

describe('opresent 周边结构保留', () => {
  it('GLPipeline A0 面零改动（pass3 复用 present/drawQuad/fbo 门面,不另起炉灶）', () => {
    expect(PIPE).toContain('present(src: PipelineFbo)');
    expect(PIPE).toContain('drawQuad(p: PipelineProgram, uDst: [number, number, number, number], flipY = 1)');
    expect(RDR).not.toContain('this.swPipe.recreate()');
  });

  it('双 present 消费点=compose 唯一出口（不产生第三处全屏回贴;obj19/obj62 字节码零触碰）', () => {
    // compose 内 present 调用恰两处（opresent 支+回退支）
    expect(COMP.match(/pipeline\.present\(/g)?.length).toBe(2);
    // 扭曲 FRAG 未被本刀触碰（uScene 仍采 lit——禁改 obj19 扭曲语义）
    expect(COMP).toContain("this.pDistort = this.pipeline.program('distort', GLWaterDistortion.VERT, GLWaterDistortion.FRAG);");
  });
});
