// 进入画面 logo 卡（logo_1..8 随机一张，≥2s 最短显示）：
// 纯函数选卡 + DOM 桩生命周期（最短显示补满/幂等 finish/图片失败自退场）。
import { it, expect, beforeEach, afterEach } from 'vitest';
import { pickLogoIndex, showLogoIntro } from '../src/ui/LogoIntro';

const docBackup = (globalThis as { document?: unknown }).document;

/** 最小 DOM 桩：createElement 产可查 img 的元素；body.appendChild 记账。
 *  imgErrorAutoMs > 0 时挂上即自动派发 error（测自退场路径） */
function stubDom(imgErrorAutoMs = 0) {
  let imgLoad: (() => void) | null = null;
  const created: Array<Record<string, unknown>> = [];
  (globalThis as { document?: unknown }).document = {
    createElement() {
      const el: Record<string, unknown> = {
        id: '',
        innerHTML: '',
        style: {} as Record<string, string>,
        removed: false,
        appendChild() { /* style 标签入根，无需记账 */ },
        remove() { el.removed = true; },
        querySelector(sel: string) {
          return sel === 'img'
            ? {
                style: {} as Record<string, string>,
                addEventListener(type: string, fn: () => void) {
                  if (type === 'load') imgLoad = fn;
                  if (type === 'error' && imgErrorAutoMs > 0) setTimeout(fn, imgErrorAutoMs);
                },
              }
            : null;
        },
        addEventListener() { /* 未用 */ },
      };
      created.push(el);
      return el;
    },
    body: { appendChild(c: unknown) { created.push(c as Record<string, unknown>); } },
  };
  return { created, fireLoad: () => imgLoad?.() };
}

let env: ReturnType<typeof stubDom>;

beforeEach(() => { env = stubDom(); });
afterEach(() => {
  (globalThis as { document?: unknown }).document = docBackup;
});

it('pickLogoIndex：rand∈[0,1) → 1..8', () => {
  expect(pickLogoIndex(() => 0)).toBe(1);
  expect(pickLogoIndex(() => 0.999)).toBe(8);
  expect(pickLogoIndex(() => 0.5)).toBe(5);
});

it('finish：补满最短显示后淡出移除；重复调用幂等', async () => {
  const h = showLogoIntro({ minMs: 60 });
  env.fireLoad();                                        // 图就绪淡入
  const root = env.created.find((c) => c.id === 'sw-logo-intro')!;
  expect(root.removed).toBe(false);
  const t0 = Date.now();
  await h.finish();
  expect(Date.now() - t0).toBeGreaterThanOrEqual(60);    // 最短显示被补满
  expect(root.removed).toBe(true);                       // 淡出后移除
  const t1 = Date.now();
  await h.finish();                                      // 幂等：立即 resolve
  expect(Date.now() - t1).toBeLessThan(30);
});

it('图片加载失败 → 立即自退场，finish 快速 resolve（不阻断启动）', async () => {
  env = stubDom(5);                                      // img 挂上即自动 error
  const h = showLogoIntro({ minMs: 60 });
  await new Promise((r) => setTimeout(r, 30));           // 等 error 派发自退场
  const root = env.created.find((c) => c.id === 'sw-logo-intro')!;
  expect(root.removed).toBe(true);
  const t0 = Date.now();
  await h.finish();
  expect(Date.now() - t0).toBeLessThan(30);              // 已退场：不再补 60ms
});
