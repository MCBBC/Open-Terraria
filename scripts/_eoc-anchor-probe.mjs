// EoC(4) 锚点验证探针：夜间召唤克苏鲁之眼，用 drawImage 间谍抓本体绘制矩形
// 与物理盒对比 → 修复前（eocOff +23/+30 下移）中心偏 +26px；修复后应 = 盒中心。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const out = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const world = new World(200, 120, 777, 'eoc-anchor');
  for (let x = 0; x < 200; x++) for (let y = 71; y < 120; y++) world.store.setTile(x, y, 1);
  for (let x = 0; x < 200; x++) world.store.setTile(x, 70, 3);
  world.clock.time = 50000;   // 夜间（EoC 召唤门）
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame;
  if (g.player.dead) g.respawnPlayer?.();
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
  }
  g.paused = true;
  // 直接 fromVanilla(4) 生成 EoC（免召唤链）
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const eoc = Enemy.fromVanilla(4, g.player.cx + 200, g.player.cy - 150);
  g.entities.add(eoc, 'enemies');
  for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);
  // 开调试碰撞盒
  g.renderer.debugMode = true;
  // 等 EoC 靠近玩家（AI 悬停段）
  for (let i = 0; i < 120; i++) {
    g.fixedUpdate(1 / 60);
    if (Math.hypot(eoc.cx - g.player.cx, eoc.cy - g.player.cy) < 250) break;
  }
  await new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
  await new Promise((r2) => setTimeout(r2, 300));
  return { eocPos: { cx: Math.round(eoc.cx), cy: Math.round(eoc.cy) }, playerPos: { x: Math.round(g.player.cx), y: Math.round(g.player.cy) } };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/eoc-anchor.png' });
console.log('截图已保存');
await browser.close();
