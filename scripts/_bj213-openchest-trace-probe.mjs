// ★BJ213 探针第三波：ui.openChest 被谁清了（accessor 拦截 + 堆栈捕获）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(ORIGIN + '/?play=small&bj213c' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) throw new Error('未进游戏');
await new Promise((r) => setTimeout(r, 9000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const { invIndexOfVanilla } = await import('/src/data/vanillaRecipes.ts');
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  g.world.flags.hardMode = true;
  const st = g.world.store;
  const tx = Math.round(g.player.cx / 16) + 100, ty = Math.round(g.player.cy / 16) - 30;
  const fx = 28 * 36;
  st.setTile(tx, ty, TILE_BY_KEY['chest'], fx, 0);
  st.setTile(tx + 1, ty, TILE_BY_KEY['chest'], fx + 18, 0);
  st.setTile(tx, ty + 1, TILE_BY_KEY['chest'], fx, 18);
  st.setTile(tx + 1, ty + 1, TILE_BY_KEY['chest'], fx + 18, 18);
  const chestData = { x: tx, y: ty, items: new Array(10).fill(null) };
  g.world.chests.push(chestData);

  // accessor 拦截 ui.openChest 写入（含 null 清除）抓堆栈
  const writes = [];
  let curVal = ui.openChest;
  Object.defineProperty(ui, 'openChest', {
    configurable: true,
    get() { return curVal; },
    set(v) {
      writes.push({
        v: v ? `chest@${v.x},${v.y}` : 'null',
        stack: (new Error().stack ?? '').split('\n').slice(2, 6).map((s) => s.trim()).join(' | '),
      });
      curVal = v;
    },
  });

  const steps = [];
  try { ui.openChestPanel(chestData); } catch (e) { steps.push('openChestPanel-throw: ' + e.message); }
  steps.push(`t0: openChest=${curVal ? curVal.x : 'null'} inv=${ui.invPanel.style.display}`);
  await new Promise((r) => setTimeout(r, 60));
  steps.push(`t60: openChest=${curVal ? curVal.x : 'null'} inv=${ui.invPanel.style.display}`);
  await new Promise((r) => setTimeout(r, 200));
  steps.push(`t260: openChest=${curVal ? curVal.x : 'null'} inv=${ui.invPanel.style.display}`);
  return { steps, writes: writes.slice(0, 12), layout: ui._builtLayout, openChestPanelSrc: String(ui.openChestPanel).slice(0, 400) };
});

console.log(JSON.stringify(out, null, 1));
console.log('pageerrors:', JSON.stringify(errors));
await browser.close();
