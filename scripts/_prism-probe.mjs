// _prism-probe:终极棱镜(3541→633)两问题实测
// ① 聚能音:AI_075 633 支 Item15 每 20t 循环(1457 :67647-67655)——挂 playSfxFiles 计数
// ② 晶体贴图:633 drawLayer=7(PlayerDrawLayers.cs:3154)原版在【玩家绘制层组内】
//    DrawPlayer_27_HeldItem 记 projectileDrawPosition → RenderAllLayers 在持物层位置
//    插入 DrawHeldProj(:4318) = 画在玩家身体【前】。本仓 PrismProj.draw 走实体循环
//    (Renderer 实体循环先于 drawPlayer)= 画在玩家身后被纸娃娃盖住 → 用户报"身上没棱镜"。
// 探针:挂 playSfxFiles 计数 Item_15 + 捕获 Projectile_633 drawImage + 充能期截图。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 900000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.evaluateOnNewDocument(() => {
  // 晶体贴图打标(经 upgradeToBitmap 升级)
  const origCib = window.createImageBitmap?.bind(window);
  if (origCib) {
    window.createImageBitmap = (...args) => origCib(...args).then((bmp) => {
      try {
        const src = args[0]?.currentSrc || args[0]?.src || '';
        if (/Projectile_633\.png/.test(src)) bmp.__swPrism = true;
      } catch { /* ignore */ }
      return bmp;
    });
  }
  const orig = CanvasRenderingContext2D.prototype.drawImage;
  const cap = [];
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
    try {
      const src = img.currentSrc || img.src || '';
      if (/Projectile_633\.png/.test(src) || img.__swPrism) {
        cap.push({ w: img.width ?? img.naturalWidth, h: img.height ?? img.naturalHeight, n: rest.length });
        if (cap.length > 200) cap.shift();
      }
    } catch { /* ignore */ }
    return orig.call(this, img, ...rest);
  };
  window.__prismCap = cap;
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 120000, polling: 500 });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 800000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

const run = await page.evaluate(async () => {
  const g = window.__swGame;
  const log = { sfx: [], prismSpawned: false, charge: [], dead: false };
  // 挂 playSfxFiles 计数
  const origSfx = g.playSfxFiles.bind(g);
  window.__origSfx = origSfx;
  g.playSfxFiles = (files, ...rest) => {
    if (files.includes('Item_15')) log.sfx.push(Date.now());
    return origSfx(files, ...rest);
  };
  // 给棱镜并按住
  const key = Object.keys(window.__swItems).find((k) => /^vi_3541_/.test(k));
  if (!key) return { err: 'no vi_3541 key' };
  const p = g.player;
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0;
  p.mana = p.manaMax ?? 100;
  p.useTime = 0;
  g.input.mouseDown = true;   // 边沿(触发 use)
  g.input.mouseHeld = true;   // 电平(channelCb 存活门——缺则棱镜出生即死)
  g.input.mouseX = g.renderer.canvas.width / 2 + 120;
  g.input.mouseY = g.renderer.canvas.height / 2 - 60;
  // 采样 charge(2.5s)
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const pr = g.entities.projectiles.find((q) => q.constructor.name === 'PrismProj');
    if (pr) {
      log.prismSpawned = true;
      log.charge.push(Math.round(pr.charge));
      log.dead = pr.dead;
    }
  }
  window.__prismLog = log;
  return log;
});
await page.screenshot({ path: '/tmp/prism-channel.png' });
const run2 = await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseDown = false;
  const log = window.__prismLog;
  log.crystal = window.__prismCap.length;
  log.crystalSample = window.__prismCap[0] ?? null;
  g.playSfxFiles = window.__origSfx;
  return { crystal: log.crystal, crystalSample: log.crystalSample };
});
console.log('实测:', JSON.stringify({ ...run, crystal: run2.crystal, crystalSample: run2.crystalSample }, null, 1));
const expectSfx = run.sfx?.length ?? 0;
console.log(`${expectSfx >= 5 ? 'PASS' : 'FAIL'}: 充能音 Item_15 播放 ${expectSfx} 次(2.5s 充能预期 ≥5)`);
const cr = run2.crystal ?? 0;
console.log(`${cr > 0 ? 'PASS' : 'FAIL'}: 晶体 Projectile_633 绘制 ${cr} 次(>0=有画,但层级在玩家身后=被盖)`);
if (errors.length) console.log('[pageerror]', errors.slice(0, 3).join(' | '));
await browser.close();
