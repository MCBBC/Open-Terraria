// ★A1 screenFx 滤镜链入管线——结构纪律锁（2026-09-25,渲染 v2 路线图收割刀）
//
// GLScreenFilters 多 pass 链从「GL→2D→GL 乒乓、每 pass 全帧重传」迁入共管
// GLPipeline：FBO('sfxA'/'sfxB') 乒乓直采+末 pass present 单次回贴。本文件锁：
//   ①旗面（?sfxgl 转正缺省开,=0 回旧乒乓链,运行时可翻）
//   ②管线链结构（FBO 租名/程序命名空间/no-flip 变体/预乘显式+还原/指纹重生检测）
//   ③逃生门双路（管线失败自动落旧 drawChain,旧链体原样保留）
//   ④uniform 转录哨兵（禁改滤镜数学——血月 tint/墓地灰化/热扭曲噪声场全值）
// 运行时像素等价由 scripts/_sfxgl-ab.mjs 页内翻面对拍兜底（pass 链全清单×昼夜×
// zoom 逐字节 census）;本文件=源文本纪律锁。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RDR = readFileSync(resolve(__dirname, '../src/render/Renderer.ts'), 'utf8');
const SFX = readFileSync(resolve(__dirname, '../src/render/GLScreenFilters.ts'), 'utf8');
const PIPE = readFileSync(resolve(__dirname, '../src/render/GLPipeline.ts'), 'utf8');
const REP = readFileSync(resolve(__dirname, '../src/debug/DebugReport.ts'), 'utf8');
const A0 = readFileSync(resolve(__dirname, './a0-glpipeline-shell.test.ts'), 'utf8');

describe('A1 旗面', () => {
  it('?sfxgl 转正缺省开（对拍 ALL PASS 逐字节后翻缺省）,?sfxgl=0=回旧乒乓链逃生门;运行时可翻', () => {
    expect(RDR).toContain("get('sfxgl') !== '0'");
    expect(RDR).toContain('static get sfxPipe()');
    expect(RDR).toContain('static sfxPipeSetForTest(v: boolean): void');
  });

  it('GL 后端总门恒开（sfxgl=0 语义收编为回旧链,非关 GL;2D 仅剩自动回退/CPU 路径）', () => {
    expect(RDR).toMatch(/private screenFxEnabled = true;/);
    expect(RDR).not.toContain("get('sfxgl') !== '0'; }\n    catch { return false; }\n  })();\n  /** 同 worldLightLayer");
  });

  it('诊断面:sfxPathUsed/sfxPathStats（pipe/pingpong/2d/-）;DebugReport 独立块', () => {
    expect(RDR).toContain("sfxPathUsed = '-';");
    expect(RDR).toContain("sfxPathStats['pipe']");
    expect(RDR).toContain("sfxPathStats['pingpong']");
    expect(RDR).toContain("sfxPathStats['2d']");
    expect(REP).toMatch(/sfx: \{\s*\n\s*used: g\.renderer\?\.sfxPathUsed \?\? null,\s*\n\s*stats: g\.renderer\?\.sfxPathStats \?\? null,\s*\n\s*\}/);
  });
});

describe('A1 管线链结构（GLScreenFilters）', () => {
  it('FBO 租名 sfxA/sfxB（不撞 clouds/bg/lit/warped/light2/world/opresent 命名空间）', () => {
    expect(SFX).toContain("pipe.fbo('sfxA', w, h)");
    expect(SFX).toContain("pipe.fbo('sfxB', w, h)");
  });

  it('程序命名空间 sfxF:<kind>/sfx:flip（pipe.program 按名幂等,不撞 sprite:/worldLight/distort/lrecon/opresent）', () => {
    expect(SFX).toContain("pipe.program(`sfxF:${kind}`, VERT, FRAGS[kind])");
  });

  it('★全 pass=原版 VERT 编译单元（sfxF: 前缀,与旧链逐字同源——二版定谳:变体链接单元在 8bit 舍入边界 ±1 编译差）', () => {
    // 原版 VERT 单源（禁派生变体——'I:' 变体单元曾产 heat 中间产物单 texel ±1）
    expect(SFX).toContain("h = pipe.program(`sfxF:${kind}`, VERT, FRAGS[kind]);");
    expect(SFX).not.toContain('VERT_SFX_FBO');
    expect(SFX).not.toContain("VERT.replace(");
  });

  it('非末 pass 朝向归还=逐 pass 直通 blit（FRAG_PASSTHRU 零算术;末 pass 直 present）', () => {
    expect(SFX).toContain("h = pipe.program('sfx:flip', VERT, FRAG_PASSTHRU);");
    expect(SFX).toContain('gl_FragColor = texture2D(uTex, vUv);');
    expect(SFX).toMatch(/if \(last\) break;\s*\n\s*\/\/ 非末 pass:直通 blit A\(GL 朝向\)→B\(恒等布局\)喂下级（纯位搬运零舍入）/);
    expect(SFX).toContain('pipe.present(fboA);');
    expect(SFX).toContain('pipe.drawQuad(entry, [0, 0, w, h], 0)');
  });

  it('预乘显式翻回+链尾还原（源上传 false;finally 还原 true——GLPipeline.uploadCanvas 缺省收口防渗漏）', () => {
    expect(SFX).toContain('gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);   // 旧链未设=缺省 false 直拷');
    expect(SFX).toMatch(/finally \{\s*\n\s*\/\/ 预乘态还原（GLPipeline\.uploadCanvas 依赖 init 收口缺省 true——防跨消费方渗漏）\s*\n\s*gl\.pixelStorei\(gl\.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true\);/);
  });

  it('上下文指纹重生检测（pipeGlId 不符弃表重建——reviveSwPipe 整换实例路径）', () => {
    expect(SFX).toMatch(/if \(this\.pipeGlId !== gl\) \{ this\.pipeDrop\(\); this\.pipeGlId = gl; \}/);
  });

  it('独立上下文惰性建（构造不 init;drawChain 首用 ensureStandalone——管线模式 IOSurface 净−1）', () => {
    expect(SFX).toMatch(/constructor\(\) \{[^]*?★A1:独立上下文惰性建[^]*?\}/);
    expect(SFX).toContain('ensureStandalone(): boolean {');
    expect(SFX).toMatch(/drawChain\(source: HTMLCanvasElement, passes: readonly ScreenFxPass\[\],\s*\n\s*tint: readonly \[number, number, number\]\): boolean \{\s*\n\s*if \(!this\.ensureStandalone\(\)\) return false;/);
  });

  it('噪声依赖过滤逐式转录（Noir/Sepia 未就绪剔 pass;Misc 未就绪只剔 Heat/Vortex;空链返 false）', () => {
    // 旧链与管线链两份同式（单源转录,漂移即对拍爆红）
    expect(SFX.match(/chain = chain\.filter\(\(p\) => p\.kind !== 'FilterHeatDistortion' && p\.kind !== 'FilterCrystalDestructionVortex'\);/g)?.length ?? 0).toBe(1);
    expect(SFX.match(/passes = passes\.filter\(\(p\) => p\.kind !== 'FilterHeatDistortion' && p\.kind !== 'FilterCrystalDestructionVortex'\);/g)?.length ?? 0).toBe(1);
  });

  it('blend 逐 pass setBlend(off)（管线多消费方共享,不沿旧链 init 一次关）', () => {
    expect(SFX).toContain("pipe.setBlend('off');");
  });
});

describe('A1 uniform 转录哨兵（禁改滤镜数学——与旧链逐式对照）', () => {
  it('Heat:uNoiseRcp=1/pipeNoise 值域+uOffset=(I·O)/res+uTimeScroll=0.04·t', () => {
    expect(SFX).toContain("gl.uniform2f(pipe.uni(entry, 'uNoiseRcp'), 1 / this.pipeNoiseW, 1 / this.pipeNoiseH);");
    expect(SFX).toContain("gl.uniform2f(pipe.uni(entry, 'uOffset'), s / p.screenRes[0], s / p.screenRes[1]);");
    expect(SFX).toContain("gl.uniform1f(pipe.uni(entry, 'uTimeScroll'), 0.04 * p.time);");
  });

  it('Vortex:uTimeScroll=-2.5·t（preshader lit16）;Tower:targetPx/screenRes/screenPos 全表', () => {
    expect(SFX).toContain("gl.uniform1f(pipe.uni(entry, 'uTimeScroll'), -2.5 * p.time);");
    expect(SFX).toContain("gl.uniform2f(pipe.uni(entry, 'uTargetPx'), p.targetPx[0], p.targetPx[1]);");
  });

  it('Sepia:uRes=(w,h)+DSTNoise unit1;Noir:NoirNoise unit1;uTint 逐 pass 透传', () => {
    expect(SFX).toContain("gl.uniform2f(pipe.uni(entry, 'uRes'), w, h);");
    expect(SFX).toContain("gl.bindTexture(gl.TEXTURE_2D, this.pipeKindTex['DSTNoise']!);");
    expect(SFX).toContain("gl.bindTexture(gl.TEXTURE_2D, this.pipeKindTex['NoirNoise']!);");
    expect(SFX).toContain("gl.uniform3f(pipe.uni(entry, 'uTint'), tint[0], tint[1], tint[2]);");
  });

  it('FRAGS 单源零改动（13 pass 片元表原样——滤镜数学只此一份）', () => {
    expect(SFX).toContain('FilterBloodMoon: FRAG_BLOODMOON,');
    expect(SFX).toContain('FilterGraveyard: FRAG_GRAVEYARD,');
    expect(SFX).toContain('SkyWeatherTint: FRAG_SKY_TINT,');
    expect(SFX).toContain('FilterCrystalDestructionVortex: FRAG_CRYSTAL_VORTEX,');
  });
});

describe('A1 逃生门双路（Renderer.drawScreenFilterChain）', () => {
  it('管线链先行（sfxPipe 旗×wK===1 低清档门）,失败/旗关落旧 drawChain——次序锁定;★K1/K1-2 链源三档（c10ek1=0=折叠 scratch/xform 合成帧=HUD 直取/其余 c10e 帧=屏栈 Stack 变体/防御窗=折叠）', () => {
    expect(RDR).toMatch(/if \(Renderer\.sfxPipe && this\._worldLowK === 1\) \{\s*\n\s*const pipe = this\.acquireSwPipe\(\);\s*\n\s*if \(pipe && !pipe\.unavailable\) \{\s*\n\s*\/\/ ★K1\/K1-2[\s\S]{0,900}if \(!Renderer\.c10eK1\) \{\s*\n\s*chainOk = gl\.drawChainPipe\(pipe, this\.c10eChainSource\(\), passes,/);
    expect(RDR).toMatch(/\} else if \(this\._c10eFrame && this\._c10eComposited\) \{\s*\n\s*chainOk = gl\.drawChainPipe\(pipe, this\.canvas, passes,/);
    expect(RDR).toMatch(/let stackPath = false;[\s\S]{0,1200}\} else if \(this\._c10eFrame && this\.skyCanvas && pipe\.screenStackMode\) \{\s*\n\s*stackPath = true;\s*\n\s*chainOk = gl\.drawChainPipeStack\(pipe, \{ sky: this\.skyCanvas, hud: this\.canvas, useHud: true \}, passes,/);
    expect(RDR).toMatch(/if \(chainOk\) \{\s*\n\s*ctx\.drawImage\(pipe\.canvas, 0, 0\);\s*\n\s*if \(stackPath\) \{\s*\n\s*this\.sfxPathUsed = 'pipe-stack';\s*\n\s*this\.sfxPathStats\['pipe-stack'\] = \(this\.sfxPathStats\['pipe-stack'\] \|\| 0\) \+ 1;\s*\n\s*\} else \{\s*\n\s*this\.sfxPathUsed = 'pipe';\s*\n\s*this\.sfxPathStats\['pipe'\] = \(this\.sfxPathStats\['pipe'\] \|\| 0\) \+ 1;\s*\n\s*\}\s*\n\s*\}/);
    expect(RDR).toMatch(/\} else \{\s*\n\s*\/\/ 非分体帧（拍照\/CPU\/低清上游已滤）与防御窗（sky 缺\/栈关\/管线帧中\s*\n\s*\/\/ 暴毙）=折叠 scratch 原路径[\s\S]{0,200}chainOk = gl\.drawChainPipe\(pipe, this\.c10eChainSource\(\), passes,/);
    expect(RDR).toMatch(/if \(!chainOk && gl\.drawChain\(this\.c10eChainSource\(\), passes,/);
    // 旧链体原样保留（逃生路径零改动——staging 乒乓仍在）
    expect(SFX).toContain('sctx.drawImage(this.canvas, 0, 0);');
  });

  it('moonLord 2D 补画双路径共用（链成功后直叠,次序同原版 EndCapture 链表）', () => {
    expect(RDR).toMatch(/if \(chainOk\) \{\s*\n\s*\/\/ moonLord 族补画（无像素读取，GL 链结果上直叠——VeryHigh 序在 Medium\s*\n\s*\/\/ 柱族之后即补画在后，次序同原版 EndCapture 链表）\s*\n\s*const core4 = this\._moonLordFilterTarget\(this\._frameEntities\);/);
  });

  it('无滤镜帧早退诊断面（sfxPathUsed=\'-\'）;2D 回退面标记（\'2d\'）', () => {
    expect(RDR).toMatch(/if \(!mono\.anyInUse && !mono\.heatInUse && shakeI <= 0 && !towVisible\) \{ this\.sfxPathUsed = '-'; return; \}/);
    expect(RDR).toMatch(/this\.sfxPathUsed = '2d';\s*\n\s*this\.sfxPathStats\['2d'\]/);
  });

  it('管线程序预热挂点（prewarmGameGL 载入页窗——旧链「上下文+编译」预热契约承接）', () => {
    expect(RDR).toMatch(/if \(Renderer\.sfxPipe\) \{\s*\n\s*try \{\s*\n\s*const pipeSfx = this\.swPipe \?\? this\.acquireSwPipe\(\);\s*\n\s*if \(pipeSfx && !pipeSfx\.unavailable\) this\.screenFx\?\.prewarmPipe\(pipeSfx\);/);
    expect(SFX).toContain('prewarmPipe(pipe: GLPipeline): void {');
  });
});

describe('A1 A0 壳锁联动', () => {
  it('消费方白名单已收录 GLScreenFilters（第五消费方;A0 锁面同步演化）', () => {
    expect(A0).toContain("'GLScreenFilters.ts'");
  });

  it('GLPipeline 门面复用面（fbo/program/bindTarget/setBlend/drawQuad/present/beginFrame/uni 不另起炉灶;★K1-2 增 presentTexTo/screenStackView 最小暴露面）', () => {
    expect(PIPE).toContain('fbo(name: string, w: number, h: number)');
    expect(PIPE).toContain('present(src: PipelineFbo, over = false)');   // ★C10e:over 缺省参
    expect(PIPE).toContain('presentTexTo(target: PipelineFbo | null, tex: WebGLTexture, over: boolean, flipY: number): void');
    expect(PIPE).toContain('get screenStackView(): readonly PipelineFbo[]');
    expect(SFX).toContain('pipe.beginFrame(w, h);');
    expect(SFX).toContain('pipe.bindTarget(outFbo);');
    expect(SFX).toContain('pipe.bindTarget(to);');   // ★K1-2:直通 blit 抽取 pipeFlipTo（from→to）
  });
});
