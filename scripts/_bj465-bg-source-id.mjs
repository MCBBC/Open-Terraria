// ★BJ465 mini2：背景绿叶尘身份定谳——spawnTileDustAt wrap 记被杀格 tile sheet/上下文
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1500));
}
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if (/我已知晓|我知道了/.test(b.textContent || '')) { b.click(); break; }
});
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  g.__w = { log: [], TD: TILE_DEFS };
  if (!g.__wwrap) {
    const orig = g.spawnTileDustAt.bind(g);
    g.spawnTileDustAt = function (x, y, fail, src, applyGates) {
      const st = g.world.store;
      const sheet = TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet ?? -1;
      const wall = st.wall?.[st.idx(x, y)] ?? -1;
      g.__w.log.push({ x, y, sheet, fail: !!fail, dust2: true });
      return orig(x, y, fail, src, applyGates);
    };
    g.__wwrap = true;
  }
});
await new Promise((r) => setTimeout(r, 6000));   // 6s 采样
const res = await page.evaluate(() => {
  const L = window.__swGame.__w.log;
  const bySheet = {}, byFail = {};
  for (const e of L) {
    bySheet[e.sheet] = (bySheet[e.sheet] || 0) + 1;
    const k = e.fail ? 'fail' : 'break';
    byFail[k] = (byFail[k] || 0) + 1;
  }
  // 找出出尘格的 wall 类型分布（藤蔓/草丛死于墙后?）
  const g = window.__swGame;
  const samples = L.slice(-12).map((e) => {
    const st = g.world.store;
    const i = st.idx(e.x, e.y);
    const TD = window.__swGame.__w.TD;
    return { ...e, wall: st.wall?.[i], liquid: st.liquid?.[i], lt: st.liquidType?.[i], below: TD[st.type[st.idx(e.x, e.y + 1)]]?.vanilla?.sheet ?? -1 };
  });
  return { total: L.length, bySheet, byFail, samples };
});
console.log('6s KillTile 尘位次: total=', res.total, 'sheet谱=', JSON.stringify(res.bySheet), '档=', JSON.stringify(res.byFail));
console.log('样本(尾12):', JSON.stringify(res.samples, null, 1));
console.log('pageerrors=', errors.length, errors.slice(0, 3));
await browser.close();
process.exit(0);
