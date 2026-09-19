// ★红队 F1 翻转实验复跑(信息栏 DOM 化 2026-09-19 修后复核):
// 场景复刻定谳实验——挂载窗内 UI_InfoIcon_* 懒加载未落地(UITextures.get 打桩
// 返 null,确定性复现自然懒载窗),旗开挂载+行集账记 null src;
// 拔桩(纹理"落地")后 steady ≥30s 无任何 rebuild 介入:
//   修前坐实:withSrc 恒 0/12(悬停域死),拨一次 Escape 触发 rebuild 才 12/12;
//   修后判据:落地沿 ≤5s 内自愈 12/12,steady 30s 持续 12/12,期间 src 属性
//   DOM 写(MutationObserver)恰 = 落地沿 ic+hl 各 12 笔后归零,零 rebuild;
//   悬停域复活:鼠标压行 2 图标 → infoAccHover=2。
import { launchBrowser, openPage, bootstrap, createGame, front, ledger } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
const page = await openPage(browser, { errors: L.fails });
await bootstrap(page, process.env.SW_ORIGIN);
await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: 'small' });

// 装备贝壳电话 → 12 行
const equip = await page.evaluate(async () => {
  for (let i = 0; i < 60 && !(window.__swFlow?.itemByVid && window.__swGame?.player?.inv?.armor); i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const g = window.__swGame;
  const flow = window.__swFlow;
  if (!flow?.itemByVid) return { ok: false, why: 'no-bridge' };
  const iid = flow.itemByVid(3124);
  if (iid == null) return { ok: false, why: 'no-vid' };
  g.player.inv.armor[3] = { id: iid, stack: 1 };
  return { ok: true, iid };
});
L.chk('装备全门禁饰品', equip.ok, JSON.stringify(equip));
await new Promise((r) => setTimeout(r, 600));

// 打桩前捕原引用 + 打桩 → 旗开(下一渲染帧才懒建 DOM 层,轮询等挂载) → Observer
await page.evaluate(async () => {
  const m = await import('/src/vui/assets/UITextures.ts');
  const orig = m.UITextures.get.bind(m.UITextures);
  window.__swF1OrigGet = orig;
  m.UITextures.get = (name) => (typeof name === 'string' && name.startsWith('UI_InfoIcon_') ? null : orig(name));
  window.__swInfoDom.set(true);
  for (let i = 0; i < 120 && !window.__swGame.renderer.infoAccDom?.el; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const P = window.__swF1 = { srcWrites: 0, rebuildAdds: 0, landedAt: 0, unstubAt: 0 };
  const dom = window.__swGame.renderer.infoAccDom;
  if (!dom?.el) return { ok: false };
  // src 属性写(subtree;含 ic+hl)
  new MutationObserver((muts) => {
    for (const mu of muts) {
      if (mu.type === 'attributes') {
        P.srcWrites++;
        if (!P.landedAt) P.landedAt = performance.now();
      }
    }
  }).observe(dom.el, { subtree: true, attributes: true, attributeFilter: ['src'] });
  // rebuild 探测:仅容器【直接子元素】增删(行元素被 replaceChildren 整换);
  // subtree childList 会把 span.textContent 更新(文本节点替换=合法 diff 写)误计
  new MutationObserver((muts) => {
    for (const mu of muts) P.rebuildAdds += mu.addedNodes.length;
  }).observe(dom.el, { childList: true });
});
await new Promise((r) => setTimeout(r, 2000));

const mountState = await page.evaluate(() => {
  const dom = window.__swGame.renderer.infoAccDom;
  const ics = [...dom.el.querySelectorAll('.sw-inf-row')].map((r) => r.children[0]);
  return { rows: dom.el.querySelectorAll('.sw-inf-row').length, withSrc: ics.filter((i) => i.getAttribute('src')).length };
});
L.chk('挂载窗(纹理未落地):12 行挂载且图标全缺 src(复现 F1 前提)', mountState.rows === 12 && mountState.withSrc === 0, JSON.stringify(mountState));

// 拔桩 = 纹理落地沿(此后再无任何 rebuild 触发:不拨键/不开包/不动饰品)
await page.evaluate(async () => {
  const m = await import('/src/vui/assets/UITextures.ts');
  window.__swF1.unstubAt = performance.now();
  m.UITextures.get = window.__swF1OrigGet;
});
await new Promise((r) => setTimeout(r, 5000));
const healed = await page.evaluate(() => {
  const dom = window.__swGame.renderer.infoAccDom;
  const ics = [...dom.el.querySelectorAll('.sw-inf-row')].map((r) => r.children[0]);
  const F = window.__swF1;
  return {
    withSrc: ics.filter((i) => i.getAttribute('src')).length,
    displayBlock: ics.filter((i) => i.style.display === 'block').length,
    srcWrites: F.srcWrites, rebuildAdds: F.rebuildAdds,
    healMs: F.landedAt ? Math.round(F.landedAt - F.unstubAt) : null,
  };
});
L.chk('落地沿 ≤5s 自愈 12/12(无 rebuild 介入)', healed.withSrc === 12 && healed.displayBlock === 12 && healed.rebuildAdds === 0, JSON.stringify(healed));
L.say(`落地沿首笔 src 写时延 = ${healed.healMs}ms,src DOM 写笔数(落地沿) = ${healed.srcWrites}(ic 12 + hl 12 = 预期 24)`);

// steady ≥30s(持续 12/12 + src 写归零 = 逐帧 diff 纪律保持)
await front(page);
await new Promise((r) => setTimeout(r, 30_000));
const steady = await page.evaluate(() => {
  const dom = window.__swGame.renderer.infoAccDom;
  const ics = [...dom.el.querySelectorAll('.sw-inf-row')].map((r) => r.children[0]);
  const F = window.__swF1;
  return {
    withSrc: ics.filter((i) => i.getAttribute('src')).length,
    srcWritesTotal: F.srcWrites, rebuildAdds: F.rebuildAdds,
    rows: dom.el.querySelectorAll('.sw-inf-row').length,
  };
});
L.chk('steady 30s:12/12 持续 + 零新 DOM 写 + 零 rebuild', steady.withSrc === 12 && steady.srcWritesTotal === healed.srcWrites && steady.rebuildAdds === 0 && steady.rows === 12, JSON.stringify(steady));

// 悬停域复活(无 rebuild 前提下)
const xy = await page.evaluate(() => {
  const el = window.__swGame.renderer.infoAccDom?.el.querySelector('.sw-inf-row[data-row="2"] img');
  const r = el.getBoundingClientRect();
  return { x: r.left + 7, y: r.top + 7 };
});
await page.mouse.move(xy.x, xy.y);
await new Promise((r) => setTimeout(r, 300));
const hv = await page.evaluate(() => window.__swGame.renderer.infoAccHover);
L.chk('悬停域复活(infoAccHover=2,无 rebuild)', hv === 2, `hover=${hv}`);

console.log('[f1-flip] done');
process.exit(L.exitCode());
