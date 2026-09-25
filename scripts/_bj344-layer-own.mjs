// BJ344 件3 v3：+3/轮层归属定位。Chrome153 无 getLayerTree/backendNodeId →
//  ① 页面起点 MutationObserver 逐轮记录新增/移除元素（持强引用）
//  ② 轮后对「已加未删」元素查合成触发面（transform/will-change/fixed/filter/content-visibility）
//  ③ didChange id 差分 + makeSnapshot 命令日志（cmd.name 直读修正）
// 运行：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj344-layer-own.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });

await page.evaluateOnNewDocument(() => {
  // ★BJ344 实验：预种公告 ack（BJ144 探针坑先例）——验证 +3/轮=WelcomeAnnounce 覆层累积
  // 未 ack 实验轮：注释预种以复现原始路径
  // try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ }
  const log = { added: [], removed: [] };
  window.__bj344Dom = log;
  const path = (el) => {
    const bits = [];
    let e = el;
    for (let i = 0; e && e.nodeType === 1 && i < 6; i++, e = e.parentElement) {
      bits.unshift(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`);
    }
    return bits.join('>');
  };
  const mo = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) log.added.push({ el: n, at: log.added.length, p: path(n) });
    for (const m of muts) for (const n of m.removedNodes) if (n.nodeType === 1) log.removed.push(n);
  });
  const arm = () => mo.observe(document.documentElement, { childList: true, subtree: true });
  if (document.documentElement) arm(); else document.addEventListener('DOMContentLoaded', arm, { once: true });
});

async function enterWorld() {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2500));
}

async function reenter() {
  await page.evaluate(() => window.__swFlow.quitToMenu());
  await page.waitForFunction(() => !window.__swGame, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1200));
  await page.waitForSelector('select', { timeout: 60000 });
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2500));
}

async function layerIdSnapshot(cdp) {
  await cdp.send('LayerTree.enable');
  const ids = await new Promise((res) => {
    const got = (e) => res((e.layers ?? []).map((l) => l.layerId));
    cdp.on('LayerTree.layerTreeDidChange', got);
    setTimeout(() => res(null), 3000);
  }).then((ls) => ls ?? []);
  await new Promise((r) => setTimeout(r, 400));
  await cdp.send('LayerTree.disable').catch(() => {});
  return ids;
}

async function layerCommandProfile(cdp, layerId) {
  try {
    const { snapshotId } = await cdp.send('LayerTree.makeSnapshot', { layerId });
    const { commandLog } = await cdp.send('LayerTree.snapshotCommandLog', { snapshotId });
    const byCmd = new Map();
    for (const c of commandLog ?? []) {
      const name = c.name ?? c.cmd?.name ?? (typeof c === 'string' ? c : Array.isArray(c) ? c[0] : '?');
      byCmd.set(String(name), (byCmd.get(String(name)) ?? 0) + 1);
    }
    return { n: (commandLog ?? []).length, top: [...byCmd.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6) };
  } catch (err) { return { n: -1, top: [['<empty/' + String(err.message ?? err).slice(0, 24) + '>', 1]] }; }
}

/** 页内：已加未删元素 × 合成触发面普查 */
async function retainedDomReport() {
  return page.evaluate(() => {
    const removed = new Set(window.__bj344Dom.removed);
    const live = window.__bj344Dom.added.filter((a) => !removed.has(a.el) && a.el.isConnected);
    const triggers = [];
    for (const a of live) {
      const el = a.el;
      const s = getComputedStyle(el);
      const tg = [];
      if (el.tagName === 'CANVAS') tg.push('CANVAS');
      if (s.willChange !== 'auto') tg.push('willChange=' + s.willChange);
      if (s.transform !== 'none' && s.transform !== '') tg.push('transform');
      if (s.position === 'fixed') tg.push('fixed');
      if ((s.filter ?? 'none') !== 'none') tg.push('filter');
      if ((s.backdropFilter ?? 'none') !== 'none') tg.push('backdrop');
      if ((s.contain ?? '').includes('paint')) tg.push('contain-paint');
      if ((s.contentVisibility ?? 'visible') !== 'visible') tg.push('cv=' + s.contentVisibility);
      if (tg.length) triggers.push({ p: a.p, at: a.at, rect: `${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`, tg: tg.join(',') });
    }
    const canvases = [...document.querySelectorAll('canvas')].map((c) => `${c.id || c.className || 'anon'} ${c.width}x${c.height}`);
    return { addedTotal: window.__bj344Dom.added.length, removedTotal: window.__bj344Dom.removed.length, liveCount: live.length, triggers, canvases };
  });
}

await enterWorld();
const cdp = await page.createCDPSession();
const S0 = await layerIdSnapshot(cdp);
console.log(`S0(P0) ids=${S0.length}: ${S0.join(',')}`);

const round = async (label, prev) => {
  await page.evaluate(() => { window.__bj344Mark = window.__bj344Dom.added.length; });
  await reenter();
  const S = await layerIdSnapshot(cdp);
  const added = S.filter((x) => !prev.includes(x));
  const removed = prev.filter((x) => !S.includes(x));
  console.log(`\n${label}: ids=${S.length} new=[${added.join(',')}] gone=[${removed.join(',')}]`);
  for (const id of added.slice(0, 12)) {
    const prof = await layerCommandProfile(cdp, id);
    console.log(`  +layer ${id}: n=${prof.n} [${prof.top.map((c) => `${c[0]}×${c[1]}`).join(', ')}]`);
  }
  const rep = await retainedDomReport();
  console.log(`  DOM: added=${rep.addedTotal} removed=${rep.removedTotal} liveAdded=${rep.liveCount} canvases=${JSON.stringify(rep.canvases)}`);
  console.log('  带合成触发面的「已加未删」元素：');
  for (const t of rep.triggers.slice(0, 30)) console.log(`    @${t.at} ${t.p} ${t.rect} [${t.tg}]`);
  return S;
};
const S1 = await round('S1(P2 x1)', S0);
const S2 = await round('S2(P2b x2)', S1);
await new Promise((r) => setTimeout(r, 3000));
const S3 = await layerIdSnapshot(cdp);
console.log(`\nS3(settled): ids=${S3.length} new=[${S3.filter((x) => !S2.includes(x)).join(',')}]`);
try { await cdp.detach(); } catch { /* ignore */ }
await browser.close();
console.log('DONE');
