// 一次性:蓄力态层级实照——按住鼠标蓄力,截蓄力冰矛与角色的层序
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
  g.input.mouseX = sx + 60; g.input.mouseY = sy - 60;
  g.input.mouseDown = true; g.input.mouseHeld = true;
});
await sleep(2000);   // 蓄力中(charge≈60 满档,远超旧 24t swing 窗)
const crop = await p.evaluate(() => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  return { x: Math.max(0, Math.round(sx - 70)), y: Math.max(0, Math.round(sy - 90)), width: 140, height: 150 };
});
await p.screenshot({ path: '/tmp/mooncloud-probe/gf-charging-full.png', clip: crop });
const st = await p.evaluate(() => {
  const g = window.__swGame;
  const orbs = (g.entities?.all?.() ?? []).filter((e) => e && e.projId === 1115);
  return { n: orbs.length, charge: orbs[0] ? +orbs[0].charge?.toFixed?.(1) : null };
});
console.log('CHARGING:', JSON.stringify(st));
await b.close();
