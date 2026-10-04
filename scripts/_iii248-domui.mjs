#!/usr/bin/env node
// IIII248 ① inpOverDomUi 缓存差分仪(浏览器域;vitest 域无 document 不可测):
//   参照实现 = 旧算法逐行复刻(共享 game 内部 _domUiRects 快照 + 活 elementFromPoint
//   + isDomUiTarget)——与缓存实现同状态同输入下逐点对拍:
//     A. 网格差分:光标扫过 UI 面/缝隙/世界域,缓存结果 ≡ 参照结果;
//     B. 重复调用:同 (cx,cy,rectsTick) 二次调用结果不变(缓存命中面);
//     C. rects 刷新沿:_domUiRectsTick 重置后结果仍 ≡ 参照(键失配→活查询);
//     D. 收益哨:缓存命中调用不再触发 elementFromPoint(计数器)。
// 用法: SW_ORIGIN=http://localhost:5298 node tools/run-diag.mjs \
//         --timeout=180000 scripts/_iii248-domui.mjs
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5298';
const log = (...a) => console.log('[domui]', ...a);

const main = async () => {
  const browser = await launchBrowser({ headed: false });
  try {
    const page = await openPage(browser, { errors: [] });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 600 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);

    // 打开背包(保证 UI 面/槽位/面板矩形在屏);光标挪到画布内
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 400));

    const result = await page.evaluate(async () => {
      const g = window.__swGame;
      const { isDomUiTarget } = await import('/src/core/input/domTargets.ts');
      const inp = g.input;
      const cr = (typeof inp.canvasRectLeft === 'number') ? inp : null;
      const cv = g.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
      const rect = cv.getBoundingClientRect();
      // 参照实现(与 Game.inpOverDomUi 同算法逐行复刻,仅无缓存;共享同一快照状态)
      // ★EPF773(2026-10-04):随主实现同步——rect 预检四周扩 1px(Chromium 命中测试
      //  像素对齐外扩,gBCR 浮点框欠 ~1px;见 Game.ts 预检注)
      const ref = (cx, cy) => {
        const rects = g['_domUiRects'];
        let near = false;
        if (Array.isArray(rects)) {
          for (let i = 0; i < rects.length; i++) {
            const q = rects[i];
            if (cx >= q.l - 1 && cx <= q.r + 1 && cy >= q.t - 1 && cy <= q.b + 1) { near = true; break; }
          }
        }
        if (!near) return false;
        const el = document.elementFromPoint(Math.max(0, cx), Math.max(0, cy));
        return isDomUiTarget(el ?? null);
      };
      const setCxy = (cx, cy) => {
        // 驱动 inpOverDomUi 的 (cx,cy) 全输入面:mouseX/Y = 目标点 − canvasRect 缓存
        // (canvasRectLeft 是只读 getter,backing = 私有 rectLeft/Top,bracket 读)
        const rl = typeof inp['rectLeft'] === 'number' ? inp['rectLeft'] : rect.left;
        const rt = typeof inp['rectTop'] === 'number' ? inp['rectTop'] : rect.top;
        inp.mouseX = cx - rl; inp.mouseY = cy - rt;
      };
      let epfCalls = 0;
      const origEpf = document.elementFromPoint.bind(document);
      document.elementFromPoint = (...a) => { epfCalls++; return origEpf(...a); };
      const cachedCall = () => g['inpOverDomUi']();

      // 网格:全屏 32×20 步进 + UI 矩形边角精扫(缓存 _domUiRects 边界 ±2px)
      const pts = [];
      const W = window.innerWidth, H = window.innerHeight;
      for (let x = 4; x < W; x += Math.max(8, Math.floor(W / 32))) {
        for (let y = 4; y < H; y += Math.max(8, Math.floor(H / 20))) pts.push([x, y]);
      }
      const rects = (g['_domUiRects'] ?? []);
      for (const q of rects) {
        for (const e of [2, 1, 0, -1, -2]) {
          pts.push([Math.max(0, q.l + e), Math.max(0, q.t)]);
          pts.push([Math.max(0, q.r + e), Math.max(0, q.b)]);
          pts.push([Math.max(0, q.l), Math.max(0, q.t + e)]);
          pts.push([Math.max(0, q.r), Math.max(0, q.b + e)]);
        }
      }
      let mismatches = 0, checked = 0, near = 0;
      let firstMismatch = null;
      for (const [cx, cy] of pts) {
        setCxy(cx, cy);
        const got = cachedCall();
        const want = ref(cx, cy);
        checked++;
        if (got !== want) {
          mismatches++;
          if (!firstMismatch) firstMismatch = { cx, cy, got, want };
        }
        if (want) near++;
      }
      // B:重复调用(缓存命中)结果恒定 + C:rectsTick 失配 → 活查询仍对
      const sample = rects[0] ? [Math.floor((rects[0].l + rects[0].r) / 2), Math.floor((rects[0].t + rects[0].b) / 2)] : [8, 8];
      setCxy(sample[0], sample[1]);
      const a1 = cachedCall();
      const r1 = ref(sample[0], sample[1]);
      const epfA = epfCalls;           // 参照调用计入后再起算
      const a2 = cachedCall();
      const a3 = cachedCall();
      const epfB = epfCalls;
      g['_domUiRectsTick'] = -999;    // 强制快照刷新沿(rects 变化路径)
      cachedCall();                    // 刷新快照+重建缓存
      const r2 = ref(sample[0], sample[1]);
      const a4 = cachedCall();         // 新键下的缓存命中
      const repeatStable = (a1 === r1) && (a2 === a1) && (a3 === a1) && (a4 === r2);
      const epfSaved = epfB - epfA === 0;   // a2/a3 重复调用命中缓存=零 elementFromPoint
      document.elementFromPoint = origEpf;
      return {
        checked, mismatches, near, firstMismatch,
        repeatStable, epfSaved, epfCalls,
        rectsN: rects.length,
        inventoryOpen: !!(window).__swUI?.inventoryOpen,
      };
    });
    log(JSON.stringify(result));
    const ok = result.mismatches === 0 && result.repeatStable && result.epfSaved && result.rectsN > 0;
    log(ok ? 'DOMUI_EQUIV PASS' : 'DOMUI_EQUIV FAIL');
    await page.close().catch(() => {});
    process.exitCode = ok ? 0 : 2;
  } finally {
    await closeAllBrowsers().catch(() => {});
  }
};

try {
  await main();
} catch (e) {
  console.error('[domui] FAIL', e?.stack ?? e);
  process.exit(1);
}
