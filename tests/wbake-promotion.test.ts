// ★wbake 转正批锁（2026-09-28 用户拍板「可以转正」+渲染期待保护令）。
// 三面：
//  ① 旗面翻转：WBAKE_ENABLED 缺省【开】,?wbake=0 逃生门显式关,node/测试环境恒关
//     判死（行为锁——BakeClient 直 import,无 location 必 false）;
//  ② 入场渲染期待冻结窗：开窗门 / 冻结帧最小面（跳过 fixedUpdate 整段+acc 丢弃+
//     wheel 重锚）/ animView 先置后查（视域未置恒 covered 陷阱）/ tickLighting
//     单源双消费（光照不冻,掀幕已照亮）/ 解除三路同源+双 LightTiles 保险 /
//     计费沿（onEntryFreeze → play.pause/resume）——Game/mainFlow 源锚;
//  ③ 加载步骤键 Mods.SandboxWorld.Progress.RenderingWorld：12 语系 custom 源 +
//     zh-Hans/en-US 构建产物（l10n-audit 同域）。
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// ★C档可移植:l10n 源目录(仓库外 tools/l10n-custom,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['tools/l10n-custom'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAME = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
const MAINFLOW = readFileSync(join(ROOT, 'src/mainFlow.ts'), 'utf8');
const CLIENT = readFileSync(join(ROOT, 'src/workers/BakeClient.ts'), 'utf8');

describe.skipIf(EXT_MISSING)('wbake 转正①：旗面翻转（缺省开+逃生门+node 判死）', () => {
  it('行为锁：node 无 location → WBAKE_ENABLED 恒 false（判死）', async () => {
    // ★超时宽限（2026-10-01）：动态导入=BakeClient 全图（ChunkCache→VanillaTiler→
    //  渲染面族,transform 实测 6-8s 且随导入图增重漂移）——5s 缺省超时伪红
    //  （vitest 超时伪红判例;导入图重量=结构债另册）
    const m = await import('../src/workers/BakeClient');
    expect(m.WBAKE_ENABLED).toBe(false);
  }, 120_000);

  it('源锚：缺省开 `flag !== \'0\'`;?wbake=0 逃生门;node 判死分支', () => {
    expect(CLIENT).toContain("return flag !== '0';");
    expect(CLIENT).toContain("if (typeof location === 'undefined') return false;");
    expect(CLIENT).toContain('★wbake 转正');
  });

  it('旗关链路完整：Game 装配/幕布覆盖门/冻结窗三站全部 WBAKE_ENABLED 门', () => {
    expect(GAME).toContain('if (WBAKE_ENABLED) {');
    expect(GAME).toContain('if (!WBAKE_ENABLED) return Promise.resolve();');
    expect(GAME).toContain('if (!WBAKE_ENABLED) return false;');
  });
});

describe.skipIf(EXT_MISSING)('wbake 转正②：入场渲染期待冻结窗（世界时间对该玩家暂停）', () => {
  it('开窗门：旗∧world∧chunks∧bakeClient——worker 降级（bakeClient=null）不开窗=零变化', () => {
    expect(GAME).toContain('beginEntryFreeze(timeoutMs = 3000): boolean {');
    expect(GAME).toContain('if (!this.world || !this.chunks || !this.chunks.bakeClient) return false;');
  });

  it('冻结帧最小面：fixedUpdate 累计器整段跳过+acc 丢弃（解冻零补步）+wheel 重锚（FX51 同款）', () => {
    expect(GAME).toContain('if (this._entryFreeze) {');
    expect(GAME).toContain('this.acc = 0;');
    expect(GAME).toContain('this.input.resetWheelAccumulators();');
    expect(GAME).toContain('this.entryFreezeTick();');
  });

  it('冻结帧自维护：animView 先置后查（视域未置恒 covered=幕布提前掀病灶陷阱）+tickLighting 照跑', () => {
    const at = GAME.indexOf('private entryFreezeTick');
    const tick = GAME.slice(at, at + 1400);
    expect(tick).toContain('cc.animView =');
    expect(tick.indexOf('cc.animView')).toBeGreaterThan(-1);
    expect(tick.indexOf('viewportCovered()')).toBeGreaterThan(tick.indexOf('cc.animView'));
    expect(tick).toContain('this.tickLighting(viewTW, viewTH);');
    expect(tick).not.toContain('advanceAnim');   // tileAnim.tick 冻结（烘焙钟自洽）
  });

  it('光照单源：tickLighting 三消费点（fixedUpdate 原位+冻结帧+★C10g 传送幕帘帧 2026-10-01）,方法体含 ensureRegion/衰减/compute', () => {
    expect(GAME).toContain('private tickLighting(viewTW: number, viewTH: number): void {');
    // ★C10g:传送幕帘帧面 tpVeilTick 增第三消费点（不 render=保持上帧,光照须在
    //  幕帘窗内算到揭幕即用;锚随盘刷新判例——2→3）
    expect(GAME.match(/this\.tickLighting\(viewTW, viewTH\);/g)?.length).toBe(3);
    const at = GAME.indexOf('private tickLighting');
    const method = GAME.slice(at, GAME.indexOf('this.lighting.compute(w.clock.dayFactor);', at) + 80);
    expect(method).toContain('this.lighting.ensureRegion(');
    expect(method).toContain('updateLightDecay(');
    expect(method).toContain('this.lighting.heldLight');
    expect(method).toContain('this.lighting.compute(w.clock.dayFactor);');
  });

  it('解除三路同源 endEntryFreeze：covered 终态（armAt 起测帧防首帧空账陷阱）∨deadline 保险;解除置 dirty=双 LightTiles', () => {
    expect(GAME).toContain('|| (this._paintedFrames >= fz.armAt && cc.viewportCovered())) this.endEntryFreeze();');
    expect(GAME).toContain('armAt: this._paintedFrames + 4');
    expect(GAME).toContain('performance.now() >= fz.deadline');
    const at = GAME.indexOf('endEntryFreeze(): void {');
    const body = GAME.slice(at, at + 300);
    expect(body).toContain('this.lighting.dirty = true;');
    expect(body).toContain('this.cb.onEntryFreeze?.(false);');
  });

  it('mainFlow：开窗即把「正在渲染世界」步骤挂上加载页步骤行（★2026-09-29 用户令归位——不再另出 DOM 遮罩）;幕布 race 兜底先解冻再掀幕（源锚）', () => {
    expect(MAINFLOW).toContain('if (g.beginEntryFreeze(3000)) {');
    expect(MAINFLOW).toContain("Lang.text('Mods.SandboxWorld.Progress.RenderingWorld')");
    // ★新形态锁（步骤归位+HUD 抑制专锁文件 tests/wbake-curtain-step-hud.test.ts）：
    //   步骤走 VUI 加载页 showRenderStep,旧 .sw-progress 全屏遮罩形态判死
    expect(MAINFLOW).toContain('load instanceof UIWorldLoadState');
    expect(MAINFLOW).toContain('load.showRenderStep(renderStep)');
    expect(MAINFLOW).not.toContain("ui.showProgress(Lang.text('Mods.SandboxWorld.Progress.RenderingWorld'), 1)");
    expect(MAINFLOW).toContain('g.endEntryFreeze();');
    // 入场门链与 3s race 兜底原样保留（wbake-entry-gate 锁同域复核）
    expect(MAINFLOW).toContain('const entryGate = WBAKE_ENABLED');
    expect(MAINFLOW).toContain('g.whenFirstPaint(4).then(() => g.whenViewportBaked(3000))');
    expect(MAINFLOW).toContain(': g.whenFirstPaint(4);');
    expect(MAINFLOW).toContain('new Promise((r) => setTimeout(r, 3000))');
  });

  it('计费沿：GameCallbacks.onEntryFreeze 接线 → play.pause/resume（冻结期不计游玩时长）', () => {
    expect(GAME).toContain('onEntryFreeze?: (open: boolean) => void;');
    expect(GAME).toContain('this.cb.onEntryFreeze?.(true);');
    expect(MAINFLOW).toContain('onEntryFreeze: (open) => { if (open) play.pause(Date.now()); else play.resume(Date.now()); }');
  });
});

describe.skipIf(EXT_MISSING)('wbake 转正③：加载步骤键 Mods.SandboxWorld.Progress.RenderingWorld', () => {
  const LANGS = ['de-DE', 'en-US', 'es-ES', 'fr-FR', 'it-IT', 'ja-JP', 'ko-KR', 'pl-PL', 'pt-BR', 'ru-RU', 'zh-Hans', 'zh-Hant'];
  const KEY = 'SandboxWorld.Progress.RenderingWorld';

  it('12 语系 custom 源全量补键', () => {
    for (const l of LANGS) {
      const src = readFileSync(join(ROOT, '../tools/l10n-custom', `${l}.json`), 'utf8');
      expect(src, `${l}.json 缺 ${KEY}`).toContain(`"${KEY}"`);
    }
  });

  it('构建产物 zh-Hans/en-US 键在位（l10n-audit 消费面）', () => {
    const parse = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Record<string, Record<string, string>>;
    const zh = parse(join(ROOT, 'public/l10n/zh-Hans.json'));
    const en = parse(join(ROOT, 'public/l10n/en-US.json'));
    expect(zh.Mods?.[KEY]).toBe('正在渲染世界…');
    expect(en.Mods?.[KEY]).toBe('Rendering world…');
  });
});
