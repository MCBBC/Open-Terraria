// 连发尾焰尘计数探针:多角度连发火箭,统计 dust 池占用+每发尾焰(13/31)生成计数
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => window.__swFlow.newWorld('42424242', 4200, 1200));
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 300000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  p.inv.slots.fill(null);
  p.inv.slots[0] = { id: ITEM_BY_KEY['vi_759_火箭发射器'], stack: 99 };
  p.inv.slots[1] = { id: ITEM_BY_KEY['vi_773_火箭三型'], stack: 99 };
  p.inv.selected = 0;
  p.x = 4200 * 8; p.y = 500; p.vx = 0; p.vy = 0;
  // 清出空间
  const st = g.world.store;
  const DIRT = window.__swTileByKey('v_2_dirt') ?? 1;
  const ptx = Math.floor(p.cx / 16), pty = Math.floor(p.y / 16 + 3);
  for (let x = ptx - 30; x <= ptx + 30; x++) {
    for (let y = pty - 60; y < pty; y++) st.setTile(x, y, 0);
    st.setTile(x, pty, DIRT);
  }
  g.cb.onInventoryChanged();
  await new Promise(r => setTimeout(r, 800));
  // 包装 spawnDust 计数 13/31
  const counts = { d13: 0, d31: 0, nullDrops: 0, pool: [] };
  const orig = g.spawnDust.bind(g);
  g.spawnDust = function (x, y, w, h, type, ...rest) {
    const d = orig(x, y, w, h, type, ...rest);
    if (type === 13) counts.d13++;
    if (type === 31) counts.d31++;
    if (!d) counts.nullDrops++;
    return d;
  };
  // 多角度连发:8 发,每 24t 换角度(向上→右上→右→右下…)
  const angles = [-Math.PI / 2, -Math.PI / 3, -Math.PI / 6, 0, Math.PI / 6, Math.PI / 3, Math.PI / 2, -Math.PI / 2];
  const perShot = [];
  for (let i = 0; i < 8; i++) {
    const a = angles[i % angles.length];
    const [sx, sy] = g.camera.worldToScreen(p.cx + Math.cos(a) * 200, p.cy + Math.sin(a) * 200);
    g.input.mouseX = sx; g.input.mouseY = sy;
    const d0 = counts.d13, f0 = counts.d31;
    g.input.mouseDown = true;
    await new Promise(r => setTimeout(r, 60));
    g.input.mouseDown = false;
    await new Promise(r => setTimeout(r, 400));
    perShot.push({ shot: i, d13: counts.d13 - d0, d31: counts.d31 - f0 });
  }
  // 池占用(读 vanillaDust 内部)
  let poolInfo = 'n/a';
  try {
    const vd = g.vanillaDust;
    const arr = vd?.dusts ?? vd?.pool ?? null;
    if (arr && arr.length !== undefined) poolInfo = `${arr.filter(x => x && x.active !== false && x.type !== undefined).length}/${arr.length}`;
  } catch (e) { poolInfo = 'err:' + e.message.slice(0, 60); }
  return { perShot, totals: { d13: counts.d13, d31: counts.d31, nullDrops: counts.nullDrops }, poolInfo };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
