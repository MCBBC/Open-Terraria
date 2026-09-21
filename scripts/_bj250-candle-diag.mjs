import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5243';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await sleep(2500);
await page.waitForFunction(() => {
  const p = window.__swGame?.player;
  return p && Math.abs(p.vy) < 0.05 && Math.abs(p.vx) < 0.05;
}, { timeout: 30000, polling: 200 }).catch(() => {});
await sleep(400);
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const t = window.__swTiles['candle'];
  const ptx = Math.floor(g.player.cx / 16), pty = Math.floor((g.player.y + g.player.h) / 16);
  window.__c = { tx: ptx + 4, ty: pty - 1 };
  window.__log = [];
  // 破坏面插桩：breakTile/KillTile 谁杀了蜡烛
  const ob = g.breakTile.bind(g);
  g.breakTile = (x, y, a, b, c) => {
    const { tx, ty } = window.__c;
    if (x === tx && y === ty) window.__log.push(['breakTile', new Error().stack.split('\n').slice(2, 6).map((s) => s.trim().replace(/^at /, '').replace(/:\d+:\d+$/, '')).join(' <- ')]);
    return ob(x, y, a, b, c);
  };
});
// 放置
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const { tx, ty } = window.__c;
  const t = window.__swTiles['candle'];
  const stone = window.__swTiles['stone'];
  for (let c = -1; c <= 1; c++) st.setTileSilent(tx + c, ty + 1, stone, 0, 0);
  st.setTileSilent(tx, ty, t, 0, 0);
});
for (let i = 0; i < 10; i++) {
  const s = await page.evaluate(() => {
    const { tx, ty } = window.__c;
    const st = window.__swGame.world.store;
    return `${st.get(tx, ty)}/${st.hasTile(tx, ty) ? 'act' : 'dead'}/${st.get(tx, ty + 1)}`;
  });
  console.log(`t+${i * 200}ms candle=${s}`);
  await sleep(200);
}
// 真右键点击蜡烛
const pos = await page.evaluate(() => {
  const { tx, ty } = window.__c;
  const [sx, sy] = window.__swGame.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
  return { sx, sy };
});
await page.mouse.move(pos.sx, pos.sy); await sleep(150);
await page.mouse.down({ button: 'right' }); await sleep(200);
await page.mouse.up({ button: 'right' }); await sleep(400);
for (let i = 0; i < 5; i++) {
  const s = await page.evaluate(() => {
    const { tx, ty } = window.__c;
    const st = window.__swGame.world.store;
    return `${st.get(tx, ty)}/${st.hasTile(tx, ty) ? 'act' : 'dead'}/fx=${st.frameX[st.idx(tx, ty)]}`;
  });
  console.log(`post-click+${i * 150}ms candle=${s}`);
  await sleep(150);
}
console.log('log', JSON.stringify(await page.evaluate(() => window.__log)));
console.log('errs', errs);
await browser.close();
