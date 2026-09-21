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
await sleep(900);
await page.evaluate(() => {
  document.getElementById('sw-welcome-announce')?.remove();
  const g = window.__swGame;
  window.__calls = [];
  const oia = g.interactAt.bind(g);
  g.interactAt = (tx, ty) => { window.__calls.push([tx, ty, g.input.rightDown]); return oia(tx, ty); };
  for (const npc of [...(g.entities?.npcs ?? [])]) { try { npc.x = g.player.x + 3000; } catch {} }
});
const setup = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const t = window.__swTiles['v_215_campfires'];
  const ptx = Math.floor(g.player.cx / 16), pty = Math.floor((g.player.y + g.player.h) / 16);
  const ax = ptx + 4, ay = pty - 1;
  for (let c = 0; c < 3; c++) for (let r = 0; r < 2; r++) st.setTileSilent(ax + c, ay + r, t, c * 18, r * 18);
  window.__s = { ax, ay };
  const [sx, sy] = g.camera.worldToScreen((ax + 1) * 16 + 8, (ay + 1) * 16 + 8);
  return { sx, sy };
});
const click = async () => {
  await page.mouse.move(setup.sx, setup.sy); await sleep(120);
  await page.mouse.down({ button: 'right' }); await sleep(220);
  await page.mouse.up({ button: 'right' }); await sleep(350);
  return page.evaluate(() => {
    const { ax, ay } = window.__s;
    const st = window.__swGame.world.store;
    return { calls: window.__calls.splice(0), fyTop: st.frameY[st.idx(ax, ay)], rightDown: window.__swGame.input.rightDown };
  });
};
console.log('click1', JSON.stringify(await click()));
console.log('click2', JSON.stringify(await click()));
console.log('click3', JSON.stringify(await click()));
console.log('errs', errs);
await browser.close();
