// ★BJ335（2026-09-24）退世界主锚收刀 tripwire（BJ318/BJ280 同款源码锚锁 + OptionsStore 行为单测）。
//
// 定谳（中立探针 + 快照连通分量 + 经验二分,存档 /tmp/bj335-*.log）:
//  ①模块级长存单例 OptionsStore.listeners 按轮累积——UI.ts 三个【每轮重建】订阅点
//   （buildHud 的 applyTooltipBox / vinvBuildBuilderAccToggles 域的 sync / syncNear）
//   闭包 context 连整轮构建岛,不退订 = 每轮游离 vinv 面板 ~400 节点/~900 监听器钉死
//   （验收仪 +908/轮 → 修后稳态 +13/轮）。
//  ②queryObjects 活元素 +376/轮 为插桩自捕伪影（DevTools console 全局句柄钉住
//   queryObjects 结果数组——四张结果数组尺寸恰等于四轮 census 总数）,弃用该指标。
//  ③TitleMenu.destroy 漏摘 window 捕获 pointerdown(logo 连点诊断),无点击路径整族滞留。
//  ④合成器层 +3/轮 与主锚【独立】（主锚破后仍在,LayerTree 无 DOM owner,loseContext
//   修法与 GPU 压力熔断器冲突已回退）——登记债,不在本刀范围。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('BJ335 OptionsStore 退订句柄（行为单测）', () => {
  it('onChange 返回退订函数;退订后 emit 不再回调;重复退订安全', async () => {
    const { OptionsStore } = await import('../src/core/Options');
    const store = new OptionsStore();
    let calls = 0;
    const unsub = store.onChange(() => { calls++; });
    expect(typeof unsub).toBe('function');
    expect(store.removeListener.length).toBe(1);
    // 未 load 时 onChange 不即时回调（loaded=false）;经 set 触发 emit
    await store.set('autoPause', true);
    expect(calls).toBe(1);
    unsub();          // 退订
    unsub();          // 重复退订安全（removeListener 返回 false,不抛）
    await store.set('autoPause', false);
    expect(calls).toBe(1);   // 退订后不再回调
    // 其余监听者不受影响
    let other = 0;
    store.onChange(() => { other++; });
    await store.set('autoPause', true);
    expect(other).toBe(1);
  });
});

describe('BJ335 退世界主锚收刀（源码锚 tripwire）', () => {
  const ui = read('src/ui/UI.ts');
  const tm = read('src/ui/TitleMenu.ts');
  const opt = read('src/core/Options.ts');

  it('Options.onChange 返回退订闭包（BJ335 刀）', () => {
    expect(opt).toContain('onChange(fn: (d: OptionsData) => void): () => void');
    expect(opt).toContain('return () => this.removeListener(fn);');
  });

  it('UI 三个每轮订阅点全部入册（applyTooltipBox/sync/syncNear）', () => {
    const pushes = ui.match(/this\.optionsUnsubs\.push\(options\.onChange/g) ?? [];
    expect(pushes.length).toBe(3);
    expect(ui).toContain('private optionsUnsubs: Array<() => void> = [];');
    // 旧"无退订点"注释已随刀摘除（防回潮:回退即重现累积泄漏）
    expect(ui).not.toContain('options.onChange(applyTooltipBox);   // UI 单例长存');
  });

  it('closeAll 统一退订 + 覆盖漏网字段（teardown 主刀 + tooltip/onEmoteMenu/buff 三 Map）', () => {
    expect(ui).toContain('this.teardownInventoryPanel();');
    expect(ui).toContain('for (const u of this.optionsUnsubs) u();');
    expect(ui).toContain('this.optionsUnsubs.length = 0;');
    expect(ui).toContain('this.tooltip = null as unknown as HTMLElement;');
    expect(ui).toContain('this.onEmoteMenu = undefined;');
    expect(ui).toContain('this.buffBlocks.clear();');
    expect(ui).toContain('this.petBuffBlocks.clear();');
    expect(ui).toContain('this.nebulaBuffBlocks.clear();');
  });

  it('TitleMenu.destroy 对称摘除 window 捕获 pointerdown（logo 连点诊断）', () => {
    expect(tm).toContain('this.onLogoTap = onTap;');
    expect(tm).toMatch(/destroy\(\)[\s\S]*removeEventListener\('pointerdown', this\.onLogoTap, true\)/);
    expect(tm).toContain('private onLogoTap: ((e: PointerEvent) => void) | null = null;');
  });
});
