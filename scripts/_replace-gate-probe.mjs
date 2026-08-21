// 替换镐门 E2E:无镐不换;有镐多击积累后换。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 150)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const st = g.world.store;
  const idOf = (re) => { const k = Object.keys(window.__swItems).find((k) => re.test(k)); return k ? window.__swItems[k] : -1; };
  const dirt = idOf(/^vi_2_/);
  const pick = idOf(/^vi_3509_/);
  const heldDef = () => window.__swITEMS[pl.inv.slots[pl.inv.selected].id];
  const findGrass = () => {
    for (let dx = -40; dx < 40; dx++) {
      const tx = Math.floor(pl.cx / 16) + dx;
      for (let dy = -4; dy < 12; dy++) {
        if (st.get(tx, Math.floor(pl.y / 16) + dy) === 2) return [tx, Math.floor(pl.y / 16) + dy];
      }
    }
    return null;
  };
  const out = {};
  // 场景1:无镐
  pl.inv.slots[10] = null;
  pl.inv.slots[pl.inv.selected] = { id: dirt, stack: 99 };
  g.cb.onInventoryChanged();
  let grass = findGrass();
  if (!grass) return { err: 'no grass' };
  let [gx, gy] = grass;
  for (let i = 0; i < 3; i++) g['tryPlace'](gx, gy, heldDef());
  out.noPick = st.get(gx, gy);
  // 场景2:铜镐在包,4 次直接调 tryPlace(每击 35 积累,3 击到 105≥100)
  pl.inv.slots[10] = { id: pick, stack: 1 };
  g.cb.onInventoryChanged();
  grass = findGrass();
  [gx, gy] = grass ?? [gx, gy];
  const seq = [];
  for (let i = 0; i < 4; i++) {
    g['tryPlace'](gx, gy, heldDef());
    seq.push(st.get(gx, gy));
    if (st.get(gx, gy) !== 2) break;
  }
  out.withPickSeq = seq;
  out.final = st.get(gx, gy);
  return out;
});
console.log(JSON.stringify(out));
await browser.close();
