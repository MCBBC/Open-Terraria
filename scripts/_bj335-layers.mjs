// ★BJ335 层主定位:进/退两轮,dump LayerTree 层→backendNodeId→DOM 节点身份,
//  对比两轮层集合差 → 谁在每轮新增 3 层
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp0 = await page.createCDPSession();
const poll = async (expr, ms) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await page.evaluate(expr); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 500)); } };
const WORLD = () => !!(window).__swGame && !!(window).__swGame.world && !!(window).__swGame.liquid;
async function snapshotLayers() {
  const cdp = await page.createCDPSession();
  await cdp.send('DOM.enable').catch(() => {});
  await cdp.send('LayerTree.enable');
  const layers = await new Promise((res) => {
    const iv = setTimeout(() => res(null), 3000);
    cdp.once('LayerTree.layerTreeDidChange', (e) => { clearTimeout(iv); res(e.layers ?? []); });
  });
  try { await cdp.send('LayerTree.disable'); } catch {}
  try { await cdp.detach(); } catch {}
  return layers;
}
function identOfLayer(l, doc) {
  if (!l.backendNodeId) return `(no-node id=${l.layerId})`;
  const found = findByBackend(doc, l.backendNodeId);
  return found ?? `beid=${l.backendNodeId}`;
}
function findByBackend(node, beid) {
  if (node.backendNodeId === beid) {
    const attrs = node.attributes ?? [];
    let cls = '', id = '';
    for (let i = 0; i < attrs.length; i += 2) { if (attrs[i] === 'class') cls = attrs[i + 1]; if (attrs[i] === 'id') id = attrs[i + 1]; }
    return `${node.nodeName}${id ? '#' + id : ''}${cls ? '.' + cls.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  }
  for (const c of (node.children ?? [])) { const r = findByBackend(c, beid); if (r) return r; }
  for (const c of (node.shadowRoots ?? [])) { const r = findByBackend(c, beid); if (r) return r; }
  return null;
}
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
if (!await poll(WORLD, 300000)) throw new Error('enter 超时');
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__swFlow.quitToMenu());
if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit 超时');
await new Promise((r) => setTimeout(r, 1500));
const l1 = await snapshotLayers();
console.log('round1 layers =', l1.length);
// 第二轮
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
if (!await poll(WORLD, 300000)) throw new Error('reenter 超时');
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__swFlow.quitToMenu());
if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit2 超时');
await new Promise((r) => setTimeout(r, 1500));
const l2 = await snapshotLayers();
console.log('round2 layers =', l2.length);
// 两轮层身份
const cdp = await page.createCDPSession();
await cdp.send('DOM.enable').catch(() => {});
const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
const desc1 = new Map(l1.map((l) => [identOfLayer(l, root), l.layerId]));
console.log('\nround2 层身份(与 round1 差分):');
for (const l of l2) {
  const id = identOfLayer(l, root);
  const isNew = !desc1.has(id);
  console.log(`  ${isNew ? '★NEW ' : '     '}layer=${l.layerId} ${id}`);
}
await browser.close();
process.exit(0);
