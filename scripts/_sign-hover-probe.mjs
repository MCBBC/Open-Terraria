// 标牌悬停文字验证：放标牌 + setSignText 写文 → 悬停截图 + dump signHoverText
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });

// 菜单可能被资产门/HMR 重挂:点 sp 重试至 .sw-vsel 出现
for (let i = 0; i < 10; i++) {
  try {
    await page.waitForSelector('[data-act=sp]', { timeout: 10000 });
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp click failed 10x'); }
}
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('标牌');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
}
await new Promise((r) => setTimeout(r, 2000));
// 关欢迎弹窗
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const ok = btns.find((b) => /我知道了/.test(b.textContent || ''));
  if (ok) ok.click();
  const heads = [...document.querySelectorAll('div')].filter((d) => /欢迎来到 SandboxWorld/.test(d.textContent || '') && d.children.length > 0);
  for (const h of heads) { let el = h; while (el.parentElement && el.parentElement !== document.body) el = el.parentElement; el.remove(); }
});
await new Promise((r) => setTimeout(r, 1000));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const SIGN = window.__swTiles['v_55_signs'];
  if (!SIGN) return { fail: 'no sign key' };
  // 放标牌在玩家前方（清区域 + 放地板 + 放标牌）
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  const sx = px + 3, sy = py - 1;
  for (let y = sy - 2; y <= sy + 1; y++) for (let x = sx; x < sx + 2; x++) st.setTile(x, y, 0);
  for (let x = sx - 2; x < sx + 4; x++) st.setTile(x, sy + 1, window.__swTiles['v_1_dirt'] ?? 1, 0, 0);
  st.setTile(sx, sy, SIGN, 0, 0);
  st.setTile(sx + 1, sy, SIGN, 18, 0);
  st.setTile(sx, sy + 1, SIGN, 0, 18);
  st.setTile(sx + 1, sy + 1, SIGN, 18, 18);
  // 写文字（先懒建牌项——setSignText 只写已有项，等价 openSignEditor 懒建路径）
  if (!g.world.signs.find((sg) => sg.x === sx && sg.y === sy)) g.world.signs.push({ x: sx, y: sy, text: '' });
  g.setSignText(sx, sy, 'Hello World! 这是一块标牌。');
  for (let i = 0; i < 30; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  // 屏幕坐标换算（camera.toScreen 或手算）：标牌中心格
  const scx = (sx + 1) * 16 * g.camera.zoom - g.camera.x * g.camera.zoom + 640;
  const scy = (sy + 1) * 16 * g.camera.zoom - g.camera.y * g.camera.zoom + 400;
  return await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve({ done: true })));
  }) && (() => {
    return { screen: { scx, scy }, zoom: g.camera.zoom, camx: g.camera.x, camy: g.camera.y };
  })();
});
console.log(JSON.stringify(res));
if (!res || res.fail) { await browser.close(); process.exit(1); }
// 用真实鼠标事件移动到标牌上
await page.mouse.move(res.screen.scx, res.screen.scy);
await new Promise((r) => setTimeout(r, 1500));   // 悬停延迟窗口
await page.screenshot({ path: '/tmp/sign-hover.png' });
const check = await page.evaluate(() => ({ hover: window.__swGame.renderer.signHoverText ?? null }));
console.log(JSON.stringify(check));
await browser.close();
console.log(check.hover ? '✅ 标牌悬停文本生效' : '❌ 悬停文本未出现');
process.exit(check.hover ? 0 : 1);
