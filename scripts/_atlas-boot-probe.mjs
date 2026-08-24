// 探针：atlas 启动预载收窄（2026-08-24 用户报"菜单加载 地形/Tiles_0"）。
//  1. 菜单期：零 地形/角色/封面 请求（URL 编码 %E5%9C%B0%E5%BD%A2/%E8%A7%92%E8%89%B2/%E5%B0%81%E9%9D%A2）
//  2. 进世界（?play=small）：地形 表照常预载（preloadMaplesWorld），世界渲染无异常
//  3. 全程零页面错误
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
const hits = { menu: [], world: [] };
let phase = 'menu';
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
page.on('request', (r) => {
  const u = decodeURIComponent(r.url());
  if (/sprites\/(地形|角色|封面)\//.test(u)) hits[phase].push(u.split('/sprites/')[1]);
});

await page.goto(origin, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
const menuTitle = await page.evaluate(() => !!document.querySelector('.sw-title-menu'));

phase = 'world';
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
// 等世界真正进入（快捷栏 HUD 出现 = worldgen+预载完成），再稳 4s 让首烘落地
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const inWorld = await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false);
  if (inWorld && i > 10) break;
}
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: '/tmp/atlas-world.png' });
// 世界期断言用 atlas.images 句柄（权威——网络监听受 HTTP 缓存/时序干扰）
const worldState = await page.evaluate(() => {
  const a = window.__swAtlas;
  const imgs = a ? [...a.images.keys()] : [];
  return {
    maplesLoaded: imgs.filter((k) => k.startsWith('地形/') || k.startsWith('角色/')).length,
    hasCanvas: !!document.querySelector('canvas'),
  };
}).catch(() => ({ maplesLoaded: 0, hasCanvas: false }));

console.log(JSON.stringify({
  menuTitle,
  menuTerrainHits: hits.menu,
  worldTerrainHits: [...new Set(hits.world)].slice(0, 20),
  worldTerrainCount: new Set(hits.world).size,
  errs: errs.slice(0, 4),
}, null, 1));

const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
A(menuTitle, '标题菜单未出现');
A(hits.menu.length === 0, `菜单期仍有 Maples 素材请求: ${hits.menu.slice(0, 5)}`);
A(worldState.maplesLoaded >= 15, `进世界未预载 Maples 表(应 15 张): ${worldState.maplesLoaded}`);
A(errs.length === 0, `页面异常: ${errs[0] ?? ''}`);
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
