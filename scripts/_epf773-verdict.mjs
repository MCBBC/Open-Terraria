#!/usr/bin/env node
// elementFromPoint 773ms/90s exit-trace 归因定谳探针(2026-10-04)。
// ① 消费位活机计数(包装 document.elementFromPoint:次数/累计耗时/调用方栈归因)
// ② 战斗态频率实测:背包关闭,光标在世界区李萨如移动 + 按住左键(自动挥砍)
// ③ 对照组:光标静止 / 光标扫过热栏 UI 区
// ④ _domUiRects 快照体检:全视口 rect(sw-root)是否架空纯数学预检
// 用法: SW_ORIGIN=http://localhost:5214 node tools/run-diag.mjs \
//         --timeout=280000 scripts/_epf773-verdict.mjs
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5214';
const log = (...a) => console.log('[epf773]', ...a);

const main = async () => {
  const browser = await launchBrowser({ headed: false });
  try {
    const page = await openPage(browser, { errors: [] });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await new Promise((r) => setTimeout(r, 600));

    // 安装计数器(带调用方归因 + 单次成本)
    await page.evaluate(() => {
      const g = window.__swGame;
      const orig = document.elementFromPoint.bind(document);
      const W = window;
      W.__epf = { calls: 0, costMs: 0, byCaller: {}, stacks: [], installed: Date.now() };
      document.elementFromPoint = function (...a) {
        const st = W.__epf;
        st.calls++;
        const t0 = performance.now();
        const r = orig(...a);
        st.costMs += performance.now() - t0;
        if (st.stacks.length < 24) {
          const lines = (new Error().stack || '').split('\n').slice(2, 8).join(' | ');
          // 归因桶
          let bucket = 'other';
          if (lines.includes('inpOverDomUi')) bucket = 'Game.inpOverDomUi';
          else if (lines.includes('resolveDrop')) bucket = 'UI.resolveDrop';
          else if (lines.includes('reprobeHover')) bucket = 'InfoAccsDOM.reprobeHover';
          st.byCaller[bucket] = (st.byCaller[bucket] ?? 0) + 1;
          if (st.stacks.filter((s) => s.b === bucket).length < 2) {
            st.stacks.push({ b: bucket, s: lines.slice(0, 420) });
          }
        }
        return r;
      };
    });

    const box = await page.evaluate(() => {
      const cvs = document.querySelectorAll('canvas');
      for (const c of cvs) {
        const r = c.getBoundingClientRect();
        if (r.width > 100 && r.height > 100) return { x: r.left, y: r.top, width: r.width, height: r.height };
      }
      return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    });
    const cxm = box.x + box.width / 2, cym = box.y + box.height / 2;

    const read = () => page.evaluate(() => {
      const e = window.__epf;
      return { calls: e.calls, costMs: +e.costMs.toFixed(1), byCaller: { ...e.byCaller } };
    });

    // ── 场景1:战斗态(背包关) 光标在世界区移动 + 按住左键 10s ──
    await page.mouse.move(cxm, cym);
    await page.mouse.down();
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < 10000) {
      const t = (Date.now() - t0) / 1000;
      const x = cxm + Math.sin(t * 2.1) * 180 + Math.sin(t * 0.7) * 60;
      const y = cym + Math.cos(t * 1.7) * 120;
      await page.mouse.move(x, y, { steps: 2 });
      await new Promise((r) => setTimeout(r, 16));
      i++;
    }
    const s1 = await read();
    await page.mouse.up();
    log('S1 combat-move+LMB 10s:', JSON.stringify(s1));

    // ── 场景2:光标静止在世界区 4s(无按键) ──
    await page.mouse.move(cxm + 200, cym + 100, { steps: 4 });
    const b2 = await read();
    await new Promise((r) => setTimeout(r, 4000));
    const s2 = await read();
    log('S2 stationary-world 4s:', JSON.stringify({ calls: s2.calls - b2.calls, costMs: +(s2.costMs - b2.costMs).toFixed(1), byCaller: s2.byCaller }));

    // ── 场景3:光标扫过热栏 UI 区(持左键) 5s ──
    await page.mouse.down();
    const b3 = await read();
    const t3 = Date.now();
    while (Date.now() - t3 < 5000) {
      const t = (Date.now() - t3) / 1000;
      const x = box.x + 40 + ((Math.sin(t * 3.1) + 1) / 2) * 420;
      const y = box.y + 12 + Math.cos(t * 2.3) * 22;
      await page.mouse.move(x, y, { steps: 2 });
      await new Promise((r) => setTimeout(r, 16));
    }
    const s3 = await read();
    await page.mouse.up();
    log('S3 hotbar-hover+LMB 5s:', JSON.stringify({ calls: s3.calls - b3.calls, costMs: +(s3.costMs - b3.costMs).toFixed(1), byCaller: s3.byCaller }));

    // ── 等价网格:新 inpOverDomUi vs 纯活 elementFromPoint+isDomUiTarget(金标)
    //    两态(关包/开包)全屏步进 + rect 边角精扫 ──
    const gridOnce = async () => page.evaluate(async () => {
      const g = window.__swGame;
      const { isDomUiTarget } = await import('/src/core/input/domTargets.ts');
      const inp = g.input;
      const cv = g.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
      const rect = cv.getBoundingClientRect();
      const rl = typeof inp['rectLeft'] === 'number' ? inp['rectLeft'] : rect.left;
      const rt = typeof inp['rectTop'] === 'number' ? inp['rectTop'] : rect.top;
      const ref = (cx, cy) => isDomUiTarget(document.elementFromPoint(Math.max(0, cx), Math.max(0, cy)) ?? null);
      const pts = [];
      const W = window.innerWidth, H = window.innerHeight;
      for (let x = 4; x < W; x += Math.max(10, Math.floor(W / 40))) {
        for (let y = 4; y < H; y += Math.max(10, Math.floor(H / 24))) pts.push([x, y]);
      }
      for (const q of (g['_domUiRects'] ?? [])) {
        for (const d of [2, 0, -2]) {
          pts.push([Math.max(0, q.l + d), Math.max(0, q.t)]);
          pts.push([Math.max(0, q.r + d), Math.max(0, q.b)]);
        }
      }
      let mismatches = 0, trueN = 0; const first = [];
      for (const [cx, cy] of pts) {
        inp.mouseX = cx - rl; inp.mouseY = cy - rt;
        const got = g['inpOverDomUi']();
        const want = ref(cx, cy);
        if (want) trueN++;
        if (got !== want) {
          mismatches++;
          if (first.length < 6) first.push({ cx, cy, got, want });
        }
      }
      return { checked: pts.length, mismatches, trueN, first, rectsN: (g['_domUiRects'] ?? []).length };
    });

    const eqClosed = await gridOnce();
    log('EQ closed-inv:', JSON.stringify(eqClosed));
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 600));
    const eqOpen = await gridOnce();
    log('EQ open-inv:', JSON.stringify({ ...eqOpen, first: undefined }));
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 400));

    // ── 行为点检:悬停语义钉面(BJ414 穿透面/热栏/散件/世界) ──
    const spots = await page.evaluate(async () => {
      const g = window.__swGame;
      const { isDomUiTarget } = await import('/src/core/input/domTargets.ts');
      const inp = g.input;
      const cv = g.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
      const rect = cv.getBoundingClientRect();
      const rl = typeof inp['rectLeft'] === 'number' ? inp['rectLeft'] : rect.left;
      const rt = typeof inp['rectTop'] === 'number' ? inp['rectTop'] : rect.top;
      const probe = (cx, cy) => {
        inp.mouseX = cx - rl; inp.mouseY = cy - rt;
        return g['inpOverDomUi']();
      };
      const pick = (sel, k = 0) => {
        const els = document.querySelectorAll(sel);
        const e = els[k];
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return r.width > 0 ? [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] : null;
      };
      const out = {};
      const hot = pick('.sw-slot[data-idx="0"]') ?? pick('.sw-slot');
      out.hotbarSlot = hot ? probe(hot[0], hot[1]) : 'n/a';
      const buff = pick('.sw-buff');
      out.buffIcon = buff ? probe(buff[0], buff[1]) : 'n/a(none)';
      const manual = pick('.sw-manual-btn');
      out.manualBtn = manual ? probe(manual[0], manual[1]) : 'n/a';
      const W = window.innerWidth, H = window.innerHeight;
      out.worldMid = probe(Math.floor(W / 2), Math.floor(H / 2));
      return out;
    });
    log('SPOTS:', JSON.stringify(spots));

    // ── 快照体检 + 归因栈样例 ──
    const audit = await page.evaluate(() => {
      const g = window.__swGame;
      const rects = (g['_domUiRects'] ?? []).map((q) => ({ l: q.l, t: q.t, r: q.r, b: q.b }));
      const W = window.innerWidth, H = window.innerHeight;
      const covering = rects.filter((q) => q.l <= 2 && q.t <= 2 && q.r >= W - 2 && q.b >= H - 2);
      // 中屏点预检结果
      let nearMid = false;
      const mx = Math.floor(W / 2), my = Math.floor(H / 2);
      for (const q of rects) if (mx >= q.l && mx <= q.r && my >= q.t && my <= q.b) { nearMid = true; break; }
      // 可命中元素(有效 PE auto)枚举:selector 成员 + .sw-root 子树内 PE auto 元素
      const sel = '.sw-root, .sw-panel, .sw-slot, .sw-recipe, .sw-btn, .sw-chatbox,' +
        '.sw-mobile, .sw-hotbar, .sw-tooltip, .sw-drag-ghost,' +
        '.sw-ach-panel, .sw-res-panel, .sw-eqdock, .sw-vinv, .sw-summon-panel,' +
        '.sw-npc-dialog, .sw-npc-shop, .sw-happy-panel, .sw-char-panel';
      const root = document.querySelector('.sw-root');
      let hittable = 0, hittableUncovered = 0; const uncoveredSamples = [];
      if (root) {
        const all = root.querySelectorAll('*');
        // 收集「已登记且非 PE-none」成员 bbox(覆盖判据)
        const members = [...document.querySelectorAll(sel)].map((e) => {
          const pe = getComputedStyle(e).pointerEvents;
          const rc = e.getBoundingClientRect();
          return { pe, rc };
        }).filter((m) => m.pe !== 'none' && m.rc.width > 0 && m.rc.height > 0);
        const covered = (x, y) => members.some((m) => x >= m.rc.left && x <= m.rc.right && y >= m.rc.top && y <= m.rc.bottom);
        for (const e of all) {
          if (getComputedStyle(e).pointerEvents !== 'auto') continue;
          const rc = e.getBoundingClientRect();
          if (rc.width <= 0 || rc.height <= 0) continue;
          hittable++;
          const px = rc.left + rc.width / 2, py = rc.top + rc.height / 2;
          if (!covered(px, py)) {
            hittableUncovered++;
            if (uncoveredSamples.length < 8) {
              uncoveredSamples.push({ cls: (e.className || '').toString().slice(0, 60), rc: `${Math.round(rc.left)},${Math.round(rc.top)},${Math.round(rc.width)}x${Math.round(rc.height)}` });
            }
          }
        }
      }
      return {
        rectsN: rects.length, coveringFull: covering.length, nearMidScreen: nearMid,
        swRootPE: root ? getComputedStyle(root).pointerEvents : 'n/a',
        hittableInRoot: hittable, hittableUncoveredByMembers: hittableUncovered, uncoveredSamples,
        stacks: window.__epf.stacks,
      };
    });
    log('AUDIT:', JSON.stringify({ ...audit, stacks: undefined }));
    for (const s of audit.stacks) log('STACK', s.b, '→', s.s);
    await page.close().catch(() => {});
    process.exitCode = 0;
  } finally {
    await closeAllBrowsers().catch(() => {});
  }
};

try {
  await main();
} catch (e) {
  console.error('[epf773] FAIL', e?.stack ?? e);
  process.exit(1);
}
