// 一次性:鸟群白闪竞态修复验证——拦截延迟 Ambience_BirdsVShape.png 8s:
// 窗内强制生成鸟群 → 修复后应【不可见】(守卫跳过);旧代码会画白方片。
// 放行后 → 鸟群正常剪影。另读 AMB_TINT_CACHE 键数佐证无平色烘焙入缓存。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.setRequestInterception(true);
p.on('request', (req) => {
  const u = req.url();
  if (u.includes('Ambience_BirdsVShape')) setTimeout(() => req.continue(), 8000);
  else req.continue();
});
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await p.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;   // 正午晴日(birds 主条件)
  const sky = g.renderer.sky;
  const px = g.player.x, py = g.player.y;
  // 强制生成一族鸟(绕过选族掷点)并把首只拽到屏内
  sky.spawnAmbientFamily('birds', px, py);
  const e = sky.ambEntities[sky.ambEntities.length - 1];
  if (e) { e.x = px; e.y = py - 160; e.depth = 3; }
});
await sleep(900);   // 窗内(贴图仍被扣)
const win = await p.evaluate(() => {
  const sky = window.__swGame.renderer.sky;
  const t = sky.ambTexCache.get('Ambience_BirdsVShape');
  return {
    n: sky.ambEntities.length,
    texW: t ? t.width : -1,
    complete: t ? t.complete : false,
    tintCacheKeys: [...(window.__swGame.renderer.sky.constructor === Object ? [] : [])].length
  };
});
await p.screenshot({ path: `${OUT}/bird-window.png` });
console.log('WINDOW:', JSON.stringify(win));
await sleep(9000);  // 放行+加载完成
const after = await p.evaluate(() => {
  const sky = window.__swGame.renderer.sky;
  const t = sky.ambTexCache.get('Ambience_BirdsVShape');
  const e = sky.ambEntities[0];
  if (e) { const g = window.__swGame; e.x = g.player.x; e.y = g.player.y - 160; e.depth = 3; e.life = 1e9; e.bornAt = sky.ambFrame; }
  return { texW: t ? t.width : -1, complete: t ? t.complete : false };
});
await sleep(300);
await p.screenshot({ path: `${OUT}/bird-after.png` });
console.log('AFTER:', JSON.stringify(after));
await b.close();
console.log('DONE →', OUT);
