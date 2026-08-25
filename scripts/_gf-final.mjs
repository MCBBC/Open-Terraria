// 一次性:冰川之牙终验——__swItems 反查内部索引,真实 def 触发,验证举杖朝鼠标+在身体之上
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1000);
await p.evaluate(() => {
  const g = window.__swGame;
  const idx = window.__swItems['vi_6153_GlacierFang'];
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.player.inv.selected = 0;
  g.player.mana = 200; g.player.baseMaxMana = 200;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  g.input.mouseX = sx + 60;
  g.input.mouseY = sy - 60;
  const def = window.__swITEM_DEFS[idx];
  g.useSwing(def, -0.6);   // 朝右上举
  return { idx, held: g.player.inv.heldItem()?.id, key: def.key };
});
await sleep(80);
const mid = await p.evaluate(() => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  return {
    swing: g.swing ? { t: g.swing.t, us: g.swing.useStyle, aim: g.swing.aim } : null,
    crop: { x: Math.max(0, Math.round(sx - 70)), y: Math.max(0, Math.round(sy - 90)), width: 140, height: 150 }
  };
});
console.log('MID:', JSON.stringify(mid.swing));
await p.screenshot({ path: '/tmp/mooncloud-probe/gf-final2.png', clip: mid.crop });
await b.close();
console.log('DONE');
