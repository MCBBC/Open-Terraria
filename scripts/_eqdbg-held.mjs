// 一次性:第八批验证(天气/时间入格 2×4/坞格半透/面板贴视觉底/染料同排)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await page.waitForFunction(() => window.__swUI?.quickStackBtn, { timeout: 60000, polling: 200 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  [...document.body.children].filter((d) => d.tagName === 'DIV' && d.style?.position === 'fixed'
    && d.textContent?.includes('欢迎来到 SandboxWorld')).forEach((d) => d.remove());
  try { window.__swUI.openInventory(); } catch {}
});
await new Promise((r) => setTimeout(r, 400));
const out = await page.evaluate(() => {
  const ui = window.__swUI, panel = document.querySelector('.sw-panel');
  const cluster = ui.quickStackBtn.parentElement;
  const cells = [...cluster.children].filter((c) => c.tagName === 'BUTTON').map((c) => c.title);
  // 2×4:8 钮
  const gridW = Math.round(cluster.getBoundingClientRect().width);
  const g10 = panel.querySelector('.sw-invgrid .sw-slot[data-idx="10"]').getBoundingClientRect();
  const slots = [...document.querySelectorAll('.sw-hotbar .sw-slot')];
  let best = null, bestL = Infinity;
  for (const s of slots) { const l = parseFloat(s.style.left); if (Number.isFinite(l) && l < bestL) { bestL = l; best = s; } }
  const hbBottom = best.getBoundingClientRect().bottom;
  // 坞格半透
  const dock = document.querySelector('.sw-eqdock');
  const aSlot = dock.querySelector('.sw-slot[data-idx="0"][data-where="armor"]');
  const aAfter = getComputedStyle(aSlot, '::after');
  const dyeSlot = dock.querySelector('.sw-slot[data-idx="0"][data-where="dye"]');
  const dAfter = dyeSlot ? getComputedStyle(dyeSlot, '::after') : null;
  // 染料同排:misc[0] 与 miscDye[0] 同行
  const m0 = dock.querySelector('.sw-slot[data-idx="0"][data-where="misc"]')?.getBoundingClientRect();
  const md0 = dock.querySelector('.sw-slot[data-idx="0"][data-where="miscDye"]')?.getBoundingClientRect();
  return {
    gridButtons: cells,
    gridW,
    panelGapToHotbar: Math.round(g10.top - hbBottom),   // 面板首内容-热键栏视觉底(期望≈2)
    dockArmorAfterOpacity: aAfter.opacity,
    dockArmorAfterBg: aAfter.backgroundImage.includes('Back13'),
    dockArmorBlend: aAfter.backgroundBlendMode,
    dyeAfterBg: dAfter ? dAfter.backgroundImage.includes('Back13') : null,
    miscDyeAligned: m0 && md0 ? Math.abs(m0.top - md0.top) < 3 : 'missing',
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('ERRS', JSON.stringify(errs.slice(0, 3)));
await page.screenshot({ path: 'shots/batch8-final.png' });
await browser.close();
