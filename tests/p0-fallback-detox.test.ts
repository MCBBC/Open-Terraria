// ★P0 回退路径去毒 行为锁（2026-09-25）。
// 判例背景（trace 2026-09-25 用户实机定谳）:GL 世界路径未介入的会话里,页画布/
// worldCanvas 的 WRF（CPU/SHM 背板）旗耦合把 2D 回退路径整体毒化（单 op 7-12×）,
// 渲染帧 5.1→26.7ms。本役三刀:①页画布恒 GPU 后备（WRF 旗耦合废除）;②worldCanvas
// 恒 GPU 后备;③A3 闩（rawBroken/lreconDead）预检收口（废 A3 不废 A2 整链）。
// 像素/性能面 = scripts/_p0-fallback-ledger.mjs 探针（A 判别器/C 闩指纹/D 帧耗
// 对照/F 克隆池,浏览器内）;本文件锁 node 可跑的行为面与源码锚。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLWorldCompose } from '../src/render/GLWorldCompose';

const RDR = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const COMP = readFileSync(join(__dirname, '../src/render/GLWorldCompose.ts'), 'utf8');
const WXR = readFileSync(join(__dirname, '../src/render/WeatherRenderer.ts'), 'utf8');

describe('P0 刀② worldCanvas 恒 GPU 后备（源码锚）', () => {
  it('两创建点（beginWorldLayer/degradeAcc）均无 WRF;负锁 worldCanvas 建面 WRF 复辟', () => {
    // 正锁:两创建点 getContext('2d') 无 WRF 参
    expect(RDR).toContain("this.worldCanvas = document.createElement('canvas');");
    expect(RDR).not.toContain("this.worldCanvas.getContext('2d', { willReadFrequently: true })");
    // 去毒注记在场（考古面）
    expect(RDR).toContain('★P0 去毒');
  });
});

describe('P0 刀③ A3 闩预检 lreconUsable（行为锁;原型实例+手工字段——GLPipeline 需 DOM,绕构造器判例 bj316）', () => {
  /** 绕开构造器（GLPipeline 需真实 DOM/WebGL）——原型实例+手工字段 */
  function makeWC(): { wc: GLWorldCompose; a: Record<string, unknown> } {
    const wc = Object.create(GLWorldCompose.prototype) as GLWorldCompose;
    const a = wc as unknown as Record<string, unknown>;
    a._rawBroken = false;
    a.lreconDead = false;
    a.pRecon = { name: 'lrecon', prog: {}, private_: { uniCache: new Map() } };
    a.lastFail = '';
    return { wc, a };
  }
  it('健康位:lreconUsable=true（rawBroken/lreconDead/程序全就绪）', () => {
    const { wc } = makeWC();
    expect(wc.lreconUsable()).toBe(true);
    expect(wc.lastFail).toBe('');   // 成功路不写 lastFail（保首因）
  });
  it('lreconDead（程序编译死位）:false 且 lastFail=guard:lreconDead', () => {
    const { wc, a } = makeWC();
    a.lreconDead = true;
    expect(wc.lreconUsable()).toBe(false);
    expect(wc.lastFail).toBe('guard:lreconDead');
  });
  it('rawBroken 闩位优先于 lreconDead（lastFail 同串 compose guard,归因连续）', () => {
    const { wc, a } = makeWC();
    a._rawBroken = true;
    a.lreconDead = true;
    expect(wc.lreconUsable()).toBe(false);
    expect(wc.lastFail).toBe('guard:rawBroken');
  });
  it('预检真值面与 compose 内 guard 单一事实源（同布尔组合,防御位保留）', () => {
    // guard 早退行仍存在（防御位——调用方漏检/运行中置位的当帧兜底）
    expect(COMP).toContain("if (rawLight && (this._rawBroken || this.lreconDead || !this.pRecon?.prog)) {");
    // 预检方法与 guard 同序:rawBroken 先判
    const usable = COMP.indexOf('lreconUsable(): boolean {');
    const body = COMP.slice(usable, usable + 400);
    expect(body.indexOf('_rawBroken')).toBeLessThan(body.indexOf('lreconDead'));
  });
  it('recreate 重开体检窗时 _rawBroken 闩同步复位（新上下文 RGBA8UI 可接受;拒绝则窗内再检再闩）', () => {
    // 回归哨兵:重审窗复位而闩残留 = 重审死代码,A3 永久熄火（P0 前实态）
    const rec = COMP.slice(COMP.indexOf('recreate(): boolean {'), COMP.indexOf('dispose(): void {'));
    expect(rec).toContain('this._rawAuditLeft = 3;');
    expect(rec).toContain('this._rawBroken = false;');
  });
  it('Renderer lrecon 分支预检接线:skip 路径账+lastFail 归因面', () => {
    expect(RDR).toContain('if (wcL && !wcL.lreconUsable()) {');
    expect(RDR).toContain("this._markPath('lrecon-skip:' + (wcL.lastFail || '?'));");
    // skip 与 fail 同账面（composeLastFail 归因连续）
    expect(RDR).toContain("p.startsWith('lrecon-fail') || p.startsWith('lrecon-skip')");
  });
});

describe('P0 刀④ 雨 miss 克隆池（结构锁;闭环行为=探针 F 臂）', () => {
  it('takeClone/giveClone 池闭环在 bakeMemoized 接线（淘汰回池+miss 取池）', () => {
    expect(WXR).toContain('private takeClone(w: number, h: number): HTMLCanvasElement {');
    expect(WXR).toContain('private giveClone(c: HTMLCanvasElement): void {');
    expect(WXR).toContain('const own = this.takeClone(baked.width, baked.height);');
    expect(WXR).toContain('if (ev) this.giveClone(ev);');
    // 复用条目清陈旧内容（含 α）=全新画布语义
    expect(WXR).toContain('octx.clearRect(0, 0, own.width, own.height);');
    // 病态面不入池（width=0 已释放）
    expect(WXR).toContain('if (c.width <= 0 || c.height <= 0) return;');
  });
});
