// ★C10a 云会话迁入 GLPipeline 单上下文——源码纪律锁（2026-09-24）
//
// 一期范围：GLSpriteLayer 获「GLPipeline 后端」模式（?cloudpipe=1 缺省关灰度）；
// 云 quads 渲进管线 FBO('clouds')→present→cloudBlitRect bbox 子矩形 blit 结构照旧；
// glfx 其它消费方（群系背景/全屏地图/拖尾）行为零变化。
// 运行时 GL 行为（像素等价）由 scripts/_c10a-cloud-ab.mjs 页内翻面对拍兜底——
// 本文件锁「接线不漂移」：旗缺省关/程序单源登记/FBO 面归管线/blit 结构保留/
// 采样器同参/审计窗/释放纪律。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(resolve(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');
const RDR = readFileSync(resolve(__dirname, '../src/render/Renderer.ts'), 'utf8');
const SKY = readFileSync(resolve(__dirname, '../src/render/SkyRenderer.ts'), 'utf8');
const PIPE = readFileSync(resolve(__dirname, '../src/render/GLPipeline.ts'), 'utf8');

describe('C10a 旗面与接线（缺省关=旧 glfx 会话）', () => {
  it('?cloudpipe 缺省关（灰度;===\'1\' 显式激活）,逃生门=回旧 glfx 共享会话', () => {
    expect(RDR).toContain("get('cloudpipe') === '1'");
    expect(RDR).toMatch(/_cloudPipe = \(\(\) => \{[\s\S]{0,200}cloudpipe[\s\S]{0,120}=== '1'/);
  });

  it('注入点分支:cloudpipe 开=acquireCloudPipe;关=acquireGL(旧会话);useGLClouds/cpuRender 总门一致', () => {
    expect(RDR).toMatch(/Renderer\.cloudPipe \? this\.acquireCloudPipe\(\) : this\.acquireGL\(\)/);
    // 总门在分支外（!this.cpuRender && this.sky.useGLClouds 先判——两路同门）
    expect(RDR).toMatch(/!this\.cpuRender && this\.sky\.useGLClouds\s*\n\s*\? \(Renderer\.cloudPipe/);
  });

  it('仪器面:cloudPathUsed/cloudPathStats(composePathUsed 同款探针读面)', () => {
    expect(RDR).toContain('cloudPathUsed');
    expect(RDR).toContain('cloudPathStats');
    expect(RDR).toContain("'cloudpipe' : 'glfx'");
  });

  it('释放面三挂点齐:熔断/CPU 切换/销毁链 dropCloudPipe', () => {
    expect(RDR.match(/this\.dropCloudPipe\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});

describe('C10a GLSpriteLayer 管线后端', () => {
  it('工厂 createPipelineBacked:管线+层 1:1;worker 判死(document 存在性——fork bomb 判例)', () => {
    expect(SRC).toContain('static createPipelineBacked(statName: string): GLSpriteLayer | null');
    expect(SRC).toMatch(/createPipelineBacked[\s\S]{0,200}typeof document === 'undefined'[\s\S]{0,100}return null/);
  });

  it('程序登记进管线 program 表(sprite:quad/sprite:cloud);uniform 经 pipe.uni——与旧路径同名同表', () => {
    expect(SRC).toContain("pipe.program('sprite:quad', VERT_SRC, FRAG_SRC)");
    expect(SRC).toContain("pipe.program('sprite:cloud', CLOUD_VERT_SRC, CLOUD_FRAG_SRC)");
    expect(SRC).toContain("pipe.uni(pQuad, n)");
    expect(SRC).toContain("pipe.uni(pCloud, n)");
    // uniform 表逐式对照旧 init(两条路径同表)
    expect(SRC).toContain("['uCanvas', 'uSrc', 'uDst', 'uRot', 'uTex', 'uAlpha', 'uTint']");
    expect(SRC).toContain("['uCanvas', 'uSrc', 'uDst', 'uRot', 'uTex', 'uVertColor', 'uCelestialCol', 'uDrawPos', 'uCelestial']");
  });

  it('★着色器单源:obj62 字节码锚式全文件唯一(管线模式复用同常量,禁转录漂移)', () => {
    // HorizonClouds 覆盖率公式(:2950-2954)+厚度公式(:2955-2957)各恰一次
    expect(SRC.match(/float coverage = 1\.0 - 0\.2 \* \(up\.a \+ dn\.a \+ lf\.a \+ rt\.a \+ cc\.a\)/g)?.length).toBe(1);
    expect(SRC.match(/float thickness = 1\.0 - 4\.0 \* clamp\(cc\.r - 0\.62, 0\.0, 1\.0\)/g)?.length).toBe(1);
    // 基础 quad y 翻转行:恰两处=VERT_SRC+CLOUD_VERT_SRC 两个着色器常量各一
    // (既有结构;管线模式复用同常量——出现第 3 处即转录漂移)
    expect(SRC.match(/1\.0 - screen\.y \/ uCanvas\.y \* 2\.0/g)?.length).toBe(2);
  });

  it('quads 渲进管线 FBO(\'clouds\');begin 显式重建会话态(blend premul+depth off);end present', () => {
    expect(SRC).toContain("this.pipe.fbo('clouds', w, h)");
    expect(SRC).toContain('this.pipe.bindTarget(f)');
    expect(SRC).toContain('this.pipe.present(this.pipeFbo)');
    // 会话态逐帧显式（present 离场留 blend off——谁设谁还原判例）
    expect(SRC).toMatch(/pipe\) \{[\s\S]{0,1600}gl\.blendFunc\(gl\.ONE, gl\.ONE_MINUS_SRC_ALPHA\)/);
    expect(SRC).toContain('this.pipe.beginFrame(w, h)');   // resize=帧界同步
  });

  it('★BJ316 判例 getError 审计窗:首 3 次+尺寸首见;先排空;错误→unavailable 走 2D 兜底', () => {
    expect(SRC).toContain('pipeAuditLeft = 3');
    expect(SRC).toMatch(/while \(gl\.getError\(\) !== gl\.NO_ERROR\)/);
    expect(SRC).toMatch(/audit && gl\.getError\(\) !== gl\.NO_ERROR/);
  });

  it('拖尾不迁:ensureTrail/ensureTrailMM 管线模式恒 false(旧 glfx 上下文独占承载)', () => {
    expect(SRC).toMatch(/private ensureTrail\(\): boolean \{\s*\n\s*if \(this\.pipe\) return false;/);
    expect(SRC).toMatch(/private ensureTrailMM\(\): boolean \{\s*\n\s*if \(this\.pipe\) return false;/);
  });

  it('释放纪律:disposePipeMode 删自管对象(纹理/VAO/采样器);程序禁单删(program 表按名缓存);管线随层 dispose', () => {
    const body = SRC.split('private disposePipeMode')[1] ?? '';
    expect(body).toContain('gl.deleteTexture(e.tex)');
    expect(body).toContain('gl.deleteVertexArray(this.vao)');
    expect(body).toContain('gl.deleteSampler(s)');
    expect(body).not.toContain('deleteProgram');
    expect(body).toContain('this.pipe?.dispose()');
    expect(body).toContain('glStatDelete(this.statName, freed)');
  });

  it('GLStats 记账随上下文归属:statName=pipe.statName(云纹理/上传落 cloudpipe 账页)', () => {
    expect(SRC).toContain('this.statName = pipe.statName;');
  });

  it('旧上下文路径零漂移:init 自建上下文/预乘上传/字节预算原样(gl-layer-regression 同域)', () => {
    expect(SRC).toContain("this.canvas.getContext('webgl2'");
    expect(SRC).toMatch(/dispose\(\): void \{\s*\n\s*if \(this\.pipe\) \{ this\.disposePipeMode\(\); return; \}/);
  });
});

describe('C10a 周边结构保留', () => {
  it('cloudBlitRect 结构照旧:bbox 子矩形 drawImage(layer.canvas)——一期不改 blit 合并', () => {
    expect(SKY).toContain('ctx.drawImage(layer.canvas, sx, sy, sw, sh, sx, sy, sw, sh)');
    expect(SKY).toContain('ctx.drawImage(layer.canvas, 0, 0)');   // ?cloudcache=0 全幅逃生门
  });

  it('SkyRenderer 云提交面零改动:cloudQuad/quad/texFromImage 调用点原样(后端透明)', () => {
    expect(SKY).toContain('gl.cloudQuad(gtex, 0, 0, gtex.w, gtex.h, c.x, yOf(c), w, h, c.rot, !!c.flip, {');
    expect(SKY).toContain("gl.texFromImage(`cloud:${c.type}`, tex)");
  });

  it('GLPipeline 零改动(A0 面原样——FBO RGBA8/present flipY/字节账)', () => {
    expect(PIPE).toContain('gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null');
    expect(PIPE).toContain('present(src: PipelineFbo)');
  });
});
