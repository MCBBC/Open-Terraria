// 复现"进图全部贴图失效":进图后检查 vimages 关键表是否就位 + chunk 烘焙内容 + 控制台
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR: ' + String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type().toUpperCase() + ': ' + m.text().slice(0, 200)); });
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
try {
  await page.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
} catch { console.log('世界未就绪'); }
await new Promise(r => setTimeout(r, 3000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  if (!g) return { noGame: true };
  const a = g.atlas;
  // 关键表抽查:泥土/石/草的 vanilla sheet + 墙表
  const BK = window.__swTiles;
  const check = (name) => {
    const id = BK[name];
    const d = id !== undefined ? window.__swTileDefs?.[id] : null;
    const sheet = d?.vanilla?.sheet;
    const file = sheet !== undefined ? a.vanilla.tiles[String(sheet)]?.sheet : null;
    return { name, id, sheet, file, loaded: file ? a.vimages.has(file) : false };
  };
  return {
    vimages: a.vimages.size,
    spawn: [g.world.spawnX, g.world.spawnY],
    dirt: check('dirt'), stone: check('stone'), grass: check('grass'),
    chunks: g.chunks.chunks.size,
    dirtyQueue: g.chunks.dirtyQueue.length,
    hook: !!a.onVImageLoaded,
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('页面错误/警告:', errs.slice(0, 5));
await browser.close();
